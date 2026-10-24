import { createKafkaClient, createProducer, EventTypes, KafkaTopics, publishEvent } from '@ecommerce/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CappedPublish } from './eventPublisher';

vi.mock('@ecommerce/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ecommerce/shared')>()),
  createKafkaClient: vi.fn(() => ({ kafka: true })),
  createProducer: vi.fn(),
  publishEvent: vi.fn(),
}));

const connect = vi.mocked(createProducer);
const publish = vi.mocked(publishEvent);
const producer = { producer: true } as any;

const message: CappedPublish = {
  topic: KafkaTopics.ASSISTANT_INTERACTION,
  type: EventTypes.INTERACTION_COMPLETED,
  key: 'conv-1',
  data: { answerId: 'a-1' },
  correlationId: 'corr-1',
  timeoutMs: 5000,
  name: 'Interaction',
};

/** A fresh module per test, so the cached producer does not leak between tests (learnings). */
const load = async () =>
  (await vi.importActual<{ publishCapped: typeof import('./eventPublisher').publishCapped }>('./eventPublisher')).publishCapped;

describe('publishCapped', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    connect.mockResolvedValue(producer);
    publish.mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes to the topic with type, key, data, correlation ID and the given event ID', async () => {
    const publishCapped = await load();
    await publishCapped({ ...message, eventId: 'evt-1' });
    expect(publish.mock.calls).toEqual([
      [producer, KafkaTopics.ASSISTANT_INTERACTION, EventTypes.INTERACTION_COMPLETED, 'conv-1', { answerId: 'a-1' }, 'corr-1', 'evt-1'],
    ]);
  });

  it('leaves the event ID to publishEvent when none is given', async () => {
    const publishCapped = await load();
    await publishCapped(message);
    expect(publish.mock.calls[0]).toHaveLength(6);
  });

  it('uses one producer for every topic, connected once on first use, with the single-attempt limits (D-021)', async () => {
    const publishCapped = await load();
    expect(connect).not.toHaveBeenCalled();
    await publishCapped(message);
    await publishCapped({ ...message, topic: KafkaTopics.ASSISTANT_FEEDBACK, type: EventTypes.ANSWER_RATED });
    await publishCapped({ ...message, topic: KafkaTopics.ASSISTANT_HANDOFF_REQUESTED, type: EventTypes.HANDOFF_REQUESTED });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith({ kafka: true }, { idempotent: false, retry: { retries: 0 } });
    const limits = vi.mocked(createKafkaClient).mock.calls[0][1]!;
    expect(limits.retry).toEqual({ retries: 0 });
    expect(limits.connectionTimeout! + 2 * limits.requestTimeout!).toBeLessThan(5000);
    expect(publish).toHaveBeenCalledTimes(3);
  });

  it('rejects after the cap, naming the publish, when sending never finishes', async () => {
    vi.useFakeTimers();
    const publishCapped = await load();
    publish.mockReturnValue(new Promise(() => undefined));
    const outcome = publishCapped({ ...message, timeoutMs: 300 }).catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(299);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toEqual(new Error('Interaction publish timed out after 300 ms'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when the send succeeds', async () => {
    vi.useFakeTimers();
    const publishCapped = await load();
    await publishCapped(message);
    expect(vi.getTimerCount()).toBe(0);
  });
});
