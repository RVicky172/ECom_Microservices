/**
 * The chat controller with mocked stores, provider and publishers (012): answer IDs,
 * `done.usage`, the interaction event per finished turn, the transcript's answer IDs
 * and ratings, and the feedback route. No Redis, Kafka or model (testing-strategy rule 5).
 */
import { EventEmitter } from 'events';
import { parseAssistantFeedback, parseAssistantInteraction } from '@ecommerce/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishFeedback, publishInteraction } from '../clients/analyticsPublisher';
import { isConfigured, runAgentTurn } from '../agent/runAgent';
import * as conversations from '../store/conversationStore';
import * as feedbackStore from '../store/feedbackStore';
import { consumeUserMessage } from '../store/usageLimiter';
import { HANDOFF_CORRECTION } from '../agent/handoffGuard';
import { deleteConversation, getConversation, postChat, putFeedback } from './chatController';

vi.mock('../agent/runAgent', () => ({
  provider: {
    id: 'openai-compatible',
    describeModel: () => 'local-model',
    // One bubble per message, like the real providers' transcripts.
    toTranscript: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) =>
      messages.filter((message) => message.content).map((message) => ({ role: message.role, text: message.content })),
    // Like the OpenAI-compatible provider: text goes onto the last assistant message.
    appendReply: (messages: Array<{ role: string; content: string }>, text: string) => [
      ...messages.slice(0, -1),
      { ...messages[messages.length - 1], content: messages[messages.length - 1].content + text },
    ],
  },
  isConfigured: vi.fn(),
  runAgentTurn: vi.fn(),
}));
vi.mock('../store/conversationStore', () => ({
  loadConversation: vi.fn(),
  saveConversation: vi.fn(),
  deleteConversation: vi.fn(),
  acquireTurnLock: vi.fn(),
  releaseTurnLock: vi.fn(),
}));
vi.mock('../store/feedbackStore', () => ({ saveRating: vi.fn(), getRatings: vi.fn(), deleteRatings: vi.fn() }));
vi.mock('../store/usageLimiter', () => ({ consumeUserMessage: vi.fn() }));
vi.mock('../clients/analyticsPublisher', () => ({ publishInteraction: vi.fn(), publishFeedback: vi.fn() }));

const USER = '16be8435-63db-4cd3-9c33-e8de62839df2';
const OTHER_USER = '2a7d9c41-5b3e-4f6a-8c1d-9e0f1a2b3c4d';
const CONV = 'b0c5d1a2-0a8e-4a3f-9a57-0d0c2e7b9f11';
const ANSWER_1 = '3f2c9e1a-7b4d-4c8e-9a1f-2d6b5e8c0a47';
const ANSWER_2 = '7c1e5a9b-2d4f-4a6c-8e0b-1f3a5c7e9d2b';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const USAGE = { inputTokens: 1857, cachedInputTokens: 0, outputTokens: 96 };

const runTurn = vi.mocked(runAgentTurn);
const load = vi.mocked(conversations.loadConversation);
const save = vi.mocked(conversations.saveConversation);
const publishTurn = vi.mocked(publishInteraction);
const publishRating = vi.mocked(publishFeedback);
const getRatings = vi.mocked(feedbackStore.getRatings);
const saveRating = vi.mocked(feedbackStore.saveRating);

const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

const request = (overrides: { userId?: string | null; body?: unknown; params?: Record<string, string> } = {}) =>
  ({
    headers: overrides.userId === null ? {} : { 'x-user-id': overrides.userId ?? USER },
    body: overrides.body ?? {},
    params: overrides.params ?? {},
    correlationId: 'corr-1',
    log: log(),
  }) as any;

/** A response that records what was written, like Express's. */
const response = () => {
  const res = new EventEmitter() as any;
  res.writableEnded = false;
  res.frames = [] as string[];
  res.statusCode = 200;
  res.writeHead = vi.fn();
  res.write = vi.fn((frame: string) => res.frames.push(frame));
  res.end = vi.fn(() => {
    res.writableEnded = true;
  });
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn();
  /** The SSE events written, parsed. */
  res.events = () => res.frames.map((frame: string) => JSON.parse(frame.split('\ndata: ')[1]));
  return res;
};

/** Calls a handler and returns the error it passed to `next`, if any. */
const call = async (handler: (req: any, res: any, next: any) => Promise<void>, req: any, res = response()) => {
  const next = vi.fn();
  await handler(req, res, next);
  return { res, error: next.mock.calls[0]?.[0] as (Error & { statusCode?: number }) | undefined };
};

const stored = (messages: Array<{ role: string; content: string }>, answerIds?: Array<string | null>) => ({
  provider: 'openai-compatible' as const,
  messages,
  ...(answerIds ? { answerIds } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isConfigured).mockReturnValue(true);
  vi.mocked(consumeUserMessage).mockResolvedValue(true);
  vi.mocked(conversations.acquireTurnLock).mockResolvedValue(true);
  load.mockResolvedValue(null);
  getRatings.mockResolvedValue({});
  publishTurn.mockResolvedValue();
  publishRating.mockResolvedValue();
  runTurn.mockImplementation(async ({ emit, userMessage }) => {
    emit({ type: 'tool_status', tool: 'search_products', state: 'running' });
    emit({ type: 'tool_status', tool: 'search_products', state: 'done' });
    emit({ type: 'text', delta: 'Here you go.' });
    return {
      messages: [{ role: 'user', content: userMessage }, { role: 'assistant', content: 'Here you go.' }],
      stopReason: 'stop',
      model: 'local-model',
      usage: USAGE,
    };
  });
});

describe('postChat (012)', () => {
  const chat = (body: object = { message: 'Any keyboards?', conversationId: CONV }) => call(postChat, request({ body }));

  /** A turn that streams `reply`, optionally after calling `tools`. */
  const replyWith = (reply: string, tools: string[] = []) =>
    runTurn.mockImplementation(async ({ emit, userMessage }) => {
      for (const tool of tools) emit({ type: 'tool_status', tool, state: 'running' });
      emit({ type: 'text', delta: reply });
      return { messages: [{ role: 'user', content: userMessage }, { role: 'assistant', content: reply }], stopReason: 'stop', model: 'local-model', usage: USAGE };
    });

  it('corrects a claim to be connecting the customer when no handoff tool ran, before `done`, and stores it (D-048)', async () => {
    const claim = "I'll connect you with a person right away. Please wait a moment.";
    replyWith(claim);
    const { res } = await chat({ message: 'I want to talk to a person.', conversationId: CONV });
    const events = res.events();
    const doneAt = events.findIndex((event: { type: string }) => event.type === 'done');
    expect(events[doneAt - 1]).toEqual({ type: 'text', delta: HANDOFF_CORRECTION });
    expect(save.mock.calls[0][2].messages.at(-1)).toEqual({ role: 'assistant', content: claim + HANDOFF_CORRECTION });
  });

  it('leaves a connecting reply alone when the handoff tool ran, and leaves an offer alone', async () => {
    replyWith("I'll connect you with a person. Your reference is in the message above.", ['request_human_handoff']);
    await chat();
    replyWith('Would you like me to connect you with a person?');
    const { res } = await chat();
    expect(res.events().some((event: { delta?: string }) => event.delta === HANDOFF_CORRECTION)).toBe(false);
    const lastReplies = save.mock.calls.map((call) => (call[2].messages.at(-1) as { content: string }).content);
    expect(lastReplies.join(' ')).not.toContain(HANDOFF_CORRECTION.trim());
  });

  it('sends a UUID answerId and the usage in `done`', async () => {
    const { res } = await chat();
    const done = res.events().find((event: any) => event.type === 'done');
    expect(done).toEqual({ type: 'done', conversationId: CONV, stopReason: 'stop', answerId: expect.stringMatching(UUID), usage: USAGE });
  });

  it('saves the answerId with the conversation, appended to the earlier ones', async () => {
    load.mockResolvedValue(stored([{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }], [ANSWER_1]));
    const { res } = await chat();
    const { answerId } = res.events().find((event: any) => event.type === 'done');
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][2].answerIds).toEqual([ANSWER_1, answerId]);
  });

  it('pads with null for turns saved before 012, so entry k stays turn k', async () => {
    load.mockResolvedValue(
      stored([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'Again' },
        { role: 'assistant', content: 'Yes' },
      ]),
    );
    const { res } = await chat();
    const { answerId } = res.events().find((event: any) => event.type === 'done');
    expect(save.mock.calls[0][2].answerIds).toEqual([null, null, answerId]);
  });

  it('publishes exactly one interaction per finished turn, after `done` was written and the response ended', async () => {
    let seen: { ended: boolean; doneWritten: boolean } | undefined;
    const res = response();
    publishTurn.mockImplementation(async () => {
      seen = { ended: res.writableEnded, doneWritten: res.events().some((event: any) => event.type === 'done') };
    });
    await call(postChat, request({ body: { message: 'Any keyboards?', conversationId: CONV } }), res);
    expect(publishTurn).toHaveBeenCalledOnce();
    expect(seen).toEqual({ ended: true, doneWritten: true });
  });

  it('publishes the turn with its answerId, tools, outcome, model and usage, and the correlation ID', async () => {
    const { res } = await chat();
    const { answerId } = res.events().find((event: any) => event.type === 'done');
    const [event, correlationId] = publishTurn.mock.calls[0];
    expect(parseAssistantInteraction(event)).toEqual(event);
    expect(event).toMatchObject({
      conversationId: CONV,
      answerId,
      provider: 'openai-compatible',
      model: 'local-model',
      stopReason: 'stop',
      outcome: 'answered',
      tools: ['search_products'],
      usage: USAGE,
    });
    expect(event.latencyMs).toBeGreaterThanOrEqual(0);
    expect(correlationId).toBe('corr-1');
    expect(JSON.stringify(event)).not.toContain(USER);
    expect(JSON.stringify(event)).not.toContain('keyboards');
  });

  it('publishes one `limited` event for the pre-flight rate limit, without running the model', async () => {
    vi.mocked(consumeUserMessage).mockResolvedValue(false);
    const { res } = await chat();
    expect(runTurn).not.toHaveBeenCalled();
    expect(res.events().map((event: any) => event.type)).toEqual(['error']);
    expect(publishTurn).toHaveBeenCalledOnce();
    const [event] = publishTurn.mock.calls[0];
    expect(parseAssistantInteraction(event)).toMatchObject({ outcome: 'limited', usage: null, stopReason: null, tools: [] });
  });

  it('publishes one `error` event when the model provider fails', async () => {
    runTurn.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { status: 500 }));
    const { res } = await chat();
    expect(res.events().at(-1)).toMatchObject({ type: 'error', code: 'assistant_unavailable' });
    expect(publishTurn).toHaveBeenCalledOnce();
    expect(publishTurn.mock.calls[0][0]).toMatchObject({ outcome: 'error' });
    expect(save).not.toHaveBeenCalled();
  });

  it('publishes nothing for a turn the client cancelled', async () => {
    const res = response();
    runTurn.mockImplementation(async ({ signal }) => {
      res.emit('close'); // the browser went away mid-turn
      expect(signal.aborted).toBe(true);
      throw new Error('Request was aborted.');
    });
    await call(postChat, request({ body: { message: 'Hi', conversationId: CONV } }), res);
    expect(publishTurn).not.toHaveBeenCalled();
  });

  it('publishes nothing for a request rejected before the stream (no identity)', async () => {
    const { error } = await call(postChat, request({ userId: null, body: { message: 'Hi' } }));
    expect(error?.statusCode).toBe(401);
    expect(publishTurn).not.toHaveBeenCalled();
  });
});

describe('getConversation (012)', () => {
  const transcript = async () => {
    const { res } = await call(getConversation, request({ params: { id: CONV } }));
    return res.json.mock.calls[0][0];
  };

  it('puts each answerId on the assistant entry after the matching user entry, and returns the ratings', async () => {
    load.mockResolvedValue(
      stored(
        [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello' },
          { role: 'user', content: 'Keyboards?' },
          { role: 'assistant', content: 'Yes, one.' },
        ],
        [ANSWER_1, ANSWER_2],
      ),
    );
    getRatings.mockResolvedValue({ [ANSWER_2]: 'down' });
    expect(await transcript()).toEqual({
      conversationId: CONV,
      messages: [
        { role: 'user', text: 'Hi' },
        { role: 'assistant', text: 'Hello', answerId: ANSWER_1 },
        { role: 'user', text: 'Keyboards?' },
        { role: 'assistant', text: 'Yes, one.', answerId: ANSWER_2 },
      ],
      ratings: { [ANSWER_2]: 'down' },
    });
    expect(getRatings).toHaveBeenCalledWith(USER, CONV);
  });

  it('keeps the mapping when a turn wrote no text', async () => {
    load.mockResolvedValue(
      stored(
        [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: '' },
          { role: 'user', content: 'Hello?' },
          { role: 'assistant', content: 'Sorry, here I am.' },
        ],
        [ANSWER_1, ANSWER_2],
      ),
    );
    const { messages } = await transcript();
    expect(messages).toEqual([
      { role: 'user', text: 'Hi' },
      { role: 'user', text: 'Hello?' },
      { role: 'assistant', text: 'Sorry, here I am.', answerId: ANSWER_2 },
    ]);
  });

  it('omits answerId for a conversation saved before 012, or for a padded turn', async () => {
    load.mockResolvedValue(
      stored(
        [
          { role: 'user', content: 'Old' },
          { role: 'assistant', content: 'Old answer' },
          { role: 'user', content: 'New' },
          { role: 'assistant', content: 'New answer' },
        ],
        [null, ANSWER_2],
      ),
    );
    expect((await transcript()).messages[1]).toEqual({ role: 'assistant', text: 'Old answer' });
    load.mockResolvedValue(stored([{ role: 'user', content: 'Old' }, { role: 'assistant', content: 'Old answer' }]));
    expect((await transcript()).messages).toEqual([
      { role: 'user', text: 'Old' },
      { role: 'assistant', text: 'Old answer' },
    ]);
  });
});

describe('putFeedback (012, AC-8 / AC-10)', () => {
  const rate = (overrides: { userId?: string | null; rating?: unknown; answerId?: string } = {}) =>
    call(
      putFeedback,
      request({
        userId: overrides.userId,
        params: { id: CONV, answerId: overrides.answerId ?? ANSWER_2 },
        body: { rating: 'rating' in overrides ? overrides.rating : 'up' },
      }),
    );

  beforeEach(() => {
    // Stored under USER only: the key holds the user ID, so another user's load finds nothing.
    load.mockImplementation(async (userId) =>
      userId === USER ? stored([{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }], [ANSWER_1, ANSWER_2]) : null,
    );
  });

  it('returns 401 without an identity, and saves nothing', async () => {
    const { error } = await rate({ userId: null });
    expect(error?.statusCode).toBe(401);
    expect(saveRating).not.toHaveBeenCalled();
  });

  it.each([['meh'], [undefined], [1]])('returns 400 for the rating %s', async (rating) => {
    const { error } = await rate({ rating });
    expect(error?.statusCode).toBe(400);
    expect(saveRating).not.toHaveBeenCalled();
  });

  it("returns 404 for another user's conversation", async () => {
    const { error } = await rate({ userId: OTHER_USER });
    expect(error?.statusCode).toBe(404);
    expect(load).toHaveBeenCalledWith(OTHER_USER, CONV);
    expect(saveRating).not.toHaveBeenCalled();
    expect(publishRating).not.toHaveBeenCalled();
  });

  it('returns 404 for an answer that is not in the conversation', async () => {
    const { error } = await rate({ answerId: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a' });
    expect(error?.statusCode).toBe(404);
    expect(saveRating).not.toHaveBeenCalled();
  });

  it('returns 204 for the owner and saves the rating', async () => {
    const { res, error } = await rate({ rating: 'down' });
    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(204);
    expect(res.end).toHaveBeenCalledOnce();
    expect(saveRating.mock.calls).toEqual([[USER, CONV, ANSWER_2, 'down']]);
  });

  it('saves a second vote over the first (the store keeps the last)', async () => {
    await rate({ rating: 'up' });
    await rate({ rating: 'down' });
    expect(saveRating.mock.calls.map((args) => args[3])).toEqual(['up', 'down']);
  });

  it('publishes one feedback event with exactly the AC-10 fields, after the 204', async () => {
    let statusWhenPublished: number | undefined;
    const res = response();
    publishRating.mockImplementation(async () => {
      statusWhenPublished = res.writableEnded ? res.statusCode : undefined;
    });
    await call(putFeedback, request({ params: { id: CONV, answerId: ANSWER_2 }, body: { rating: 'up' } }), res);
    expect(publishRating).toHaveBeenCalledOnce();
    const [event, correlationId] = publishRating.mock.calls[0];
    expect(Object.keys(event).sort()).toEqual(['answerId', 'conversationId', 'ratedAt', 'rating']);
    expect(parseAssistantFeedback(event)).toEqual(event);
    expect(event).toMatchObject({ conversationId: CONV, answerId: ANSWER_2, rating: 'up' });
    expect(correlationId).toBe('corr-1');
    expect(statusWhenPublished).toBe(204);
  });

  it('still answers 204 when the rating publish would fail (it never rejects, AC-12)', async () => {
    publishRating.mockReturnValue(new Promise(() => undefined)); // Kafka down: never settles in time
    const { res } = await rate();
    expect(res.statusCode).toBe(204);
  });
});

describe('deleteConversation (012)', () => {
  it('removes the ratings with the conversation', async () => {
    const { res } = await call(deleteConversation, request({ params: { id: CONV } }));
    expect(res.statusCode).toBe(204);
    expect(conversations.deleteConversation).toHaveBeenCalledWith(USER, CONV);
    expect(feedbackStore.deleteRatings).toHaveBeenCalledWith(USER, CONV);
  });
});
