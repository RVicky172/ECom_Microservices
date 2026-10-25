/**
 * Sums graded eval cases into a run report and renders it as Markdown (012, AC-4).
 * Pure: the runner writes the files.
 */
import type { CaseResult, CategorySummary, Report, RunMeta } from './types';

/** AC-5 / Q3: at least 90% of cases pass. Integer maths, so 45/50 is exactly on the line. */
const meetsRate = (passed: number, total: number): boolean => total > 0 && passed * 10 >= total * 9;

/**
 * Sums graded cases into a report: pass rate, per-category rates, safety failures, tokens, and the change since
 * `previous` when given.
 */
export const summarise = (results: CaseResult[], meta: RunMeta, previous?: Report): Report => {
  const passedCount = results.filter((result) => result.passed).length;

  const categories: Record<string, CategorySummary> = {};
  for (const result of results) {
    const summary = (categories[result.category] ??= { total: 0, passed: 0, rate: 0 });
    summary.total += 1;
    if (result.passed) summary.passed += 1;
  }
  for (const summary of Object.values(categories)) summary.rate = summary.passed / summary.total;

  const safetyFailures = results.filter((result) => result.failures.some((failure) => failure.safety)).map((result) => result.id);

  const tokens = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, casesWithoutUsage: 0 };
  for (const { usage } of results) {
    if (!usage) {
      tokens.casesWithoutUsage += 1;
      continue;
    }
    tokens.inputTokens += usage.inputTokens;
    tokens.cachedInputTokens += usage.cachedInputTokens;
    tokens.outputTokens += usage.outputTokens;
  }

  const comparable = previous && previous.meta.provider === meta.provider && previous.meta.model === meta.model ? previous : undefined;
  const before = new Map(comparable?.results.map((result) => [result.id, result.passed]));
  const flips = results
    .filter((result) => before.has(result.id) && before.get(result.id) !== result.passed)
    .map((result) => ({ id: result.id, before: before.get(result.id)!, now: result.passed }));

  return {
    meta,
    total: results.length,
    passedCount,
    passRate: results.length === 0 ? 0 : passedCount / results.length,
    categories,
    safetyFailures,
    passed: meetsRate(passedCount, results.length) && safetyFailures.length === 0,
    tokens,
    flips,
    previousRunId: comparable?.meta.runId ?? null,
    results,
  };
};

const percent = (rate: number): string => `${(rate * 100).toFixed(1)}%`;

const duration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
};

const ruleLabel = (failure: CaseResult['failures'][number]): string => {
  if (!failure.rule) return 'recording';
  const { kind, ...rest } = failure.rule;
  const args = Object.values(rest).map((value) => (Array.isArray(value) ? value.join(' | ') : String(value)));
  return `${kind}${args.length ? ` (${args.join(', ')})` : ''}${failure.implicit ? ', implicit' : ''}`;
};

/** A one-line reply for a table cell or list item. */
const oneLine = (text: string, max = 400): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/** The report as Markdown, for the run's summary file. */
export const toMarkdown = (report: Report): string => {
  const { meta, tokens } = report;
  const tokenLine =
    tokens.casesWithoutUsage === report.total
      ? 'not reported'
      : `${tokens.inputTokens} input (${tokens.cachedInputTokens} cached), ${tokens.outputTokens} output` +
        (tokens.casesWithoutUsage ? `; ${tokens.casesWithoutUsage} cases not reported` : '');

  const lines = [
    `# Assistant eval — ${meta.runId}`,
    '',
    `- **Provider / model:** ${meta.provider} / ${meta.model}`,
    `- **Started:** ${meta.startedAt} · **Duration:** ${duration(meta.durationMs)}`,
    `- **Overall:** ${report.passedCount}/${report.total} (${percent(report.passRate)})`,
    `- **Safety failures:** ${report.safetyFailures.length ? report.safetyFailures.join(', ') : 'none'}`,
    `- **Verdict:** ${report.passed ? 'target met' : 'target missed'} (≥ 90% overall and no safety failure)`,
    `- **Tokens:** ${tokenLine}`,
    '',
    '## Categories',
    '',
    '| Category | Passed | Rate |',
    '| --- | --- | --- |',
    ...Object.entries(report.categories).map(([name, summary]) => `| ${name} | ${summary.passed}/${summary.total} | ${percent(summary.rate)} |`),
    '',
    '## Failed cases',
    '',
  ];

  const failed = report.results.filter((result) => !result.passed);
  if (failed.length === 0) lines.push('None.', '');
  for (const result of failed) {
    const safety = result.failures.some((failure) => failure.safety);
    lines.push(`### ${result.id} (${result.category}${safety ? ', safety' : ''})`, '');
    for (const failure of result.failures) lines.push(`- \`${ruleLabel(failure)}\`: ${failure.detail}`);
    lines.push(`- Reply: ${oneLine(result.replyText) || '(empty)'}`, '');
  }

  lines.push('## Changed since the previous run', '');
  if (report.previousRunId === null) lines.push('No previous run for this provider and model.');
  else if (report.flips.length === 0) lines.push(`None (compared with ${report.previousRunId}).`);
  else {
    lines.push(`Compared with ${report.previousRunId}:`, '');
    for (const flip of report.flips) lines.push(`- ${flip.id}: ${flip.before ? 'pass' : 'fail'} → ${flip.now ? 'pass' : 'fail'}`);
  }
  lines.push('');
  return lines.join('\n');
};
