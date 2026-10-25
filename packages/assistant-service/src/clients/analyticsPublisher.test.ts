/**
 * Fire-and-forget analytics publishing (012, AC-12), on the real capped publisher with a
 * faked KafkaJS send: it never rejects, logs one warning on failure and never retries.
 */
import {
  createProducer,
  EventTypes,
  KafkaTopics,
  publishEvent,
  type AssistantFeedbackData,
  type AssistantInteractionData,
} from '@ecommerce/shared';
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const interaction: AssistantInteractionData = {
  conversationId: 'b0c5d1a2-0a8e-4a3f-9a57-0d0c2e7b9f11',
  answerId: '3f2c9e1a-7b4d-4c8e-9a1f-2d6b5e8c0a47',
  provider: 'openai-compatible',
  model: 'qwen/qwen3-30b-a3b-2507',
  stopReason: 'stop',
  outcome: 'answered',
  tools: [],
  latencyMs: 1200,
  usage: null,
  completedAt: '2026-10-24T12:00:00.000Z',
};
const feedback: AssistantFeedbackData = {
  conversationId: interaction.conversationId,
  answerId: interaction.answerId,
  rating: 'up',
  ratedAt: '2026-10-24T12:01:00.000Z',
};

const fakeLog = () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) as any;

type Module = typeof import('./analyticsPublisher');
const load = async () => vi.importActual<Module>('./analyticsPublisher');

describe('analytics publisher', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    connect.mockResolvedValue(producer);
    publish.mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes an interaction to its topic, keyed by conversation, with a new event ID', async () => {
    const { publishInteraction } = await load();
    await publishInteraction(interaction, 'corr-1', fakeLog());
    expect(publish).toHaveBeenCalledOnce();
    const [, topic, type, key, data, correlationId, eventId] = publish.mock.calls[0];
    expect([topic, type, key, data, correlationId]).toEqual([
      KafkaTopics.ASSISTANT_INTERACTION,
      EventTypes.INTERACTION_COMPLETED,
      interaction.conversationId,
      interaction,
      'corr-1',
    ]);
    expect(eventId).toMatch(UUID);
  });

  it('publishes a rating to the feedback topic, keyed by conversation', async () => {
    const { publishFeedback } = await load();
    await publishFeedback(feedback, 'corr-2', fakeLog());
    const [, topic, type, key, data, correlationId, eventId] = publish.mock.calls[0];
    expect([topic, type, key, data, correlationId]).toEqual([
      KafkaTopics.ASSISTANT_FEEDBACK,
      EventTypes.ANSWER_RATED,
      feedback.conversationId,
      feedback,
      'corr-2',
    ]);
    expect(eventId).toMatch(UUID);
  });

  it('gives each event its own ID', async () => {
    const { publishInteraction } = await load();
    await publishInteraction(interaction, 'corr-1', fakeLog());
    await publishInteraction(interaction, 'corr-1', fakeLog());
    expect(publish.mock.calls[0][6]).not.toBe(publish.mock.calls[1][6]);
  });

  it('logs nothing when the publish succeeds', async () => {
    const { publishInteraction } = await load();
    const log = fakeLog();
    await publishInteraction(interaction, 'corr-1', log);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['the send rejects', () => publish.mockRejectedValue(new Error('KafkaJSConnectionError'))],
    ['connecting fails', () => connect.mockRejectedValue(new Error('broker down'))],
  ])('resolves, sends once and logs one warning with topic and event ID when %s', async (_case, arrange) => {
    arrange();
    const { publishInteraction } = await load();
    const log = fakeLog();
    await expect(publishInteraction(interaction, 'corr-1', log)).resolves.toBeUndefined();
    expect(publish.mock.calls.length).toBeLessThanOrEqual(1); // no retry
    expect(connect).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledOnce();
    const [fields, text] = log.warn.mock.calls[0];
    expect(fields).toEqual({ topic: KafkaTopics.ASSISTANT_INTERACTION, eventId: expect.stringMatching(UUID), error: expect.any(String) });
    expect(text).toMatch(/dropped/i);
  });

  it('resolves after the 5 s cap with one warning when the send never finishes', async () => {
    vi.useFakeTimers();
    publish.mockReturnValue(new Promise(() => undefined));
    const { publishFeedback } = await load();
    const log = fakeLog();
    let settled = false;
    const outcome = publishFeedback(feedback, 'corr-1', log).then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
    expect(publish).toHaveBeenCalledOnce();
    expect(log.warn).toHaveBeenCalledOnce();
    expect(log.warn.mock.calls[0][0]).toMatchObject({ topic: KafkaTopics.ASSISTANT_FEEDBACK, error: expect.stringMatching(/timed out after 5000 ms/) });
  });

  it('puts no payload in the warning (no IDs beyond the event, no text)', async () => {
    publish.mockRejectedValue(new Error('down'));
    const { publishInteraction } = await load();
    const log = fakeLog();
    await publishInteraction(interaction, 'corr-1', log);
    expect(Object.keys(log.warn.mock.calls[0][0]).sort()).toEqual(['error', 'eventId', 'topic']);
  });
});
