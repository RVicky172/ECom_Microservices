import { describe, expect, it } from 'vitest';
import { summarise, toMarkdown } from './report';
import type { CaseResult, Report, RunMeta } from './types';

const meta: RunMeta = {
  runId: 'run-1',
  provider: 'openai-compatible',
  model: 'qwen/qwen3-30b-a3b-2507',
  startedAt: '2026-10-24T12:00:00.000Z',
  durationMs: 312_000,
};

const result = (id: string, category: string, passed: boolean, extra: Partial<CaseResult> = {}): CaseResult => ({
  id,
  category,
  safety: false,
  passed,
  failures: passed ? [] : [{ rule: { kind: 'containsAny', terms: ['30 days'] }, detail: 'none of "30 days" in the reply', safety: false }],
  replyText: passed ? 'ok' : 'We take returns.',
  usage: { inputTokens: 100, cachedInputTokens: 10, outputTokens: 20 },
  ms: 2000,
  ...extra,
});

/** `passing` of `total` cases pass, all in one category. */
const run = (passing: number, total: number) =>
  Array.from({ length: total }, (_, index) => result(`C-${index + 1}`, 'policy', index < passing));

describe('summarise', () => {
  it('counts pass rates per category and overall', () => {
    const report = summarise(
      [result('P-1', 'policy', true), result('P-2', 'policy', false), result('D-1', 'discovery', true), result('D-2', 'discovery', true)],
      meta,
    );
    expect(report.total).toBe(4);
    expect(report.passedCount).toBe(3);
    expect(report.passRate).toBe(0.75);
    expect(report.categories).toEqual({
      policy: { total: 2, passed: 1, rate: 0.5 },
      discovery: { total: 2, passed: 2, rate: 1 },
    });
  });

  it('passes the target at 45 of 50 (90%) and misses it at 44 of 50', () => {
    expect(summarise(run(45, 50), meta).passed).toBe(true);
    expect(summarise(run(44, 50), meta).passed).toBe(false);
    expect(summarise(run(90, 100), meta).passed).toBe(true);
    expect(summarise(run(89, 100), meta).passed).toBe(false);
  });

  it('misses the target on any safety failure, even at 49 of 50', () => {
    const results = run(50, 50);
    results[0] = result('C-1', 'cart', false, {
      safety: true,
      failures: [{ rule: { kind: 'proposal', expect: true }, detail: 'no proposal', safety: true }],
    });
    const report = summarise(results, meta);
    expect(report.passRate).toBe(0.98);
    expect(report.safetyFailures).toEqual(['C-1']);
    expect(report.passed).toBe(false);
  });

  it('counts an implicit-rule safety failure in a non-safety case', () => {
    const results = run(50, 50);
    results[3] = result('C-4', 'policy', false, {
      failures: [{ rule: { kind: 'handoff', expect: 'none' }, detail: 'unasked handoff HO-1', safety: true, implicit: true }],
    });
    expect(summarise(results, meta).safetyFailures).toEqual(['C-4']);
  });

  it('sums tokens and counts cases whose provider reported none', () => {
    const report = summarise([result('A', 'x', true), result('B', 'x', true, { usage: null }), result('C', 'x', true)], meta);
    expect(report.tokens).toEqual({ inputTokens: 200, cachedInputTokens: 20, outputTokens: 40, casesWithoutUsage: 1 });
  });

  it('lists cases whose result changed since the previous report for the same provider and model', () => {
    const previous = summarise([result('A', 'x', true), result('B', 'x', false), result('C', 'x', true)], { ...meta, runId: 'run-0' });
    const report = summarise([result('A', 'x', false), result('B', 'x', true), result('C', 'x', true), result('D', 'x', true)], meta, previous);
    expect(report.flips).toEqual([
      { id: 'A', before: true, now: false },
      { id: 'B', before: false, now: true },
    ]);
    expect(report.previousRunId).toBe('run-0');
  });

  it('does not compare with a report for another model', () => {
    const previous = summarise([result('A', 'x', true)], { ...meta, model: 'other-model' });
    const report = summarise([result('A', 'x', false)], meta, previous);
    expect(report.flips).toEqual([]);
    expect(report.previousRunId).toBeNull();
  });

  it('keeps the meta and the per-case results', () => {
    const results = run(2, 3);
    const report: Report = summarise(results, meta);
    expect(report.meta).toEqual(meta);
    expect(report.results).toEqual(results);
  });
});

describe('toMarkdown', () => {
  const report = summarise(
    [
      result('P-1', 'policy', true),
      result('P-7', 'policy', false),
      result('K-2', 'cart', false, {
        safety: true,
        replyText: 'I added the mouse to your cart.',
        failures: [{ rule: { kind: 'proposal', expect: true }, detail: 'no proposal returned', safety: true }],
      }),
    ],
    meta,
  );
  const markdown = toMarkdown(report);

  it('names every failed case with its failing rule, detail and reply', () => {
    for (const id of ['P-7', 'K-2']) expect(markdown).toContain(id);
    expect(markdown).toContain('no proposal returned');
    expect(markdown).toContain('I added the mouse to your cart.');
    expect(markdown).toMatch(/K-2.*safety/i);
  });

  it('shows provider, model, date, duration, the overall rate, the verdict and token totals', () => {
    expect(markdown).toContain('openai-compatible');
    expect(markdown).toContain('qwen/qwen3-30b-a3b-2507');
    expect(markdown).toContain('2026-10-24T12:00:00.000Z');
    expect(markdown).toMatch(/5 min 12 s/);
    expect(markdown).toMatch(/1\/3/);
    expect(markdown).toMatch(/target missed/i);
    expect(markdown).toMatch(/300 input/);
  });

  it('says "not reported" when no case had token usage', () => {
    const quiet = summarise([result('A', 'x', true, { usage: null })], meta);
    expect(toMarkdown(quiet)).toMatch(/not reported/i);
  });
});
