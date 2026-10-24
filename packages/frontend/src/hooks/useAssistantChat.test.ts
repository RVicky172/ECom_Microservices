/**
 * The chat panel's pure state helpers (012): answer IDs from `done`, optimistic
 * ratings with revert, and restoring a transcript with its ratings.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AssistantEvent, ChatItem } from '../types/assistant';
import { applyEvent, itemsFromTranscript, revertRating, withRating } from './useAssistantChat';

vi.mock('../api/assistantApi', () => ({
  streamAssistantChat: vi.fn(),
  fetchConversation: vi.fn(),
  deleteConversation: vi.fn(),
  rateAnswer: vi.fn(),
}));

const ANSWER = '3f2c9e1a-7b4d-4c8e-9a1f-2d6b5e8c0a47';

const item = (overrides: Partial<ChatItem> = {}): ChatItem => ({
  id: 'chat-1',
  role: 'assistant',
  text: 'Here you go.',
  products: [],
  proposals: [],
  ...overrides,
});

const done: AssistantEvent = { type: 'done', conversationId: 'c-1', stopReason: 'stop', answerId: ANSWER, usage: null };

describe('applyEvent (012)', () => {
  it('sets the answerId from `done` on the streaming assistant item', () => {
    expect(applyEvent(item(), done)).toEqual(item({ answerId: ANSWER }));
  });

  it('leaves everything visible unchanged on a `handoff` event', () => {
    const before = item({ text: 'Sent to support.', activity: 'Contacting support…' });
    expect(applyEvent(before, { type: 'handoff', reference: 'HO-1', alreadyRequested: false })).toBe(before);
  });

  it('never gives an error item an answerId', () => {
    const failed = item({ text: '', error: { code: 'assistant_unavailable', message: 'Unavailable.' } });
    expect(applyEvent(failed, done).answerId).toBeUndefined();
  });

  it('still folds text and errors as before', () => {
    expect(applyEvent(item({ text: 'a' }), { type: 'text', delta: 'b' }).text).toBe('ab');
    expect(applyEvent(item(), { type: 'error', code: 'busy', message: 'Busy.' }).error).toEqual({ code: 'busy', message: 'Busy.' });
  });
});

describe('ratings (012)', () => {
  const items = [item({ id: 'chat-1', answerId: ANSWER }), item({ id: 'chat-2', role: 'user' })];

  it('sets the rating on one item only (optimistic)', () => {
    const rated = withRating(items, 'chat-1', 'up');
    expect(rated[0].rating).toBe('up');
    expect(rated[1]).toBe(items[1]);
  });

  it('changes a rating to the other one', () => {
    expect(withRating(withRating(items, 'chat-1', 'up'), 'chat-1', 'down')[0].rating).toBe('down');
  });

  it('reverts a failed rating to the previous one', () => {
    const rated = withRating(withRating(items, 'chat-1', 'up'), 'chat-1', 'down');
    expect(revertRating(rated, 'chat-1', 'down', 'up')[0].rating).toBe('up');
    expect(revertRating(withRating(items, 'chat-1', 'up'), 'chat-1', 'up', undefined)[0].rating).toBeUndefined();
  });

  it('does not revert when a newer vote replaced the failed one', () => {
    const newer = withRating(withRating(items, 'chat-1', 'up'), 'chat-1', 'down'); // "up" failed after "down" was clicked
    expect(revertRating(newer, 'chat-1', 'up', undefined)[0].rating).toBe('down');
  });
});

describe('itemsFromTranscript (012)', () => {
  it('restores answer IDs and saved ratings, and leaves old answers without them', () => {
    const restored = itemsFromTranscript({
      messages: [
        { role: 'user', text: 'Hi' },
        { role: 'assistant', text: 'Old answer' },
        { role: 'user', text: 'Keyboards?' },
        { role: 'assistant', text: 'Yes.', answerId: ANSWER },
      ],
      ratings: { [ANSWER]: 'down' },
    });
    expect(restored.map(({ role, text, answerId, rating }) => ({ role, text, answerId, rating }))).toEqual([
      { role: 'user', text: 'Hi', answerId: undefined, rating: undefined },
      { role: 'assistant', text: 'Old answer', answerId: undefined, rating: undefined },
      { role: 'user', text: 'Keyboards?', answerId: undefined, rating: undefined },
      { role: 'assistant', text: 'Yes.', answerId: ANSWER, rating: 'down' },
    ]);
    expect(new Set(restored.map((entry) => entry.id)).size).toBe(4);
  });

  it('accepts a transcript from before 012 (no ratings field)', () => {
    const [restored] = itemsFromTranscript({ messages: [{ role: 'assistant', text: 'Hello' }] });
    expect(restored.text).toBe('Hello');
    expect(restored.answerId).toBeUndefined();
    expect(restored.rating).toBeUndefined();
  });
});
