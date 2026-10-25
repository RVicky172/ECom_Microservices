/**
 * Eval suite types (012, plan §3). A case is a scripted conversation plus pass
 * rules; the runner records each turn's SSE events and the grader checks the
 * rules against them, with no model judging the reply (Q4).
 */
import type { TokenUsage } from '@ecommerce/shared';
import type { AssistantEvent } from '../agent/events';

/** The categories a case can belong to; the report gives a pass rate for each. */
export const EVAL_CATEGORIES = [
  'discovery',
  'details',
  'orders',
  'cart',
  'policy',
  'uncovered',
  'handoff',
  'injection',
  'offtopic',
] as const;
/** One of `EVAL_CATEGORIES`. */
export type EvalCategory = (typeof EVAL_CATEGORIES)[number];

/** Rules are checked against the last turn, except `handoff: none`, which covers every turn. */
export type Rule =
  | { kind: 'toolCalled' | 'toolNotCalled'; tool: string }
  | { kind: 'containsAny' | 'containsAll' | 'notContains'; terms: string[] }
  | { kind: 'handoff'; expect: 'published' | 'none' | 'repeat' }
  | { kind: 'proposal'; expect: boolean; product?: string }
  | { kind: 'cartUnchanged' };

/** One scripted conversation and the rules its replies must meet. */
export interface EvalCase {
  id: string;
  category: EvalCategory | string;
  /** Any failure in a safety case is a safety failure (AC-5: allows none). */
  safety: boolean;
  /** One user message per turn; may hold `{{fixture.key}}` placeholders. */
  messages: string[];
  rules: Rule[];
}

/** Values the runner sets up (orders, products), filled into `{{key}}` placeholders. */
export type Fixtures = Record<string, string>;

/** What the runner recorded for one turn. */
export interface TurnRecord {
  events: AssistantEvent[];
  /** The reply text as streamed (all `text` deltas joined). */
  text: string;
  ms: number;
  /** The eval user's cart before and after the turn, for `cartUnchanged`. */
  cartBefore?: unknown;
  cartAfter?: unknown;
}

/** One broken rule in a case, with why. */
export interface CaseFailure {
  /** `null` when the recording itself is wrong (e.g. a missing turn). */
  rule: Rule | null;
  detail: string;
  safety: boolean;
  /** Set on the implicit `handoff: none` rule (Q7). */
  implicit?: true;
}

/** A graded case. */
export interface CaseResult {
  id: string;
  category: string;
  safety: boolean;
  passed: boolean;
  failures: CaseFailure[];
  replyText: string;
  usage: TokenUsage | null;
  ms: number;
}

/** Which run this was: provider, model and time. */
export interface RunMeta {
  runId: string;
  provider: string;
  model: string;
  /** ISO timestamp. */
  startedAt: string;
  durationMs: number;
}

/** Pass count and rate for one category. */
export interface CategorySummary {
  total: number;
  passed: number;
  rate: number;
}

/** A whole eval run's results: totals, per-category rates, tokens and every case. */
export interface Report {
  meta: RunMeta;
  total: number;
  passedCount: number;
  passRate: number;
  categories: Record<string, CategorySummary>;
  /** IDs of cases with at least one safety failure. */
  safetyFailures: string[];
  /** AC-5: at least 90% overall and no safety failure. */
  passed: boolean;
  tokens: TokenUsage & { casesWithoutUsage: number };
  /** Cases whose result differs from the previous report for the same provider and model (Q5). */
  flips: Array<{ id: string; before: boolean; now: boolean }>;
  previousRunId: string | null;
  results: CaseResult[];
}
