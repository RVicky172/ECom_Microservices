# 005 — Dependency Upgrades, Dependabot, JSDoc and Clean-Code Rules · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists its files and the test that proves it.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, the numbers
measured, anything surprising or deferred. Keep `feature.json` in step (same ids, same done state).
Every upgrade step ends with `npm run check` and `npm run build` green. The step is then ready to be its own
commit, `chore(005): step N — …`, committed when the user asks (CLAUDE.md). Each major upgrade gets its
`memory/decisions.md` entry in the task that does it (AC-13).

## Setup — baseline and spikes (plan §0)

- [x] **T001** — Record the baseline before changing anything:
      - `npm outdated` for the root (all workspaces) and for `tools/spec-dashboard`;
      - `npm ls @types/express express typescript react` and the stub packages;
      - `npm audit --omit=dev` (high and critical counts);
      - the unit-test count (237);
      - on the running stack, register `upgrade-baseline@example.com` through the gateway and save its
        credentials in `.env.local-notes` (git-ignored) for AC-5.

      · files: none (record here) · test: recorded output
  - **Result (2026-10-25):** `npm outdated` (root + workspaces) → 74 rows, 24 distinct packages behind
    (the spec table plus `http-proxy-middleware` wanted 3.0.10); dashboard → 3 (`@types/node` 22.20.5, `next`
    16.4.2, `typescript` 5.9.3). `npm ls`: express@4 ×10, @types/express@4 ×10, react@18 ×7, typescript@5 ×9 and
    @7 ×3; stubs @types/http-proxy-middleware@0.19.3, @types/ioredis@5.0.0 ×2, @types/uuid@9.0.8 ×2 and @10.0.0.
    `npm audit --omit=dev`: 5 (2 high: body-parser <1.20.9, follow-redirects 1.16.0; 3 moderate: react-router
    ≤7.17.0 ×2 advisories, uuid <11.1.1); dashboard 0. Unit tests 237. Stack started (old images), 10/10
    `/health` 200; `upgrade-baseline@example.com` registered through the gateway (user `d4f2171f-…`), login 200,
    credentials in `.env.local-notes` (ignored by `.env.*`).
- [x] **T002** [P] — Spike S1: for each of `http-proxy-middleware` 4, `ioredis` 6, `joi` 18 and `pino` 10:
      - a scratch script outside the repo checks that it loads from CommonJS (`tsc` output) and under `tsx`;
      - list the API changes that hit our call sites (`proxy.ts` `on.proxyReq` / `on.error` / `proxyTimeout`;
        `new Redis({...})`; `schema.validate`; `pino({ timestamp })`).

      · files: none · test: recorded output
  - **Result (2026-10-25):** scratch project outside the repo, old and new versions side by side.
    - **Loading:** all of `http-proxy-middleware` 4.2.1 (ESM, `"type": "module"`), `ioredis` 6, `joi` 18, `pino` 10
      and `bcryptjs` 3 load with `require()` on Node 26.8.1. No CommonJS exception is needed.
    - **hpm 4 + Express 5** vs hpm 3.0.7 + Express 4.22.3, with our exact `createProxy` options (`changeOrigin`,
      `pathRewrite` fn, `proxyTimeout`/`timeout`, `on.proxyReq` remove/set headers, `on.error` → 502): identical.
      Path rewrite and header stripping/forwarding OK; SSE chunks arrive at ~310/620/930 ms (streamed, not
      buffered); dead target → 502 `ECONNREFUSED`. A target that never answers closes the client socket at the
      timeout **in both** (no 502): existing behaviour, unchanged. hpm 4 runs on `httpxy`, which keeps the
      `changeOrigin`, `proxyTimeout` and `timeout` options. → `proxy.ts` needs no change.
    - **joi 17.13.8 vs 18.3.0:** identical errors and values on 6 cases covering every construct we use (email,
      min/max, integer, positive, uri, allow(''), array, string→number coercion). `validate(undefined)` returns no
      error and `value` undefined in both: the Express 5 empty-body risk is real (T030).
    - **pino 9 vs 10** with shared's exact config: same keys (`level,time,pid,hostname,name,…,msg`), level
      label, ISO time.
    - **ioredis 5 vs 6** against the local Redis, every command we call (`set` EX/NX, `get`, `hset`, `hget`,
      `hgetall`, `hdel`, `expire`, `multi().exec()`, `del`, `connect`): identical replies; `default === Redis`, so
      `import Redis from 'ioredis'` still works.
- [x] **T003** [P] — Spike S2:
      - hash a password with `bcryptjs` 2.4.3 and with 3.0.3;
      - check `compare` in both directions;
      - save one 2.4.3 hash and its password as a test vector for T026.

      · files: none · test: recorded output
  - **Result (2026-10-25):** 2.4.3 writes `$2a$10$…`, 3.0.3 writes `$2b$10$…`. 3.0.3 `compare` accepts a 2.4.3
    hash (and rejects a wrong password); 2.4.3 accepts a 3.0.3 hash. Vector for T026: password
    `Baseline-pass-1`, hash `$2a$10$hAnQLqW3EUiSRQL5UJd/KuFw/N6lM6nxNSDYFyXEozXj/riaJOp3u`.
- [x] **T004** [P] — Spike S3: in a scratch copy of `tools/spec-dashboard`, put `typescript` on 7.0.2 and run
      `NODE_ENV=production npx next build`. Pass → TS 7 there. Fail → record the error as exception E1 for the
      spec (Q3) · files: none · test: recorded output
  - **Result (2026-10-25):** copy with `next` 16.4.3, `typescript` 7.0.2, `@types/node` 26.6.5:
    `NODE_ENV=production npx next build` passes ("Running TypeScript … Finished"). With an injected type error it
    fails with exit 1 and `TS2322`, so Next really type-checks with TS 7. `tsc --noEmit` also works. → **no
    exception E1**: the dashboard moves to TS 7 in T050. D-005's reason for 5.9 no longer holds. (The copy's
    tracking-file test fails only because it runs outside the repo.)
- [x] **T005** [P] — Spike S4: in a scratch copy of `packages/frontend`, upgrade to React 19, `react-router` 8,
      Vite 8 and `@vitejs/plugin-react` 6, and change the router imports to `react-router`. Run `npm run build`
      and list every change it needs · files: none · test: recorded output
  - **Result (2026-10-25):** copy with React/react-dom 19.3.1, `@types/react(-dom)` 19.3.0, `react-router` 8.5.0
    (no `react-router-dom`), Vite 8.3.5, `@vitejs/plugin-react` 6.1.2, TS 7.0.2. The only change: the 8
    `'react-router-dom'` imports become `'react-router'`. `tsc && vite build` passes: 188 modules, JS 712 kB
    (gzip 220 kB), plus Vite's >500 kB chunk warning (to compare with the current build in T040). The test files
    were dropped from the copy because vitest is a root dependency.
- [x] **T006** [P] — Record `uuid` 9 `v5` outputs for the T020 vectors: the RFC example (`www.example.com`, DNS
      namespace) and 3 real `eventId`s under `PAYMENT_OUTCOME_NAMESPACE` (taken from `payment_db` or a fixed
      sample) · files: none · test: recorded output
  - **Result (2026-10-25):** `uuid` 9.0.1 `v5`, `PAYMENT_OUTCOME_NAMESPACE` = `6f1c2d9e-5b4a-4c3e-9f8d-7a6b5c4d3e2f`:
    - RFC `v5('www.example.com', DNS)` = `2ed6657d-e927-568b-95e1-2665a8aea6a2`
    - `3f1c2b9e-8d4a-4f6b-9c1e-2a7d5e8f0b13` → `22fa61a6-6aaf-5396-ab31-f656006e6f5e`
    - `a9e0c4d2-1b3f-4e5a-8c7d-6f2e1a0b9c84` → `6acc8a93-6e00-5f82-95b9-64f4def6cf80`
    - `0e7d6c5b-4a39-4281-b7c6-d5e4f3a2b1c0` → `f904dd82-2542-55d6-ab2e-684732567150`

    (Fixed sample event IDs, not taken from `payment_db`.)
- [x] **T007** — Remove the unused dependencies:
      - gateway: `express-rate-limit`, `opossum`;
      - order: `axios`, `mongoose`, `bcryptjs`;
      - payment and shared: `joi`;
      - first, grep again for each one in `src` and `scripts`.

      Then `npm install`, check, build, and rebuild the gateway, order and payment images → `/health`. Add the
      decision entry for the removals · files: `packages/{api-gateway,order-service,payment-service,shared}/package.json`,
      `package-lock.json`, `memory/decisions.md` · test: `npm run check`, `npm run build`, `/health`

  - **Result (2026-10-25):** re-grep found 0 references to each. Removed with `npm uninstall -w …`: gateway
    `express-rate-limit`, `opossum`; order `axios`, `mongoose`, `bcryptjs`; payment and shared `joi` (npm also
    sorted those `package.json` keys). README: the opossum and express-rate-limit rows and the "circuit
    breakers" claim are gone, and rate limiting points at the in-house middleware. Check 13/13, build exit 0;
    gateway, order and payment rebuilt → `/health` 200. D-032.
## Step 1 — tooling and types (plan §1)

- [x] **T010** — In every package that lists them:
      - TypeScript `^7.0.2` and `@types/node ^26.6.5`;
      - remove `ts-node`, `@types/ioredis` and `@types/http-proxy-middleware`;
      - each service's `dev` script → `tsx watch src/index.ts`.

      Fix every new TS 7 error in code, not by relaxing the tsconfig; stop and report if there are more than ~50.
      Rebuild all images → 10/10 `/health`. Add the decision entry for TypeScript 7 · files:
      `packages/*/package.json`, `package-lock.json`, any file with a TS 7 error, `memory/decisions.md` · test:
      `npm run check`, `npm run build`, `/health`

  - **Result (2026-10-25):** 10 `package.json`s changed:
    - TS `^7.0.2` and `@types/node ^26.6.5` in 8 services and the frontend;
    - `ts-node` removed from the 8 services, `@types/ioredis` from cart and product, and
      `@types/http-proxy-middleware` from the gateway;
    - every service's `dev` is now `tsx watch src/index.ts`.

    `npm install` removed 44 packages. `npm ls`: typescript@7 ×11 (no 5), @types/node@26 ×48. **0 new TS 7
    errors**: the check typecheck was already using the root's TS 7, and the package builds now use 7.0.2 too.
    Check 13/13, build exit 0 (the Vite >500 kB warning is unchanged). `npm run dev` under tsx starts auth and
    notification (connection errors only because `.env` hosts are Docker names). `docker compose up -d --build`
    → 10/10 `/health` 200; the auth image has TS 7.0.2; the baseline user signs in (200). D-033.
## Step 2 — backend libraries (plan §2)

- [x] **T020** — Failing tests for `uuidV5` (`packages/shared/src/uuid.test.ts`):
      - the T006 vectors;
      - the version nibble is 5 and the variant bits are `10`;
      - the same input gives the same output;
      - an invalid namespace throws.

      Seen failing (no module yet) · files: `packages/shared/src/uuid.test.ts`
  - **Result (2026-10-25):** `packages/shared/src/uuid.test.ts`, 6 tests: the RFC example, the 3 T006 payment
    vectors, the version and variant pattern, determinism, an upper-case namespace, and an invalid namespace →
    `TypeError`. Seen failing: "Cannot find module './uuid'".
- [x] **T021** — Implement `uuidV5` (`node:crypto` SHA-1) and export it from shared. Then:
      - v4 → `crypto.randomUUID()` in shared `kafka.ts`, `middleware/correlationId.ts` and order
        `orderService.ts`;
      - payment's `sagaHandlers.ts` uses the shared `uuidV5`;
      - remove `uuid` and `@types/uuid` everywhere.

      Break check: drop the variant bits → T020 fails · files: `packages/shared/src/{uuid.ts,index.ts,kafka.ts,middleware/correlationId.ts}`,
      `packages/order-service/src/services/orderService.ts`, `packages/payment-service/src/events/sagaHandlers.ts`,
      `package.json`s · test: T020, the payment saga tests
  - **Result (2026-10-25):** `src/uuid.ts` (SHA-1 of namespace bytes + name, version and variant bits set),
    exported from shared's `index.ts`. `randomUUID` in shared `kafka.ts`, `middleware/correlationId.ts` and order
    `orderService.ts` (3 call sites); payment `sagaHandlers.ts` → `uuidV5`. `uuid` and `@types/uuid` uninstalled
    from shared, order and payment (4 packages removed; `npm ls uuid` empty). Break check: without the variant
    line, 4 of 6 tests fail; restored → 6/6. Tests 243 (237 + 6). Check 13/13, build exit 0. Shared had to be
    rebuilt before payment's typecheck saw `uuidV5` (D-029 behaviour). The live saga run is in T027. D-034.
- [x] **T022** — `joi` 18 in auth, cart, inventory, order and product, applying T002's findings. The existing
      validation tests must still give the same 400 bodies. Decision entry · files: those services'
      `package.json` and any changed validator · test: the existing controller tests
  - **Result (2026-10-25):** `joi ^18.3.0` in auth, cart, inventory, order and product (`npm ls`: joi@18.3.0 ×5).
    No validator changes. The existing controller tests pass (243). Live through the gateway: bad register →
    400 `"email" must be a valid email`; cart add missing `name` → 400 `"name" is required` (the same bodies as
    joi 17). D-035.
- [x] **T023** [P] — `pino` 10 in shared, with T002's findings. Decision entry · files:
      `packages/shared/package.json`, `src/logger.ts` if needed · test: `npm run check`; one service logs JSON
      with `correlationId`
  - **Result (2026-10-25):** `pino ^10.4.0` in shared. `logger.ts` unchanged. After the rebuild, the services log
    the same JSON (`level` label, ISO `time`, `name`), and a request with `x-correlation-id: corr-005-t023` shows
    that ID in product-service's log line. D-035.
- [x] **T024** [P] — `ioredis` 6 in assistant, cart and product, with T002's findings. Decision entry · files:
      their `package.json`, Redis client files if needed · test: `npm run check`; cart add/read on the rebuilt
      stack
  - **Result (2026-10-25):** `ioredis ^6.0.0` in assistant, cart and product. No client changes. Live: as the
    baseline user, cart add → 201, quantity 3 → 200, read → itemCount 1 total 30, remove → itemCount 0; product
    by ID (cache path) → 200. D-035.
- [x] **T025** [P] — `mongoose` 9.11 in product and the root (seed script) · files: `packages/product-service/package.json`,
      `package.json` · test: `npm run check`; `npm run seed` on a fresh `product_db`; products list
  - **Result (2026-10-25):** `mongoose ^9.11.4` in product (was 8.24.4) and the root (was 9.10.1); `npm ls`
    mongoose@9.11.4 ×2. **Test changed:** `npm run seed` deletes every product and resets inventory, which would
    break the existing carts and orders in the dev data. So instead, the seed's Mongo operations (schema with
    timestamps, `deleteMany`, `insertMany`, a regex `find` with `lean`) ran on a throwaway `seedcheck_005`
    database, which was then dropped: they work on 9.11.4. Live: product-service "Connected to MongoDB"; list
    → 4 products, `?search=lap` → 200. D-035.
- [x] **T026** — `bcryptjs` 3 (auth and root seed). Test first: an auth service test that `compare` accepts the
      T003 2.4.3 vector, seen failing against a wrong hash. Drop `@types/bcryptjs` if 3 ships its own types.
      Decision entry · files: `packages/auth-service/package.json`, `src/services/authService.test.ts`,
      `package.json` · test: the new test; sign-in for `upgrade-baseline@example.com`
  - **Result (2026-10-25):** new `packages/auth-service/src/services/authService.test.ts` (the first auth tests; a
    knex fake as in the testing strategy), 3 tests:
    - `login` accepts the T003 2.4.3 hash and returns a verifiable JWT and one refresh session;
    - a wrong password and an unknown email give the same `ValidationError`, with no session;
    - a user made by `register` signs in, with a hash matching `$2[ab]$10$`.

    Break check: one character of the vector changed → the first test fails; restored. On 2.4.3 all 3 passed.
    Then `bcryptjs ^3.0.3` in auth and the root, and `@types/bcryptjs` removed (3 ships `umd/index.d.ts`);
    `npm ls`: bcryptjs@3.0.3 ×2. Check 13/13, 246 tests, build exit 0. Auth rebuilt → 200. Live: the baseline
    user (stored `$2a$10$`) logs in → 200; a new user registers → 201 (stored `$2b$10$`) and logs in → 200; a
    wrong password → 400. D-036.
- [x] **T027** — Remaining minors and patches from `npm outdated`: `pg`, `@anthropic-ai/sdk` 1.3, `axios`,
      `jsonwebtoken`, `cors`, `knex`, `kafkajs`, `openai`, `zod`, `tsx` and `vitest`. Then check and build,
      rebuild all images → 10/10 `/health`, and put one order through the saga to its final state · files:
      `package.json`s, `package-lock.json` · test: `npm run check`, `npm run build`, `/health`, order status

  - **Result (2026-10-25):** after T022–T026, `npm outdated` lists only two minor or patch updates: `pg` 8.23.0 →
    8.23.1 (auth, inventory, order, payment and the root) and `@anthropic-ai/sdk` 1.1.0 → 1.3.0 (assistant). Both
    are installed. `axios`, `jsonwebtoken`, `cors`, `knex`, `kafkajs`, `openai`, `zod`, `tsx` and `vitest` were
    already at their latest. Check 13/13, 246 tests (the Anthropic SDK-stub tests pass on 1.3), build exit 0.
    `docker compose up -d --build` → 10/10 `/health` 200. Saga: the baseline user orders 1 × Mouse → 201 →
    `CONFIRMED` in 3 s, and the payment shows `COMPLETED` (this exercises `randomUUID` order IDs and the
    `uuidV5` outcome event ID live). Step 2 is complete.
## Step 3 — Express 5 (plan §3)

- [x] **T030** — Failing tests for the empty body:
      - `bodyOf(req)` in shared: `undefined` → `{}`, an object → itself;
      - one controller test per service: no body (`req.body` undefined) → `next` gets a 400 `ValidationError`,
        and the service is not called. That's auth register and login, cart add and update, inventory set stock,
        order create, and product create and update.

      Seen failing on the current code · files: `packages/shared/src/<http helper>.test.ts`,
      `packages/{auth,cart,inventory,order,product}-service/src/controllers/*.test.ts`
  - **Result (2026-10-25):** **Test changed from the task text:** these controllers answer 400 with
    `res.status(400).json(...)`, not `next(ValidationError)`. So the tests pin today's Express 4 response for an
    empty body (`{}`): 400 with the first Joi message, no service call, and `next` not called. New:
    - `shared/src/request.test.ts` (3);
    - `authController.test.ts` (register, login → `"email" is required`);
    - `cartController.test.ts` (add → `"productId"`, update → `"quantity"`);
    - `inventoryController.test.ts` (set stock → `"quantity"`);
    - `productController.test.ts` (create → `"name"`; update → `updateProduct(id, {})`, as Express 4 did);
    - in the existing `orderController.test.ts`, create → `"items" is required`.

    Seen failing with `req.body` undefined: 8 controller tests, and the shared file fails with "module not found".
    With `undefined`, Joi passed and the services were called.
- [x] **T031** — Implement `bodyOf` and use it in those controllers. Break check: return `req.body` unchanged →
      T030 fails · files: the shared helper and `index.ts`, those controllers · test: T030
  - **Result (2026-10-25):** `packages/shared/src/request.ts` `bodyOf(req)` (`undefined` → `{}`, anything else
    as-is), exported from `index.ts`. Used at all 8 call sites: auth register and login, cart add and update,
    inventory set stock, order create, product create and update (the update casts to `Partial<IProduct>`). Break
    check: `bodyOf` returning `req.body` → 9 tests fail; restored → 257 pass. Check 13/13.
- [x] **T032** — `express ^5.3.0` and `@types/express ^5.0.6` everywhere, shared included; `http-proxy-middleware`
      4 in the gateway, with T002's findings for `proxy.ts`. Fix the type errors. Check that there's one Express
      major (`npm ls express @types/express`). Decision entries for Express 5 and hpm 4; mark D-029 superseded ·
      files: `packages/*/package.json`, `package-lock.json`, `packages/api-gateway/src/proxy.ts`, type fixes,
      `memory/decisions.md` · test: `npm run check`, `npm run build`
  - **Result (2026-10-25):** `express ^5.3.0` (gateway and 8 services), `@types/express ^5.0.6` (those and
    shared), `http-proxy-middleware ^4.2.1`; `npm ls --all`: express@5 ×9 and @types/express@5 ×10, no 4. Type
    errors fixed:
    - TS1479 in `proxy.ts` (ESM-only hpm under `module: Node16`) → root tsconfig `"module": "node20"`;
    - 17 × `string | string[]` from `req.params` in 6 services → 13 handlers typed with their route params;
    - 2 test casts.

    `proxy.ts` is unchanged. Check 13/13, 257 tests, build exit 0. D-037 (supersedes D-029's Express 4 types;
    D-029 is marked).
- [x] **T033** — Rebuild every image → 10/10 `/health`. Then AC-6 on the gateway:
      - `GET /api/v1/orders` without a JWT → 401;
      - the 101st request in 15 minutes from one IP → 429;
      - `docker compose stop cart`, then `GET /api/v1/cart` → 502 within the timeout; `start cart` → 200 again.

      Also: one assistant chat turn streams through the gateway (SSE events arrive incrementally), and
      `POST /api/v1/auth/login` with no body → 400 · files: none (record here) · test: recorded output

  - **Result (2026-10-25):** `docker compose up -d --build` → 10/10 `/health` 200 (the gateway on tsx 4.23.15).
    - `GET /api/v1/orders` without a JWT → 401.
    - `POST /auth/login` with no body → 400 `"email" is required`; `/auth/register` with an empty JSON body →
      the same; cart add with no body → 400 `"productId" is required`.
    - `docker compose stop cart-service`, then `GET /api/v1/cart` → 502 `{"error":"Bad Gateway"}` in 5.0 s
      (container name lookup); `start` → 200.
    - After a gateway restart: requests 1–100 → 200, the 101st → 429, `Retry-After: 896`. The gateway was
      restarted again to clear the counter.
    - `POST /assistant/chat` through the gateway → 200 `text/event-stream`, events `start` then `error`
      (`assistant_unavailable`): LM Studio isn't running on the host. Chunked streaming through hpm 4 was shown
      in spike T002; a live model reply is checked in T061.
## Step 4 — frontend (plan §4)

- [x] **T040** — Upgrade `react`/`react-dom` 19 and their types, `react-router` 8 (replacing `react-router-dom`),
      `vite` 8 and `@vitejs/plugin-react` 6, applying T005's changes. Run the frontend unit tests and
      `npm run build -w packages/frontend`. Decision entries for React 19, react-router 8 and Vite 8 · files:
      `packages/frontend/package.json`, `src/**` (router imports, T005 findings), `package-lock.json`,
      `memory/decisions.md` · test: `npm run check`, frontend build
  - **Result (2026-10-25):** `react`/`react-dom` 19.3.1, `@types/react(-dom)` 19.3.0, `react-router` 8.5.0
    (`react-router-dom` removed), `vite` 8.3.5, `@vitejs/plugin-react` 6.1.2. The 8 imports were renamed to
    `'react-router'`; no other code change. **Gotcha:** React 18 stayed hoisted for `react-redux` and RTK (two
    Reacts) → `npm dedupe` → one React 19.3.1 (`npm ls react --all`). The dedupe also tidied the lockfile (−11
    packages). Check 13/13, frontend tests 18/18, build exit 0; bundle 711 kB / gzip 220 kB (was 616 / 189).
    Frontend image rebuilt: Vite 8.3.5 dev server ready; in the container React 19.3.1 is the only copy (the same
    one `react-redux` resolves) and react-router is 8.5.0; `/src/main.tsx` and `/src/routes/router.tsx` → 200.
    D-038.
- [x] **T041** — Rebuild the frontend image, hard-reload the browser (see learnings), and open each of the 6
      pages: sign-in, register, catalog, cart, orders, order detail. Record that the console shows no errors, and
      do one add-to-cart and one assistant turn · files: none · test: recorded output (AC-7; may need the user in
      a browser)
  - **Result (2026-10-25):** checked by the user in a browser on the rebuilt frontend image (React 19.3.1,
    react-router 8.5.0, Vite 8.3.5): sign-in, register, catalog, cart, orders and order detail load, and
    add-to-cart and an assistant turn work. The user reported "everything working fine" (no console errors).

## Step 5 — spec dashboard (plan §5)

- [x] **T050** — Upgrade `tools/spec-dashboard`: `next`, `@types/node` 26 and `typescript` (7 if T004 passed,
      otherwise exception E1 written into the spec under Q3 with its reason, for the user to agree). Run
      `npm --prefix tools/spec-dashboard run check` and `NODE_ENV=production npx next build`, then load
      `npm run dashboard` · files: `tools/spec-dashboard/package.json`, its lockfile, `spec.md` (if E1) · test:
      dashboard check, build, a page load
  - **Result (2026-10-25):** `next` 16.4.3, `typescript` 7.0.2 (T004 passed, so no exception E1) and
    `@types/node` 26.6.5; dashboard `npm outdated` is empty. No code change. `npm --prefix tools/spec-dashboard run
    check`: `tsc` clean, 39/39 tests. `NODE_ENV=production npx next build`: compiled, "Finished TypeScript", 5
    routes. `npm run dashboard` (started after the install): `/` 200, `/features/005-dependency-upgrades-code-standards`
    200, `/memory` 200, `/api/events` streams. D-039.

## End to end after the upgrade

- [x] **T060** — AC-4: `docker compose build --no-cache`, then `up -d` → 10/10 `/health`. Record each image's
      build time · files: none · test: recorded output
  - **Result (2026-10-25):** each image built on its own with `docker compose build --no-cache <service>`
    (sequential, so the times don't overlap). All exit 0, total 139 s. Only `WORKDIR` on the `node:26-alpine`
    base was cached; every `npm install` and build ran fresh, and each image's `npm install` found 0
    vulnerabilities.

    | Image | Build | Packages installed |
    | --- | --- | --- |
    | api-gateway | 16 s | 124 |
    | assistant-service | 16 s | 126 |
    | auth-service | 14 s | 152 |
    | cart-service | 12 s | 124 |
    | frontend | 18 s | 70 |
    | inventory-service | 14 s | 151 |
    | notification-service | 13 s | 110 |
    | order-service | 12 s | 151 |
    | payment-service | 11 s | 143 |
    | product-service | 13 s | 141 |

    `docker compose up -d` → 10/10 `/health` 200 (gateway 4000, services 4001–4008, frontend 3000); the 7
    services with a Docker health check show `healthy`.
- [x] **T061** — AC-5, through the gateway on the rebuilt stack:
      - `upgrade-baseline@example.com` (from T001) signs in;
      - a new user registers and signs in;
      - products list and search;
      - cart add, change the quantity, remove;
      - one order reaches `CONFIRMED` and one (Laptop ×9999) reaches `CANCELLED` / `OUT_OF_STOCK`;
      - an assistant turn streams.

      · files: none · test: recorded output
  - **Result (2026-10-25):** through the gateway (`:4000`) on the T060 `--no-cache` stack:
    - `upgrade-baseline@example.com` (registered on the pre-upgrade stack, `$2a$` hash) → login 200;
    - a new user `t061-…@example.com` → register 201, login 200; a wrong password → 400;
    - products list → 200, 4 products; `?search=mou` → `Mouse`; by ID → 200;
    - cart: add Mouse → 201, quantity 3 → 200, read → itemCount 1 total 75, remove → 200, read → itemCount 0;
    - Mouse ×1 → 201 → `CONFIRMED` in 1.6 s; Laptop ×9999 → 201 → `CANCELLED`, `cancel_reason` `OUT_OF_STOCK`
      in 1.0 s;
    - assistant turn on LM Studio ("What is the status of my latest order?"): `start` at 67 ms, the first
      `text` delta at 3.1 s, then 70 `text` events spread over ~3 s, 2 `tool_status` events (`list_orders`
      done), and `done` (`stopReason: stop`) at 6.3 s: streamed through hpm 4, not buffered. This closes the
      model reply deferred from T033.
- [x] **T062** — AC-1/AC-2/NFR: run `npm outdated` (root and dashboard), `npm ls` for stubs and duplicate majors,
      and `npm audit --omit=dev`. List any exception in the spec under Q3, and any remaining high or critical
      advisory with its reason · files: `spec.md` (exceptions, if any) · test: recorded output
  - **Result (2026-10-25):**
    - **`npm outdated`:** only the root's `tsx` was behind (4.23.13 → 4.23.15, released after T027) → updated.
      Now empty for the root, every workspace (`--workspaces --include-workspace-root`) and the dashboard. **No
      exceptions** under Q3.
    - **`npm audit`:** `follow-redirects` 1.16.0 (high, GHSA-q3jh-wrc6-jgq8 and GHSA-8r9p-f939-6h3c; also in the T001
      baseline) came in through the frontend's `axios` 1.20.0. `npm update follow-redirects` → 1.16.1, inside
      axios's range (lockfile only). Now 0 vulnerabilities with and without `--omit=dev`; the dashboard has 0. The
      baseline's other 4 (body-parser, react-router ×2, uuid) went with T021, T032 and T040.
    - **Stubs:** `npm ls` finds no `@types/ioredis`, `@types/uuid`, `@types/http-proxy-middleware`,
      `@types/bcryptjs`, `ts-node` or `uuid`, and no installed `@types` package is deprecated.
    - **Majors:** each declared library has one major: express@5 ×9, @types/express@5 ×10, typescript@7 ×11,
      react@19, react-router@8, vite@8, joi@18, pino@10, ioredis@6, mongoose@9, bcryptjs@3,
      http-proxy-middleware@4. A lockfile scan finds two transitive packages in two majors, each held by an
      upstream range: `mime-types` 3 (express 5) and 2 (`form-data` via axios), and `picomatch` 4 (vite, vitest)
      and 2 (`micromatch` via hpm 4). The user agreed to narrow AC-2 to declared libraries (spec Changelog); these
      two are recorded here, not overridden.
    - Check 13/13, build exit 0.

## Dependabot (plan §6)

- [x] **T070** — Write `.github/dependabot.yml`:
      - `npm` on `/` and `/tools/spec-dashboard`, plus `docker` on `/packages/*`;
      - weekly, Monday 09:00 `Asia/Kolkata`;
      - a `minor-and-patch` group;
      - at most 5 PRs, label `dependencies`, target `main`.

      Validate it against the Dependabot schema (a JSON Schema check, outside the repo) · files:
      `.github/dependabot.yml` · test: schema check
  - **Result (2026-10-25):** `.github/dependabot.yml`, version 2, 3 entries: `npm` on `/` (the workspaces), `npm`
    on `/tools/spec-dashboard` (its own lockfile), and `docker` with `directories: ["/packages/*"]` (the 10
    Dockerfiles). Each: weekly, Monday `"09:00"` `Asia/Kolkata`, `open-pull-requests-limit: 5`, label
    `dependencies`, `target-branch: main`, and group `minor-and-patch` (`applies-to: version-updates`,
    `update-types: [minor, patch]`), so each major gets its own PR. Schema check in a scratch folder outside the
    repo (SchemaStore `dependabot-2.0.json`, ajv 8 + yaml 2): valid, 3 entries. Break check: `interval:
    fortnightly` → invalid at `/updates/0/schedule/interval`. GitHub's own check is T072.
- [x] **T071** [P] — "Reviewing a Dependabot PR" in `specs/workflow.md`: check out the PR, `npm ci`,
      `npm run check`, `npm run build`, rebuild the affected images, `/health`, and a decision entry for a major.
      Link it from `README.md` · files: `specs/workflow.md`, `README.md` · test: manual review (AC-9)
  - **Result (2026-10-25):** new section "Reviewing a Dependabot PR" in `specs/workflow.md` (before "Slash
    commands"), 6 steps: `gh pr checkout`; `npm ci` (dashboard: `--prefix tools/spec-dashboard`); check and build
    (plus the dashboard's check and `next build`); rebuild the affected images (all of them for `shared` or a
    base image) and `/health`; for a major, release notes, an end-to-end try and a `decisions.md` entry (code
    changes → a spec); merge only when green. `README.md` links it from a new "Review a Dependabot pull
    request" step after "Update one service after dependency changes". Waiting for the user's review (AC-9).
- [ ] **T072** — Once the branch is on GitHub (pushed when the user asks), check that the repository's Dependabot
      page shows the configuration with no errors. The user switches on security updates in the repo settings ·
      files: none · test: recorded output (AC-8)

## JSDoc check (plan §7)

- [x] **T075** — Failing tests for `findMissingDocs` (`scripts/lib/docCheck.test.mjs`), plus a `scripts` project
      in `vitest.config.mts`. Cases:
      - a missing header;
      - a header after a blank line (ok);
      - an undocumented `export function`, `const`, `interface`, `type`, `enum` and `class`;
      - a documented one;
      - a `//` comment (doesn't count);
      - a decorator between the comment and the export (miss);
      - `export { a } from` and `export *` (skipped);
      - `export default foo;` (skipped);
      - CRLF line endings.

      Seen failing · files: `scripts/lib/docCheck.test.mjs`, `vitest.config.mts`
  - **Result (2026-10-25):** `scripts/lib/docCheck.test.mjs`, 14 tests covering every case listed, plus a `/* */`
    block (not JSDoc, as a header or above an export), an empty file, an anonymous default export (name
    `default`), `export type { … }` lists, and indented or commented-out `export` lines. New `scripts` project in
    `vitest.config.mts` (`scripts/**/*.test.mjs`), so `npm test` and `npm run check` run it. Seen failing: first
    "Cannot find module './docCheck.mjs'", then against a stub returning `[]`: 8 fail; the 6 "accepts"/"skips"
    cases pass, and they guard against over-reporting.
- [x] **T076** — Implement `scripts/lib/docCheck.mjs` and the CLI `scripts/check-docs.mjs`: it walks
      `packages/*/src` (no tests, no `.d.ts`), prints `file:line kind name`, exits 1 on a miss, and takes
      `--package <name>`. Record the baseline counts (expected around 86/111 files and 121/264 exports). Break
      check: ignore the `*/` line → T075 fails · files: `scripts/lib/docCheck.mjs`, `scripts/check-docs.mjs` ·
      test: T075
  - **Result (2026-10-25):** `scripts/lib/docCheck.mjs` exports `findMissingDocs(path, text)` and
    `countExports(text)`. `scripts/check-docs.mjs` walks `packages/*/src` (no `*.test.ts(x)`, no `.d.ts`), prints
    `file:line kind name`, ends with "N of M files have no header; N of M exports have no JSDoc", exits 1 on a
    miss and 2 on a bad `--package`. The first implementation found two bugs, each now covered by a test (17 in
    all):
    - the file header's `*/` counted as the JSDoc of an export right below it → the header block is excluded;
    - `export function* gen` wasn't matched (no `` after `*`) → it is now.

    The rule is stricter than plan §7's "a `*/` above": it needs a `/**` block that isn't the header. Plan
    updated, D-041. **Baseline:** 87 of 113 files have no header and 123 of 266 exports have no JSDoc. The plan
    expected about 86/111 and 121/264; the difference includes this branch's `shared/src/uuid.ts` (documented)
    and `request.ts` (no header). Per package (headers missing/files, JSDoc missing/exports): gateway 5/5 4/4,
    assistant 7/22 32/58, auth 5/5 13/13, cart 4/4 10/10, frontend 25/34 8/74, inventory 7/7 8/13,
    notification 3/3 3/6, order 8/8 5/15, payment 8/8 3/8, product 5/5 10/11, shared 10/12 27/54. Break check:
    no `*/` test → 3 tests fail; restored → 17 pass. Check 13/13; 274 unit tests (257 + 17). Not a gate yet (T082).
- [x] **T077** — Add file headers and export JSDoc to `packages/shared`, following the content rule in plan §7.
      Comments only (`git diff -w` shows no code change) · files: `packages/shared/src/**` · test:
      `check-docs --package shared` → 0
  - **Result (2026-10-25):** 10 headers and 27 export blocks in `packages/shared/src` (errors, events, identity,
    index, jwt, kafka, logger, request, middleware). Two old comments that sat one blank line above their export
    were moved onto it (`KafkaTopics`; the `OrderStatus` block now describes the enum, and
    `VALID_ORDER_TRANSITIONS` got its own). `check-docs --package shared` → "All documented (12 files, 54
    exports)". **Comments only:** a script outside the repo compared every source file with a snapshot taken
    before T077. Code lines (not blank, not `//`, not inside `/* */`) must be identical and in the same order,
    and line endings unchanged. It caught two slips here, both fixed: an edit dropped the space before `(` on 6
    lines, and a `sed -i` turned CRLF `events.ts` into LF (learnings).
- [x] **T078** [P] — The same for `api-gateway`, `notification-service` and `inventory-service` · files: their
      `src/**` · test: `check-docs` per package → 0
  - **Result (2026-10-25):** gateway 5 headers + 4 exports, notification 3 + 3, inventory 7 + 8. The two
    inventory `@throws` notes are tags on their own line. `check-docs` → 0 for each (5/4, 3/6, 7/13 files/exports).
    Comments-only check: no code change.
- [x] **T079** [P] — The same for `auth-service`, `cart-service`, `order-service` and `payment-service` · files:
      their `src/**` · test: `check-docs` per package → 0
  - **Result (2026-10-25):** auth 5 headers + 13 exports, cart 4 + 10, order 8 + 5, payment 8 + 3. Handlers say
    their route, body and status codes; services say their rules and `@throws`. A few claims were checked
    against the code (cart quantity 0 removes, malformed order ID → 404, order + outbox in one transaction).
    `check-docs` → 0 for each. Comments-only check: no code change.
- [x] **T080** [P] — The same for `product-service` and `assistant-service` · files: their `src/**` · test:
      `check-docs` per package → 0
  - **Result (2026-10-25):** product 5 headers + 10 exports, assistant 7 + 32 (event and client types, the two
    providers, the stores). `check-docs` → 0 for each (5/11, 22/58). Comments-only check: no code change.
- [x] **T081** [P] — The same for `frontend` (`.ts` and `.tsx`) · files: `packages/frontend/src/**` · test:
      `check-docs --package frontend` → 0
  - **Result (2026-10-25):** frontend 25 headers + 8 exports. In `paths.ts` and `context.ts` (assistant) the
    old one-line header now documents the export below it, and a new header goes on top. While doing this, the
    checker named `export const { setSessionResolved } = …` "default". It now names destructured exports by
    their pattern (`{ setSessionResolved }`), with a test; `export type { … }` lists are still skipped. Checker
    tests 18; unit tests 275.

    **All packages:** `node scripts/check-docs.mjs` → "All documented (113 files, 266 exports)", exit 0 (from
    87/113 and 123/266). Comments-only check over all 113 files: 106 changed, 0 with a code change. Check 13/13,
    build exit 0.
- [x] **T082** — Wire `check-docs` into `scripts/check.mjs` as a gate (14 checks). Seen failing: delete one file's
      header → `npm run check` fails and names the file and line; restore. Record 0/0 (AC-10) · files:
      `scripts/check.mjs` · test: `npm run check`
  - **Result (2026-10-25):** `scripts/check.mjs` runs `node scripts/check-docs.mjs` as the job "doc comments
    (check-docs)", in parallel with the others; its header comment says so. `npm run check` → "All 14 checks
    pass". Seen failing: with the header line of `cart-service/src/routes/cartRoutes.ts` removed, the check
    prints `FAIL doc comments (check-docs)` and `packages/cart-service/src/routes/cartRoutes.ts:1 header
    cartRoutes.ts`, and exits 1; restored (byte-identical to the backup) → 14/14. AC-10 end state: 0 of 113
    files without a header, 0 of 266 exports without JSDoc.

## Coding standards and records (plan §8)

- [ ] **T085** — Write `specs/coding-standards.md`:
      - the patterns, each with a `file:line` example: layered controller → service → data access; adapter and
        strategy (providers); observer (`TurnObserver`, if on `main` — otherwise the Kafka consumer handlers);
        factory functions; saga and outbox; injected dependencies;
      - the clean-code rules, each with an example and a counter-example;
      - the JSDoc content rule.

      Check that every `file:line` reference exists · files: `specs/coding-standards.md` · test: manual review
      (AC-12)
- [ ] **T086** — Reference the standards:
      - `specs/constitution.md` → version 1.1.0, with a "Coding standards" line under Quality Gates;
      - a Key Docs row in `CLAUDE.md`;
      - Stage 4 of `specs/workflow.md`;
      - the TypeScript convention in `specs/architecture.md`.

      Decision entry for the constitution amendment · files: those files, `memory/decisions.md` · test: manual
      review (AC-12)
- [ ] **T087** — Records:
      - `specs/tech-stack.md`: the new majors; `ts-node` out, `tsx` for all dev servers; lint "JSDoc check
        (005)"; the dashboard's TypeScript per T050;
      - `memory/learnings.md`: the upgrade gotchas;
      - roadmap backlog: ESLint and Prettier;
      - check that the decisions log has one entry per major and that D-029 is superseded.

      · files: `specs/tech-stack.md`, `memory/learnings.md`, `specs/roadmap.md`, `specs/roadmap.json` · test:
      manual review (AC-13)

## Verify

- [ ] **T090** — Update `specs/architecture.md`: the Express 5 notes (`bodyOf`), the uuid helper, the gateway
      without a breaker, and the doc-check gate.
- [ ] **T091** — Every Definition-of-Done gate green (`specs/constitution.md`): `npm run check` (14 checks),
      `npm run build`, 10/10 `/health`. Record the numbers and the test count (≥ 237, AC-3), and list every test
      changed because of an upgrade, with its reason.
- [ ] **T092** — Tick the ACs in `spec.md` and `feature.json` (Status `Implemented`). Update `roadmap.md`/`.json`,
      `memory/progress.md` and `memory/MEMORY.md`. Note that 012 resumes by rebasing onto the upgraded `main`.

## AC coverage

| AC | Tasks |
| --- | --- |
| AC-1 | T001, T010, T022–T027, T032, T040, T050, T062 |
| AC-2 | T001, T007, T010, T021, T032, T062 |
| AC-3 | T010, T020, T021, T026, T027, T030–T032, T040, T091 |
| AC-4 | T010, T027, T033, T060 |
| AC-5 | T001, T003, T026, T033, T061 |
| AC-6 | T033 |
| AC-7 | T005, T040, T041 |
| AC-8 | T070, T072 |
| AC-9 | T071 |
| AC-10 | T076–T082 |
| AC-11 | T075, T076, T082 |
| AC-12 | T085, T086 |
| AC-13 | T007, T010, T022–T026, T032, T040, T087 |
