# 001 — Test Harness · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred. Keep `feature.json` in step (same ids, same done state).

## Setup

- [x] **T001** — Spike (plan Risks): install `vitest@5` as a root dev dependency, add `vitest.config.ts` (one
      project per `packages/*`, `@ecommerce/shared` alias), set root `test` → `vitest run`, add one trivial test in
      `packages/shared` and one in `packages/frontend`. Confirm `tsc --noEmit` accepts `import … from 'vitest'` in
      the CommonJS-mode shared package and in the bundler-mode frontend, and that a CJS dependency
      (`jsonwebtoken`) imports under Vitest. If TS1479 appears, switch to the `globals` fallback and record it in
      `memory/learnings.md` · files: `package.json`, `package-lock.json`, `vitest.config.ts`,
      `packages/shared/src/harness.test.ts` (trivial, removed in T013), `packages/frontend/src/harness.test.ts`
      (trivial, removed in T014) · test: `npm test` lists both projects as passing; `npm run check` passes
      **Result (2026-10-23):** Vitest 5.0.5 installed at the root. No TS1479: `vitest` ships `require` types
      (`index.d.cts`), so `import … from 'vitest'` typechecks in the CommonJS-mode shared package and in the
      frontend; `jsonwebtoken` imports fine under Vitest. Config is `vitest.config.mts` (a `.ts` config gives a Vite
      "ESM syntax in a file loaded as CommonJS" warning per project). Added `reporters: [['default', { summary:
      false }]]` so each file is listed when output is not a terminal (AC-1). 2 files, 2 tests, 128 ms.
- [x] **T002** — Add the `unit tests` job to the gate · files: `scripts/check.mjs` · test: `npm run check` shows
      `ok   unit tests`; a temporary failing assertion shows `FAIL unit tests`, names `|shared|` and the file and
      test, and exits 1; restored, it passes (AC-3)
      **Result (2026-10-23):** gate now 13 checks. A broken assertion in `harness.test.ts` printed `FAIL unit tests`
      with `FAIL  |shared| src/harness.test.ts > harness (shared) > runs TypeScript and imports a CommonJS
      dependency` and exited 1; restored, all 13 pass.
- [x] **T003** [P] — Keep tests out of builds and images: `tsconfig.build.json` in the 9 `tsc`-built packages,
      their `build` scripts → `tsc -p tsconfig.build.json`, root `.dockerignore` with `**/*.test.ts` · files:
      `packages/{shared,auth-service,product-service,cart-service,order-service,inventory-service,payment-service,notification-service,assistant-service}/{tsconfig.build.json,package.json}`,
      `.dockerignore` · test: `npm run build` passes and `packages/*/dist` has no `*.test.*` (AC-11, first half)
      **Result (2026-10-23):** 9 `tsconfig.build.json` + build scripts, root `.dockerignore`. `npm run build` exit 0;
      `find packages/*/dist -name '*.test.*'` finds nothing while `shared/src/harness.test.ts` exists. Found: shared
      emits no `.d.ts`, so services resolve `@ecommerce/shared` to `dist/index.js`, untyped (pre-existing; learnings).

## Tests First

- [x] **T010** — Failing tests for order transitions: every listed pair accepted by `canTransitionOrder`, ≥ 3
      unlisted pairs rejected (including from `DELIVERED` and `CANCELLED`), an unknown status rejected, every
      `OrderStatus` has a table entry · files: `packages/shared/src/events.test.ts` · test: fails first (no
      `canTransitionOrder` export)
      **Result (2026-10-23):** failed first: 14 of 15 (`canTransitionOrder` not a function; tsc TS2305). Strengthened in
      T013: the 7 allowed transitions are written out instead of read from the table (16 tests).
- [x] **T011** [P] — Tests for the JWT helpers: round trip (`id`, `email`, `role`); expired via fake timers (sign
      at T, verify at T + 16 min); wrong secret; modified payload segment · files: `packages/shared/src/jwt.test.ts`
      · test: break `verifyToken` (e.g. `ignoreExpiration: true`) → the expiry test fails; restore (AC-10)
      **Result (2026-10-23):** 4 tests pass. Seen failing: `ignoreExpiration: true` → expiry test fails; `jwt.decode`
      instead of `verify` → expiry, wrong-secret and modified-token tests fail; signing `role: 'admin'` → round trip
      fails. All restored (no diff).
- [x] **T012** [P] — Tests for `requireInternalToken`: right token passes; missing and wrong token → `next`
      receives an `UnauthorizedError` with `statusCode` 401; `/health` passes without a token; no token
      configured → passes (pinned) · files: `packages/shared/src/middleware/internalAuth.test.ts` · test: make the
      middleware always call `next()` → the rejection tests fail; restore (AC-10)
      **Result (2026-10-23):** 6 tests pass. Seen failing: always `next()` → 3 rejection tests fail; always
      `next(new UnauthorizedError())` → right-token, `/health` and no-token tests fail. Restored (no diff).

## Core

- [x] **T013** — Add `canTransitionOrder(from, to)` to shared and use it in `orderService.updateOrderStatus`,
      replacing the inline lookup; remove `packages/shared/src/harness.test.ts` · files:
      `packages/shared/src/events.ts`, `packages/order-service/src/services/orderService.ts` · test: T010 passes;
      remove one transition from the table → T010 fails; restore (AC-10)
      **Result (2026-10-23):** 16 tests pass; shared rebuilt (`dist` exports `canTransitionOrder`, needed by
      order-service at runtime). First break (remove SHIPPED → DELIVERED) went unnoticed: the "allows" cases were
      generated from the table, so its test vanished too. Pinned the 7 transitions explicitly; now removing one fails
      2 tests, adding SHIPPED → CANCELLED fails 2, and `canTransitionOrder = () => true` fails 7. Restored.
- [x] **T014** [P] — Frontend smoke test for `formatCurrency`, `getStatusClass` and `getGreeting(date)`; remove
      `packages/frontend/src/harness.test.ts` · files: `packages/frontend/src/utils/storePresentation.test.ts` ·
      test: passes under the `frontend` project; `npm run check` passes the frontend typecheck
      **Result (2026-10-23):** 13 tests pass under `|frontend|`; `getGreeting` boundaries use local-time dates. Suite:
      4 files, 39 tests, 133 ms.

## Integration

- [x] **T020** — Measure the harness from a clean install: `npm ci && npm test` (summary, exit 0); add a throwaway
      `packages/cart-service/src/probe.test.ts`, see it run without config edits, then delete it; break one
      assertion and record the exit code and the failing file and test name from `npm test`; time `npm test` 3×
      and record the worst (≤ 30 s) · files: none kept · test: recorded numbers (AC-1, AC-2, AC-4, AC-6)
      **Result (2026-10-23):** `npm ci` exit 0, then `npm test` exit 0: 4 files, 39 tests, per-file lines with project
      labels. Throwaway `cart-service/src/probe.test.ts` ran as `|cart-service|` (5 files) with no config edit, then
      deleted. A broken round-trip assertion: `npm test` exit 1, `FAIL  |shared| src/jwt.test.ts > JWT helpers >
      verifies a signed token back to the same identity`; restored (identical to backup). Wall-clock 3 runs: 799,
      874, 872 ms (worst 0.87 s vs 30 s budget).
- [x] **T021** — Offline run: stop Docker, disconnect the network, run `npm test`, and record the result (AC-5)
      **Result (2026-10-23):** RVicky172 ran `npm test` with Docker stopped and the network off (as reported;
      containers showed ~1 min uptime afterwards): 4 files, 39 tests passed, 146 ms. Independent check: the suite
      run with a preload that makes `net.Socket.connect` and `dns.lookup` throw (`NODE_OPTIONS=--require …`) passes
      39/39; a throwaway test connecting to :5432 fails under the same preload, proving it reaches Vitest's
      workers.
- [x] **T022** — Move every `packages/*/Dockerfile` to `node:26-alpine` and the root `engines` to `>=26.0.0` (plan
      §7a, D-009) · files: `packages/*/Dockerfile` (10), `package.json` · test: `docker compose build` of all 10
      images exits 0
      **Result (2026-10-23):** 10 Dockerfiles → `node:26-alpine` (Node 26.12.1, npm 11.20.0), root `engines` →
      `>=26.0.0` (lockfile synced). `docker compose build` of all 10 images exit 0. Before: `node:20-alpine` builds
      failed with npm 10.8.2 "reading 'edgesOut'" (frontend and order-service reproduced; committed `package.json`
      builds, current one fails).
- [x] **T023** — Docker: confirm no `*.test.ts` outside `node_modules` and no `vitest` in the order-service and
      frontend images; `docker compose up -d --build` → every service `/health` healthy (frontend `GET /` 200);
      note whether root dev dependencies landed in images (plan Risks) · test: recorded output (AC-11, second
      half; DoD 5)
      **Result (2026-10-23):** order-service, frontend and api-gateway images: no `*.test.ts` outside `node_modules`,
      no `vitest` (root dev dependencies are not installed by `npm install --workspace=…`). `docker compose up -d
      --wait` exit 0; `/health` 200 on all 9 services (4000–4008), frontend `GET /` 200. order-service image exports
      `canTransitionOrder`; it logs "Order Service started". New on Node 26: one `TimeoutNegativeWarning` at
      startup in each Kafka consumer (inventory, notification, order, payment), from KafkaJS; harmless (learnings).

## Verify

- [x] **T090** — Docs: `specs/testing-strategy.md` (layer table, commands), `CLAUDE.md` (`npm test` line),
      `README.md` testing section (root `npm test`, no per-workspace or `--coverage` commands that don't apply,
      Node ≥ 26), `specs/tech-stack.md` runtime row, and `specs/architecture.md` (where tests live, the build/test tsconfig split) ·
      test: no "none yet" or "planned" left for unit tests (AC-12)
      **Result (2026-10-23):** `testing-strategy.md` (layer table, "Writing a unit test" rules, commands), `CLAUDE.md`
      (command lines), `README.md` (Node 26, testing section: removed the non-working per-workspace and
      `--coverage` commands), `architecture.md` (layout, test/build tsconfig split, `canTransitionOrder`, Node 26).
      `tech-stack.md` was updated with D-008/D-009. Search for "none yet"/"planned" near tests in the four docs:
      no hits.
- [x] **T091** — Every Definition-of-Done gate green (`specs/constitution.md`): `npm run check`, `npm run build`,
      every service `/health`; record the numbers
      **Result (2026-10-23):** `npm run check` 13/13; `npm run build` exit 0, no `*.test.*` in any `dist`;
      `/health` 200 on :4000–4008 and `GET /` 200 on :3000; `npx vitest run` 3× → 39/39 each (no flakes).
- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), update `roadmap.md`/`roadmap.json`,
      `memory/progress.md`, `memory/MEMORY.md`
      **Result (2026-10-23):** AC-1–AC-12 ticked; spec Implemented; roadmap ✔️; progress and memory updated.

## AC coverage

| AC    | Tasks                  |
| ----- | ---------------------- |
| AC-1  | T001, T020             |
| AC-2  | T020                   |
| AC-3  | T002                   |
| AC-4  | T001, T020             |
| AC-5  | T021                   |
| AC-6  | T020                   |
| AC-7  | T010, T013             |
| AC-8  | T011                   |
| AC-9  | T012                   |
| AC-10 | T011, T012, T013       |
| AC-11 | T003, T022, T023       |
| AC-12 | T090                   |
