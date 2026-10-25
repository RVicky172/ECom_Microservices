# Learnings & Gotchas

Non-obvious facts discovered while building. Keep entries short; group by topic (`## <Topic>`). Add one when
something cost more than ~10 minutes or the fix was non-obvious. Delete entries that become wrong.

## Docker & environment

- `.env` is read when a container is created. After changing a variable, rebuild every service that reads it.
  `INTERNAL_SERVICE_TOKEN` is read by all services; rebuilding only the assistant made it reject the gateway
  ("Internal service token required").
- From inside Docker, the host machine (e.g. LM Studio on :1234) is `host.docker.internal`; the assistant's
  compose entry adds `extra_hosts: host-gateway` for that.

- This machine's shell has `NODE_ENV=development` set globally. `next build` then fails prerendering
  `/_global-error` ("Cannot read properties of null (reading 'useContext')"); run it as
  `NODE_ENV=production npx next build`.

## Data access

- Since 002 (2026-10-23), `GET /orders/:id` and `GET /payments/:orderId` return 404 to non-owners, and the
  payment service asks the order service (`GET /orders/:id` as the user) before reading a payment. So a payment
  read needs the order service up (5xx otherwise), and payment-service tests must stub that call.
- Product search (`?search=`) matches the product name only; the assistant filters the full catalog in memory.

## Assistant / LLM

- Claude: forced `tool_choice` returns 400 on current models, and history must stay append-only (never edit
  earlier turns), so long conversations are capped instead of trimmed.
- Local models (Qwen etc.) write `<think>…</think>` and markdown despite instructions; the OpenAI-compatible
  provider strips reasoning and the chat renders `**bold**` safely.
- Grounding on Qwen3 30B (011 T032): told "if the policies don't cover it, say so", it still answers uncovered
  questions with an invented "no, we don't offer X". Spelling out "don't say yes or no; say the policies don't
  cover it; offer a person" plus an example sentence fixed that, but then "card payments only" was read as silent
  about PayPal. At temperature 0.3 the answers are near-deterministic, so one run per prompt shows the effect.

## Tests & build

- Vitest config at the root must be `vitest.config.mts`: the repo is CommonJS (no `"type": "module"`), and a `.ts`
  config prints a Vite "ESM syntax in a file loaded as CommonJS" warning once per project.
- The root `tsconfig.json` is only a base for the packages (each sets its own `rootDir`/`outDir`/`include`). It
  used to set `rootDir: ./packages` with no `include`, so the IDE pulled in root files like `vitest.config.mts` and
  showed TS6059. Now it has no `rootDir`/`outDir` and `"include": ["packages/*/src/**/*"]`. After changing a
  tsconfig, run "TypeScript: Restart TS Server" (or Reload Window) in VS Code, or the old error stays on screen
  (fixed 2026-10-23).
- Vitest's default reporter lists passing files only in a terminal; `reporters: [['default', { summary: false }]]`
  lists every file in piped output too (scripts/check.mjs, CI).
- `@ecommerce/shared` emits no `.d.ts` (no `declaration` in tsconfig), so services resolve it to `dist/index.js` and
  see its exports as untyped; their typecheck also needs shared built first. Unit tests avoid this via the Vitest
  alias to `packages/shared/src`. (Found 2026-10-23 in 001; not fixed — backlog candidate, matters for CI 003.)
- Don't generate "allowed" test cases from the table under test (`it.each(Object.entries(TABLE)…)`): deleting an
  entry deletes its test and nothing fails. Write the expected cases out (001 T013, order transitions).
- Adding `vitest` 5 to the root `devDependencies` breaks every `node:20-alpine` image build: npm 10.8.2 crashes
  in `npm install --workspace=…` with "Cannot read properties of null (reading 'edgesOut')". `node:22-alpine`
  (npm 10.9) and `node:26-alpine` (npm 11) install fine and do not pull root dev dependencies into the image.
  Images now use Node 26 (D-009). (Found 2026-10-23 in 001 T022.)
- The api-gateway container runs `npx tsx` and downloads tsx at every start (~10 s, needs network); it has no
  health check, so `docker compose up --wait` returns before it listens. Wait for `:4000/health` before probing.
- The shared `errorHandler` logs every error, including expected 404s, at level `error`; filter out "not found"
  when scanning logs for real problems.
- Saga consumers can silently die at startup: if Kafka is not ready (just started, topic leader not elected),
  `startConsumer` logs "Failed to start … consumer" and gives up while the service keeps running with `/health`
  200. Orders then stick at `PENDING` until the service is restarted. Check logs for "Failed to start" after any
  Kafka restart (found 2026-10-23, 010 T001; fixed by 010).
- In PostgreSQL, any error inside a transaction aborts it: catching a unique violation (23505) and then querying
  in the same transaction fails with "current transaction is aborted". Use `insert … onConflict(col).ignore()
  .returning(col)` and check for an empty result instead (payment idempotency, fixed in 010 T033). Unit-test fakes
  must reproduce the abort, or the bug hides.
- Replaying a Kafka message unchanged: dump it with `kafka-console-consumer.sh --from-beginning --property
  print.key=true --property print.headers=true`, then resend with `kafka-console-producer.sh --property
  parse.key=true --property parse.headers=true --property headers.delimiter=…` (010 T033).
- KafkaJS rides out broker outages by itself (tested 45 s): it reconnects without a CRASH, so the 010 restart loop
  only matters for start-up failures and non-restarting crashes. `/health` `consumer` shows the loop's state, not
  live broker connectivity. After a service restart the consumer stays `starting` ~20 s while the group rebalances.
  KafkaJS also logs `Topic creation errors` at ERROR when `ensureTopics` meets existing topics; harmless.
- Dev reset for orders stuck before 010 (used in 010 T030): sum stuck orders' item quantities per product in
  `order_db`, check they equal `stock_levels.reserved` in `inventory_db`, then add them back to `quantity`, subtract
  from `reserved`, and set those orders to `CANCELLED` (version + 1). Run by hand with psql.
- After the frontend container is rebuilt, an open storefront tab can keep running the old code; hard-reload
  (Ctrl+Shift+R) before checking UI changes (010 T034: the first look missed the new cancel reason).
- The gateway rate limit is 100 requests per 15 min per IP (`RATE_LIMIT_*`); scripted polling through the gateway
  gets 429 quickly. Poll order status in `order_db` with psql for measurements.
- On Node 26 each KafkaJS consumer (inventory, notification, order, payment) logs one `TimeoutNegativeWarning` at
  startup: KafkaJS passes a negative delay to `setTimeout`. Node clamps it to 1 ms as before; harmless noise.
- Mocking in service tests: packages are CommonJS, so `tsc` rejects top-level `await import()` (TS1309) even
  though Vitest runs it. Use static imports (`vi.mock` is hoisted above them) and put any state the mock factory
  needs in `vi.hoisted(() => …)`. A ~10-line fake of `db(table).where(m).first()` / thenable `where` is enough for
  knex read paths (002).
- Stubbing Claude: `vi.mock('@anthropic-ai/sdk')` mocks only the package root, so `betaZodTool`
  (`@anthropic-ai/sdk/helpers/beta/zod`) and `ToolError` stay real. A fake `toolRunner` needs `params`, an async
  iterator yielding streams (each async-iterable with `finalMessage()`), and `done()` (011 T001,
  `assistant-service/src/agent/providers/anthropic.test.ts`).
- A fresh copy of a module per test (to reset module-level state such as a cached Kafka producer): use
  `vi.resetModules()` then `await vi.importActual<…>('./module')` inside the test. A dynamic `import('./module')`
  works in Vitest but fails the packages' nodenext typecheck (TS2835, needs `.js`) (011 T013).
- `Promise.race([work, timeout])` subscribes to `work`, so if the timeout wins, a later rejection of `work` is
  already handled; no extra `.catch()` is needed to avoid an unhandled rejection (011 T022, checked by a test).
- ...but the race only stops *waiting*: a KafkaJS `send` that lost the race keeps retrying and can still land.
  An idempotent KafkaJS producer with no `retry` option retries without limit (`Number.MAX_SAFE_INTEGER`; it
  refuses `retries: 0`). 011 T034 (2026-10-24): the "failed" handoff reached support ~50 s after Kafka came back.
  Fix (D-021): non-idempotent producer, `retries: 0`, 1 s connection/request timeouts.
- LM Studio on the dev machine (RTX 5080, 16 GB): `lms load` defaults (51,968-token context, 4 parallel slots)
  push part of the 18.6 GB Qwen3 30B model off the GPU, so turns took ~115 s; a JIT-loaded second copy (`…:2`)
  makes the whole PC lag. Load it as in `docs/lm-studio-setup.md` (16k context, 1 slot) → 0.5–6 s per turn.

- Prompt examples get copied literally by Qwen3 30B: a sample handoff reference (`HO-1A2B3C4D`) in the system
  prompt appeared in a reply with no handoff behind it (011 T035). Use placeholders, never realistic sample IDs. An
  imperative "call the tool straight away, before writing anything" for handoffs made it skip `search_products`
  and invent branded products; scoping the rule to handoffs plus an explicit "look up before naming any product"
  rule with a vague-question example fixed it (D-022). Re-check product grounding after any prompt change.
- Gateway proxy timeouts (005 T002): a stopped service gives a 502 from `on.error` (`ECONNREFUSED`), but a service
  that accepts the connection and never answers makes http-proxy-middleware close the client socket at
  `proxyTimeout` with **no** 502 (curl/fetch sees "socket closed"). Same in hpm 3 + Express 4 and hpm 4 + Express 5.
- `joi.validate(undefined)` on an object schema returns no error and `value: undefined`. Express 5 leaves `req.body`
  `undefined` when there is no body (it was `{}`), so a body-less POST would pass validation and then crash (005).
- TypeScript 7 (native) exports only `./unstable/*` from its package, so tools that `require('typescript')`
  (ts-node, custom AST scripts) don't work on it. Next.js 16.4 does type-check with it (005 T004).
- ESM-only packages (http-proxy-middleware 4) in a CommonJS TS package: Node 26 `require()`s them, but `tsc` with
  `module: Node16` fails with TS1479. `"module": "node20"` (root tsconfig) allows it and still emits CommonJS (005).
- `@types/express` 5 types `req.params` values as `string | string[]`. Type the handler's params
  (`req: Request<{ id: string }>`); tests then cast to that `Request<…>` type (005 T032).
- After a React major bump in one workspace, npm can keep the old React hoisted at the root for peer-dependent packages
  (`react-redux`, `@reduxjs/toolkit`) and nest the new one in the workspace: two Reacts, so hooks break at runtime
  while `tsc` and the build still pass. Check with `npm ls react --all`; `npm dedupe` fixes it (005 T040).
- Measuring chat replies: `chat.mjs` prints a multi-line reply; filtering its output with `grep '^reply'` shows
  only the first line and hides text written after a tool call (cost a false "reference missing" in T035).
- Many source files are CRLF in the working copy. In Git Bash, `sed -i` writes them back as LF, and `grep -c $'\r$'`
  miscounts them, so count line endings with Node (`/\r\n/g`) instead. Edit files with a tool that keeps the file's
  line ending (005 T077).
- Claude Code's Edit tool trims trailing whitespace at the end of `new_string`. An edit whose text ended in
  `export const x = ` lost the space before `(` on the next line. Don't end an edit's text inside a line (005 T077).
