/**
 * The eval command (012 T030, AC-2/AC-4; plan §3.3): `npm run eval`. Checks the stack, sets up fixtures, runs each
 * case in a new conversation against the assistant directly, grades the turns and writes the report. Exits 1 when
 * AC-5's target is missed. Never part of `npm test` or `npm run check` (AC-6).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CASES, USER_FOR_CATEGORY } from './cases';
import { call, createLantern, deleteLantern, type RunFixtures, SERVICE_URLS, serviceHeaders, setUpFixtures } from './fixtures';
import { fillPlaceholders, grade } from './grader';
import { summarise, toMarkdown } from './report';
import { SseParser } from './sse';
import type { CaseResult, Report, TurnRecord } from './types';

const PACKAGE_DIR = join(__dirname, '..', '..');
const REPORT_DIR = join(PACKAGE_DIR, 'eval-reports');
const ROOT_ENV = join(PACKAGE_DIR, '..', '..', '.env');
const TURN_TIMEOUT_MS = 240_000;

interface Health {
  status: string;
  provider?: string;
  model?: string;
  configured?: boolean;
}

/** Stops the run unless every service the cases and fixtures use answers `/health`, and a model is configured. */
async function checkHealth(): Promise<void> {
  const problems: string[] = [];
  for (const [name, url] of Object.entries(SERVICE_URLS)) {
    const health = await call<Health>(`${url}/health`, { headers: {} }).catch((error: Error): Health => ({ status: error.message }));
    if (health.status !== 'ok') problems.push(`${name} (${url}): ${health.status}`);
    if (name === 'assistant' && health.status === 'ok' && !health.configured) problems.push('assistant: no model provider configured');
  }
  if (problems.length) throw new Error(`The stack isn't ready:\n  ${problems.join('\n  ')}`);
}

/** The eval user's cart as the cart service returns it, for `cartUnchanged`. */
const readCart = (userId: string, correlationId: string): Promise<unknown> =>
  call(`${SERVICE_URLS.cart}/api/v1/cart`, { headers: serviceHeaders(userId, correlationId) });

/** Sends one message and records the turn's events, reply text and time. */
async function runTurn(message: string, userId: string, correlationId: string, conversationId?: string): Promise<TurnRecord & { conversationId?: string }> {
  const started = Date.now();
  const response = await fetch(`${SERVICE_URLS.assistant}/api/v1/assistant/chat`, {
    method: 'POST',
    headers: serviceHeaders(userId, correlationId),
    body: JSON.stringify(conversationId ? { message, conversationId } : { message }),
    signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) throw new Error(`chat → ${response.status}: ${(await response.text()).slice(0, 200)}`);

  const parser = new SseParser();
  const events = [];
  const decoder = new TextDecoder();
  for await (const chunk of response.body) events.push(...parser.push(decoder.decode(chunk, { stream: true })));
  events.push(...parser.end());

  const text = events.flatMap((event) => (event.type === 'text' ? [event.delta] : [])).join('');
  const start = events.find((event) => event.type === 'start');
  return { events, text, ms: Date.now() - started, conversationId: start?.type === 'start' ? start.conversationId : conversationId };
}

/** Runs one case in a new conversation as its category's user; a crash becomes a failed case, not a failed run. */
async function runCase(evalCase: (typeof CASES)[number], setup: RunFixtures, runId: string): Promise<CaseResult> {
  const role = USER_FOR_CATEGORY[evalCase.category] as keyof RunFixtures['userIds'];
  const userId = setup.userIds[role];
  const correlationId = `eval-${runId}-${evalCase.id}`;
  const turns: TurnRecord[] = [];
  let conversationId: string | undefined;
  try {
    for (const message of evalCase.messages) {
      const cartBefore = await readCart(userId, correlationId);
      const turn = await runTurn(fillPlaceholders(message, setup.fixtures), userId, correlationId, conversationId);
      conversationId = turn.conversationId;
      turns.push({ events: turn.events, text: turn.text, ms: turn.ms, cartBefore, cartAfter: await readCart(userId, correlationId) });
    }
  } catch (error) {
    // A crashed turn is recorded as an error event, so the case fails with the reason instead of stopping the run.
    turns.push({ events: [{ type: 'error', code: 'assistant_unavailable', message: (error as Error).message }], text: '', ms: 0 });
  }
  return grade(evalCase, turns, setup.fixtures);
}

/** The newest earlier report for the same provider and model, for the flip list (Q5). */
function previousReport(provider: string, model: string): Report | undefined {
  if (!existsSync(REPORT_DIR)) return undefined;
  const reports = readdirSync(REPORT_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse()
    .map((name) => JSON.parse(readFileSync(join(REPORT_DIR, name), 'utf8')) as Report);
  return reports.find((report) => report.meta.provider === provider && report.meta.model === model);
}

async function main(): Promise<number> {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
  const startedAt = new Date();
  const runId = startedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'z').toLowerCase();
  console.log(`eval ${runId}: checking the stack…`);
  await checkHealth();

  const setup = await setUpFixtures(runId);
  console.log(`fixtures ready: ${JSON.stringify(setup.fixtures)}`);
  const results: CaseResult[] = [];
  for (const evalCase of CASES) {
    // The injection product exists only while the case that mentions it runs, so no other search can see it.
    const needsLantern = evalCase.messages.some((message) => message.includes('{{lantern.'));
    const lantern = needsLantern ? await createLantern(runId) : undefined;
    let result: CaseResult;
    try {
      result = await runCase(evalCase, { ...setup, fixtures: { ...setup.fixtures, ...lantern?.fixtures } }, runId);
    } finally {
      if (lantern) await deleteLantern(lantern.id, runId).catch((error: Error) => console.error(`could not delete the lantern: ${error.message}`));
    }
    results.push(result);
    const why = result.failures.map((failure) => failure.detail).join('; ');
    console.log(`${result.passed ? 'pass' : 'FAIL'} ${evalCase.id.padEnd(4)} ${String(result.ms).padStart(6)} ms${why ? `  ${why}` : ''}`);
  }

  // After the first turn, /health names the model the provider resolved ("auto" before it).
  const health = await call<Health>(`${SERVICE_URLS.assistant}/health`, { headers: {} });
  const provider = health.provider ?? 'unknown';
  const model = health.model ?? 'unknown';
  const meta = { runId, provider, model, startedAt: startedAt.toISOString(), durationMs: Date.now() - startedAt.getTime() };
  const report = summarise(results, meta, previousReport(provider, model));

  mkdirSync(REPORT_DIR, { recursive: true });
  const base = join(REPORT_DIR, `${runId}-${provider}`);
  writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(`${base}.md`, toMarkdown(report));
  console.log(`\n${report.passedCount}/${report.total} passed (${(report.passRate * 100).toFixed(1)}%), safety failures: ${report.safetyFailures.length}`);
  console.log(`report: ${base}.md`);
  return report.passed ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: Error) => {
    console.error(error.message);
    process.exit(2);
  },
);
