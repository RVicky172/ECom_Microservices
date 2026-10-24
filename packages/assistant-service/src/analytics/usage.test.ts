/**
 * Usage aggregation on hand-written events (012, AC-13). Every expected number is written
 * out, not computed from the input (learnings: don't derive expectations from the code's own data).
 */
import type { AssistantFeedbackData, AssistantInteractionData, InteractionOutcome } from '@ecommerce/shared';
import { describe, expect, it } from 'vitest';
import { aggregateUsage, nearestRankP95 } from './usage';

let answer = 0;
const answerId = () => `00000000-0000-4000-8000-${String(++answer).padStart(12, '0')}`;

const turn = (overrides: Partial<AssistantInteractionData> & { outcome?: InteractionOutcome } = {}): AssistantInteractionData => ({
  conversationId: 'c1000000-0000-4000-8000-000000000001',
  answerId: answerId(),
  provider: 'openai-compatible',
  model: 'qwen',
  stopReason: 'stop',
  outcome: 'answered',
  tools: [],
  latencyMs: 1000,
  usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 10 },
  completedAt: '2026-10-24T10:00:00.000Z',
  ...overrides,
});

const rating = (forAnswer: string, value: 'up' | 'down', ratedAt = '2026-10-24T11:00:00.000Z'): AssistantFeedbackData => ({
  conversationId: 'c1000000-0000-4000-8000-000000000001',
  answerId: forAnswer,
  rating: value,
  ratedAt,
});

describe('nearestRankP95', () => {
  it.each([
    [[5], 5],
    [[1, 2], 2],
    [[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 100], // ceil(9.5) = 10th
    [Array.from({ length: 20 }, (_, i) => i + 1), 19], // ceil(19) = 19th
    [Array.from({ length: 21 }, (_, i) => 21 - i), 20], // unsorted input; ceil(19.95) = 20th
  ])('p95 of %j is %i', (values, expected) => {
    expect(nearestRankP95(values)).toBe(expected);
  });

  it('is null for no values', () => {
    expect(nearestRankP95([])).toBeNull();
  });
});

describe('aggregateUsage', () => {
  it('groups by UTC day and model, sorted by day then model', () => {
    const { rows } = aggregateUsage(
      [
        turn({ completedAt: '2026-10-24T23:59:59.999Z', model: 'qwen' }),
        turn({ completedAt: '2026-10-25T00:00:00.000Z', model: 'qwen' }),
        turn({ completedAt: '2026-10-24T08:00:00.000Z', model: 'claude-opus-5-5' }),
      ],
      [],
    );
    expect(rows.map((row) => [row.day, row.model, row.turns])).toEqual([
      ['2026-10-24', 'claude-opus-5-5', 1],
      ['2026-10-24', 'qwen', 1],
      ['2026-10-25', 'qwen', 1],
    ]);
  });

  it('counts distinct conversations and turns', () => {
    const a = 'a0000000-0000-4000-8000-00000000000a';
    const b = 'b0000000-0000-4000-8000-00000000000b';
    const { rows } = aggregateUsage([turn({ conversationId: a }), turn({ conversationId: a }), turn({ conversationId: b })], []);
    expect(rows[0]).toMatchObject({ conversations: 2, turns: 3 });
  });

  it('counts tool calls by name (repeats included) and handoff turns', () => {
    const { rows } = aggregateUsage(
      [
        turn({ tools: ['search_products', 'get_product', 'search_products'], outcome: 'proposal' }),
        turn({ tools: ['request_human_handoff'], outcome: 'handoff' }),
        turn({ tools: [], outcome: 'handoff' }), // a repeat request (D-026)
        turn({ tools: ['list_orders'] }),
      ],
      [],
    );
    expect(rows[0].toolCalls).toEqual({ search_products: 2, get_product: 1, request_human_handoff: 1, list_orders: 1 });
    expect(rows[0].handoffs).toBe(2);
    expect(rows[0].outcomes).toEqual({ answered: 1, proposal: 1, handoff: 2 });
  });

  it('reports mean (rounded) and nearest-rank p95 latency', () => {
    const latencies = [900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1801];
    const { rows } = aggregateUsage(latencies.map((latencyMs) => turn({ latencyMs })), []);
    expect(rows[0].latencyMeanMs).toBe(1350); // 13,501 / 10 = 1,350.1
    expect(rows[0].latencyP95Ms).toBe(1801);
  });

  it('sums tokens and counts turns without usage separately', () => {
    const { rows } = aggregateUsage(
      [
        turn({ usage: { inputTokens: 1857, cachedInputTokens: 0, outputTokens: 96 } }),
        turn({ usage: { inputTokens: 4000, cachedInputTokens: 2000, outputTokens: 50 } }),
        turn({ usage: null }),
      ],
      [],
    );
    expect(rows[0].tokens).toEqual({ inputTokens: 5857, cachedInputTokens: 2000, outputTokens: 146 });
    expect(rows[0].turnsWithoutUsage).toBe(1);
  });

  it('joins ratings by answerId, counting the last vote per answer', () => {
    const t1 = turn();
    const t2 = turn();
    const t3 = turn({ model: 'claude-opus-5-5' });
    const { rows, unmatchedRatings } = aggregateUsage(
      [t1, t2, t3],
      [
        rating(t1.answerId, 'down', '2026-10-24T11:00:00.000Z'),
        rating(t2.answerId, 'up', '2026-10-24T11:05:00.000Z'),
        rating(t1.answerId, 'up', '2026-10-24T11:10:00.000Z'), // changed: up counts
        rating(t3.answerId, 'up', '2026-10-24T11:20:00.000Z'),
        rating(t3.answerId, 'down', '2026-10-24T11:15:00.000Z'), // older, arrives later: up still counts
      ],
    );
    const byModel = Object.fromEntries(rows.map((row) => [row.model, row]));
    expect(byModel.qwen).toMatchObject({ ratingsUp: 2, ratingsDown: 0 });
    expect(byModel['claude-opus-5-5']).toMatchObject({ ratingsUp: 1, ratingsDown: 0 });
    expect(unmatchedRatings).toBe(0);
  });

  it('counts ratings for answers with no interaction event (e.g. a dropped one) apart', () => {
    const t1 = turn();
    const { rows, unmatchedRatings } = aggregateUsage([t1], [rating(t1.answerId, 'down'), rating(answerId(), 'up'), rating(answerId(), 'up')]);
    expect(rows[0]).toMatchObject({ ratingsUp: 0, ratingsDown: 1 });
    expect(unmatchedRatings).toBe(2);
  });

  it('counts a duplicated interaction event once (same answerId)', () => {
    const t1 = turn({ tools: ['search_products'], latencyMs: 2000 });
    const { rows } = aggregateUsage([t1, { ...t1 }, turn({ latencyMs: 1000 })], []);
    expect(rows[0]).toMatchObject({ turns: 2, toolCalls: { search_products: 1 }, latencyMeanMs: 1500 });
  });

  it('returns no rows for no events', () => {
    expect(aggregateUsage([], [])).toEqual({ rows: [], unmatchedRatings: 0 });
  });
});
