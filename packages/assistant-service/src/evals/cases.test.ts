/**
 * Checks on the eval case file (012 T016/T027): AC-1's categories and counts, and the rules the runner relies on.
 * It checks the data, not the model.
 */
import { describe, expect, it } from 'vitest';
import { CASES, FIXTURE_KEYS, MAX_MESSAGES_PER_USER, USER_FOR_CATEGORY } from './cases';
import { EVAL_CATEGORIES } from './types';

/** AC-1's minimum number of cases per category. */
const MINIMUMS: Record<string, number> = {
  discovery: 10,
  details: 5,
  orders: 6,
  cart: 5,
  policy: 10,
  uncovered: 3,
  handoff: 5,
  injection: 3,
  offtopic: 3,
};

const placeholders = (text: string): string[] => [...text.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]);
const ruleTexts = (rules: (typeof CASES)[number]['rules']): string[] =>
  rules.flatMap((rule) => ('terms' in rule ? rule.terms : 'product' in rule && rule.product ? [rule.product] : []));

describe('eval cases (AC-1)', () => {
  it('has at least 50 cases, and every category its minimum', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(50);
    for (const [category, minimum] of Object.entries(MINIMUMS)) {
      expect(CASES.filter((c) => c.category === category).length, category).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('uses only known categories, with unique IDs', () => {
    for (const c of CASES) expect(EVAL_CATEGORIES as readonly string[]).toContain(c.category);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  it('gives every case at least one message and one rule', () => {
    for (const c of CASES) {
      expect(c.messages.length, c.id).toBeGreaterThan(0);
      expect(c.rules.length, c.id).toBeGreaterThan(0);
    }
  });

  it('uses only fixture placeholders the runner provides', () => {
    for (const c of CASES) {
      for (const key of [...c.messages, ...ruleTexts(c.rules)].flatMap(placeholders)) {
        expect(FIXTURE_KEYS as readonly string[], `${c.id}: {{${key}}}`).toContain(key);
      }
    }
  });

  it('marks every cart, injection and other-user-order case as safety', () => {
    for (const c of CASES.filter((c) => c.category === 'cart' || c.category === 'injection')) expect(c.safety, c.id).toBe(true);
    const otherUser = CASES.filter((c) => c.messages.some((m) => m.includes('{{otherOrder.')));
    expect(otherUser.length).toBeGreaterThan(0);
    for (const c of otherUser) expect(c.safety, c.id).toBe(true);
  });

  it('has a repeat handoff in one conversation, and expects a published handoff in every other handoff case', () => {
    const handoffs = CASES.filter((c) => c.category === 'handoff');
    const repeat = handoffs.filter((c) => c.rules.some((r) => r.kind === 'handoff' && r.expect === 'repeat'));
    expect(repeat.length).toBeGreaterThan(0);
    for (const c of repeat) expect(c.messages.length, c.id).toBeGreaterThan(1);
    for (const c of handoffs.filter((c) => !repeat.includes(c))) {
      expect(c.rules, c.id).toContainEqual({ kind: 'handoff', expect: 'published' });
    }
  });

  it('never expects a handoff outside the handoff category', () => {
    for (const c of CASES.filter((c) => c.category !== 'handoff')) {
      expect(c.rules.some((r) => r.kind === 'handoff' && r.expect !== 'none'), c.id).toBe(false);
    }
  });

  it('keeps each eval user under the assistant limit of 30 messages an hour', () => {
    expect(MAX_MESSAGES_PER_USER).toBeLessThanOrEqual(25);
    const perUser: Record<string, number> = {};
    for (const c of CASES) {
      const user = USER_FOR_CATEGORY[c.category];
      expect(user, c.category).toBeDefined();
      perUser[user] = (perUser[user] ?? 0) + c.messages.length;
    }
    for (const [user, count] of Object.entries(perUser)) expect(count, user).toBeLessThanOrEqual(MAX_MESSAGES_PER_USER);
  });
});
