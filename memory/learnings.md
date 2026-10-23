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

## Tests & build

- Vitest config at the root must be `vitest.config.mts`: the repo is CommonJS (no `"type": "module"`), and a `.ts`
  config prints a Vite "ESM syntax in a file loaded as CommonJS" warning once per project.
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
