import { createKafkaClient, createProducer, EventTypes, KafkaTopics, publishEvent, type HandoffRequestedData } from '@ecommerce/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ecommerce/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ecommerce/shared')>()),
  createKafkaClient: vi.fn(() => ({ kafka: true })),
  createProducer: vi.fn(),
  publishEvent: vi.fn(),
}));

const connect = vi.mocked(createProducer);
const publish = vi.mocked(publishEvent);
const producer = { producer: true } as any;

const data: HandoffRequestedData = {
  reference: 'HO-1A2B3C4D',
  userId: 'u-1',
  conversationId: 'c-1',
  reason: 'customer_request',
  summary: 'Wants a person.',
  requestedAt: '2026-10-23T12:00:00.000Z',
};

/** A fresh module per test, so the cached producer does not leak between tests. */
const load = async () =>
  (await vi.importActual<{ publishHandoff: typeof import('./handoffPublisher').publishHandoff }>('./handoffPublisher'))
    .publishHandoff;

describe('publishHandoff', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    connect.mockResolvedValue(producer);
    publish.mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes to the handoff topic, keyed by the reference, with the correlation ID', async () => {
    const publishHandoff = await load();
    await publishHandoff(data, 'corr-1');
    expect(publish.mock.calls).toEqual([
      [producer, KafkaTopics.ASSISTANT_HANDOFF_REQUESTED, EventTypes.HANDOFF_REQUESTED, data.reference, data, 'corr-1'],
    ]);
    expect(vi.mocked(createKafkaClient).mock.calls[0][0]).toBe('assistant-service-producer');
  });

  it('makes KafkaJS give up on its own inside the 5 s cap, so a timed-out handoff is never delivered later', async () => {
    const publishHandoff = await load();
    await publishHandoff(data, 'corr-1');
    const limits = vi.mocked(createKafkaClient).mock.calls[0][1]!;
    expect(limits.retry).toEqual({ retries: 0 }); // one connection attempt
    expect(connect).toHaveBeenCalledWith({ kafka: true }, { idempotent: false, retry: { retries: 0 } }); // one send attempt
    // One attempt = connect + metadata request + produce request.
    expect(limits.connectionTimeout! + 2 * limits.requestTimeout!).toBeLessThan(5000);
  });

  it('connects the producer once, on first use', async () => {
    const publishHandoff = await load();
    expect(connect).not.toHaveBeenCalled();
    await publishHandoff(data, 'corr-1');
    await publishHandoff(data, 'corr-2');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('retries a failed connection on the next call', async () => {
    const publishHandoff = await load();
    connect.mockRejectedValueOnce(new Error('broker down'));
    await expect(publishHandoff(data, 'corr-1')).rejects.toThrow('broker down');
    await publishHandoff(data, 'corr-2');
    expect(connect).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('gives up after 5 s by default when publishing never finishes', async () => {
    vi.useFakeTimers();
    const publishHandoff = await load();
    publish.mockReturnValue(new Promise(() => undefined));
    const outcome = publishHandoff(data, 'corr-1').catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(4999);
    expect(vi.getTimerCount()).toBe(1); // still waiting
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toEqual(new Error('Handoff publish timed out after 5000 ms'));
  });

  it('gives up after the given cap when connecting never finishes', async () => {
    vi.useFakeTimers();
    const publishHandoff = await load();
    connect.mockReturnValue(new Promise(() => undefined));
    const outcome = publishHandoff(data, 'corr-1', 200).catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(200);
    expect(await outcome).toEqual(new Error('Handoff publish timed out after 200 ms'));
  });

  it('does not leave an unhandled rejection when publishing fails after the cap', async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const publishHandoff = await load();
      let failLate!: (error: Error) => void;
      publish.mockReturnValue(new Promise((_, reject) => (failLate = reject)));
      const outcome = publishHandoff(data, 'corr-1', 100).catch((error: Error) => error);
      await vi.advanceTimersByTimeAsync(100);
      await outcome;
      failLate(new Error('late failure'));
      vi.useRealTimers();
      await new Promise((resolve) => setImmediate(resolve)); // Node reports unhandled rejections after microtasks
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
