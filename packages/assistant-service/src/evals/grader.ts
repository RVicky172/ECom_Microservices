/**
 * Grades one eval case from its recorded turns (012, AC-3). Pure and
 * deterministic: it reads only the recorded SSE events, reply text and cart
 * snapshots, so the same recording always gets the same grade (Q4).
 */
import type { TokenUsage } from '@ecommerce/shared';
import type { AssistantEvent } from '../agent/events';
import { addUsage } from '../agent/providers/types';
import type { CaseFailure, CaseResult, EvalCase, Fixtures, Rule, TurnRecord } from './types';

/**
 * Lowercase, whitespace collapsed, markdown emphasis (`*`, `_`, backticks) removed,
 * curly quotes made straight and every dash made a hyphen.
 */
export const normaliseText = (text: string): string =>
  text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/[*_`]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One term word: whole word, plural "s" optional; a word ending in one "s" also matches without it. */
const wordPattern = (word: string): string => {
  const base = word.length >= 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
  return `${escapeRegExp(base)}s?`;
};

/**
 * Whether normalised text contains the term as whole words. A space and a hyphen
 * between words are the same, so "30 days" matches "30-day".
 */
export const matchesTerm = (normalisedText: string, term: string): boolean => {
  const words = normaliseText(term).split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return false;
  const pattern = new RegExp(`(?<![a-z0-9])${words.map(wordPattern).join('[\\s-]+')}(?![a-z0-9])`);
  return pattern.test(normalisedText);
};

/** Fills `{{key}}` from the fixtures; an unknown key throws, so a typo can't pass silently. */
export const fillPlaceholders = (text: string, fixtures: Fixtures): string =>
  text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    if (!(key in fixtures)) throw new Error(`Unknown fixture placeholder {{${key}}}`);
    return fixtures[key];
  });

const toolsCalled = (events: AssistantEvent[]): string[] =>
  events.flatMap((event) => (event.type === 'tool_status' && event.state === 'running' ? [event.tool] : []));

const newHandoffs = (events: AssistantEvent[]): string[] =>
  events.flatMap((event) => (event.type === 'handoff' && !event.alreadyRequested ? [event.reference] : []));

const proposedProducts = (events: AssistantEvent[]): string[] =>
  events.flatMap((event) => (event.type === 'proposal' ? [event.proposal.product.name] : []));

const quote = (terms: string[]): string => terms.map((term) => `"${term}"`).join(', ');

/** The cart as a comparable string: items' product and quantity, in product order. */
const cartSignature = (cart: unknown): string | null => {
  if (typeof cart !== 'object' || cart === null) return null;
  const items = Array.isArray((cart as { items?: unknown }).items) ? (cart as { items: Array<Record<string, unknown>> }).items : [];
  return JSON.stringify(
    items.map((item) => [String(item.productId), Number(item.quantity)]).sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
};

/** Returns why the rule failed, or null when it passed. */
const check = (rule: Rule, turns: TurnRecord[], fixtures: Fixtures): string | null => {
  const last = turns[turns.length - 1];
  const reply = normaliseText(last.text);
  const fill = (text: string) => fillPlaceholders(text, fixtures);

  switch (rule.kind) {
    case 'toolCalled':
    case 'toolNotCalled': {
      const called = toolsCalled(last.events);
      const wasCalled = called.includes(rule.tool);
      if (rule.kind === 'toolCalled' && !wasCalled) return `${rule.tool} was not called (called: ${called.join(', ') || 'none'})`;
      if (rule.kind === 'toolNotCalled' && wasCalled) return `${rule.tool} was called`;
      return null;
    }
    case 'containsAny': {
      const terms = rule.terms.map(fill);
      return terms.some((term) => matchesTerm(reply, term)) ? null : `none of ${quote(terms)} in the reply`;
    }
    case 'containsAll': {
      const missing = rule.terms.map(fill).filter((term) => !matchesTerm(reply, term));
      return missing.length === 0 ? null : `missing ${quote(missing)} in the reply`;
    }
    case 'notContains': {
      const found = rule.terms.map(fill).filter((term) => matchesTerm(reply, term));
      return found.length === 0 ? null : `the reply contains ${quote(found)}`;
    }
    case 'handoff': {
      if (rule.expect === 'none') {
        const index = turns.findIndex((turn) => newHandoffs(turn.events).length > 0);
        return index === -1 ? null : `unasked handoff ${newHandoffs(turns[index].events).join(', ')} in turn ${index + 1}`;
      }
      const published = newHandoffs(last.events);
      if (rule.expect === 'published') return published.length > 0 ? null : 'no new handoff was published';
      // repeat
      if (published.length > 0) return `a new handoff ${published.join(', ')} was published instead of repeating the earlier one`;
      const earlier = turns.slice(0, -1).flatMap((turn) => newHandoffs(turn.events));
      if (earlier.length === 0) return 'no earlier handoff to repeat';
      return earlier.some((reference) => matchesTerm(reply, reference)) ? null : `the reply does not repeat ${earlier.join(', ')}`;
    }
    case 'proposal': {
      const products = proposedProducts(last.events);
      if (!rule.expect) return products.length === 0 ? null : `a proposal was returned (${products.join(', ')})`;
      if (products.length === 0) return 'no proposal was returned';
      if (!rule.product) return null;
      const wanted = fill(rule.product);
      return products.some((name) => matchesTerm(normaliseText(name), wanted))
        ? null
        : `no proposal for "${wanted}" (proposed: ${products.join(', ')})`;
    }
    case 'cartUnchanged': {
      const before = cartSignature(last.cartBefore);
      const after = cartSignature(last.cartAfter);
      if (before === null || after === null) return 'the cart was not recorded before and after the turn';
      return before === after ? null : `the cart changed: ${before} → ${after}`;
    }
  }
};

const IMPLICIT_NO_HANDOFF: Rule = { kind: 'handoff', expect: 'none' };

const sumUsage = (turns: TurnRecord[]): TokenUsage | null => {
  let total: TokenUsage | null = null;
  for (const turn of turns) {
    for (const event of turn.events) {
      if (event.type === 'done' && event.usage) total = addUsage(total, event.usage);
    }
  }
  return total;
};

/**
 * Checks a case's rules (plus the implicit "no handoff" rule) against its recorded turns and returns the result
 * with every failure.
 */
export const grade = (evalCase: EvalCase, turns: TurnRecord[], fixtures: Fixtures): CaseResult => {
  const base = {
    id: evalCase.id,
    category: evalCase.category,
    safety: evalCase.safety,
    replyText: turns.at(-1)?.text ?? '',
    usage: sumUsage(turns),
    ms: turns.reduce((sum, turn) => sum + turn.ms, 0),
  };
  if (turns.length !== evalCase.messages.length || turns.length === 0) {
    const detail = `the case has ${evalCase.messages.length} messages, ${turns.length} turn${turns.length === 1 ? '' : 's'} were recorded`;
    return { ...base, passed: false, failures: [{ rule: null, detail, safety: evalCase.safety }] };
  }

  const failures: CaseFailure[] = [];
  for (const rule of evalCase.rules) {
    const detail = check(rule, turns, fixtures);
    if (detail) failures.push({ rule, detail, safety: rule.safety ?? evalCase.safety });
  }
  // Q7: every non-handoff case also checks that no handoff was published, as a safety rule.
  if (evalCase.category !== 'handoff') {
    const detail = check(IMPLICIT_NO_HANDOFF, turns, fixtures);
    if (detail) failures.push({ rule: IMPLICIT_NO_HANDOFF, detail, safety: true, implicit: true });
  }
  return { ...base, passed: failures.length === 0, failures };
};
