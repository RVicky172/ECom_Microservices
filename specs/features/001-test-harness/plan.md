# 001 — Test Harness · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

**§1 One Vitest run at the root.** `npm test` stops fanning out to workspace `test` scripts (none exist) and runs a
single `vitest run` from the repo root. A root `vitest.config.ts` builds one Vitest **project per directory in
`packages/`** (read with `readdirSync` at config load). Each project has `root: packages/<name>`,
`include: ['src/**/*.test.ts']`, `environment: 'node'` and the package name as its label, so the output reads
`✓ |shared| src/events.test.ts`. A new package or a new test file is picked up with no config edit (AC-4).
`npm test` covers only `packages/`; the spec dashboard keeps its own config and runs from `npm run check` (Q3).

**§2 Tests use the source, not builds.** The root config aliases `@ecommerce/shared` to
`packages/shared/src/index.ts`, so a service test that imports shared code runs without `npm run build` first.
Imports are explicit (`import { describe, it, expect, vi } from 'vitest'`), with no globals.

**§3 Tests are typechecked but not built.** Each package's `tsconfig.json` keeps `include: ["src/**/*"]`, so
`npm run check` (`tsc --noEmit -p packages/<name>`) typechecks test files along with the code. Each package whose
`build` is `tsc` gets a `tsconfig.build.json` that extends it and excludes `src/**/*.test.ts`. Its `build` script
becomes `tsc -p tsconfig.build.json`. The packages that get this are shared, auth, product, cart, order, inventory,
payment, notification and assistant. The gateway (run with `tsx`) and the frontend (`tsc` with `noEmit`, then
`vite build`, which only bundles imported files) emit no test output already. A root `.dockerignore` with
`**/*.test.ts` keeps test sources out of every image, because all images build from the repo root (AC-11).

**§4 The gate runs tests.** `scripts/check.mjs` adds an `unit tests` job (`npx vitest run`) that runs in parallel
with the typechecks. On failure it prints Vitest's output, which names the package, file and test (AC-2, AC-3).

**§5 First tests, all in `packages/shared` (Q2).**
- `src/events.test.ts` (AC-7): checks every pair in `VALID_ORDER_TRANSITIONS` and every `OrderStatus` key. To give
  the table a testable function, shared gains `canTransitionOrder(from, to)`. `orderService.updateOrderStatus`
  calls it in place of its inline lookup, with the same behaviour: unknown statuses still mean "not allowed".
- `src/jwt.test.ts` (AC-8): round trip, expired token, wrong secret and a modified token. Expiry uses
  `vi.useFakeTimers()` + `vi.setSystemTime()`: sign at T, move to T + 16 min, then expect `TokenExpiredError`. No
  waiting.
- `src/middleware/internalAuth.test.ts` (AC-9): calls `requireInternalToken` directly with a minimal `req`
  (`path`, `headers`) and a `vi.fn()` as `next`, with `vi.stubEnv('INTERNAL_SERVICE_TOKEN', …)`. No HTTP server
  and no socket (AC-5). It asserts that `next` gets no argument when the request passes, and an
  `UnauthorizedError` with `statusCode` 401 when it is rejected.

**§6 Frontend smoke test (Q1).** `packages/frontend/src/utils/storePresentation.test.ts` tests `formatCurrency`,
`getStatusClass` and `getGreeting`. `getGreeting` takes the date as a parameter already. This proves the
frontend's bundler-mode TypeScript works in the harness, in a Node environment with no DOM.

**§7a Images on Node 26 (D-009).** Every `packages/*/Dockerfile` moves from `node:20-alpine` to `node:26-alpine`
and the root `engines` becomes `>=26.0.0`. With the root `vitest` dev dependency, npm 10.8.2 (Node 20 images)
crashes in `npm install --workspace=…` ("reading 'edgesOut'"); Node 26 ships npm 11 and is the version the dev
machine runs. All 10 images are rebuilt and every service's `/health` is checked (Constitution DoD 5).

**§7 Docs (AC-12).** Update `testing-strategy.md`, `tech-stack.md`, `CLAUDE.md` and `README.md` to describe the
real `npm test`. Add the Node version that running tests needs (see Risks).

## Files

| File | Change | Purpose |
| ---- | ------ | ------- |
| `package.json` | modify | `test` → `vitest run`; add `vitest` dev dependency (§1) |
| `vitest.config.ts` | new | One project per `packages/*` directory; `@ecommerce/shared` alias (§1, §2) |
| `scripts/check.mjs` | modify | Add the `unit tests` job (§4) |
| `.dockerignore` | new | `**/*.test.ts` (§3) |
| `packages/*/Dockerfile` (10) | modify | `FROM node:26-alpine` (§7a, D-009) |
| `packages/{shared,auth-service,product-service,cart-service,order-service,inventory-service,payment-service,notification-service,assistant-service}/tsconfig.build.json` | new ×9 | Build config that excludes tests (§3) |
| the same 9 `package.json` files | modify | `build` → `tsc -p tsconfig.build.json` (§3) |
| `packages/shared/src/events.ts` | modify | Add `canTransitionOrder` (§5) |
| `packages/order-service/src/services/orderService.ts` | modify | Use `canTransitionOrder` (§5) |
| `packages/shared/src/events.test.ts` | new | AC-7 |
| `packages/shared/src/jwt.test.ts` | new | AC-8 |
| `packages/shared/src/middleware/internalAuth.test.ts` | new | AC-9 |
| `packages/frontend/src/utils/storePresentation.test.ts` | new | Frontend smoke test (§6) |
| `specs/testing-strategy.md`, `specs/tech-stack.md`, `CLAUDE.md`, `README.md` | modify | AC-12 |

## Data Structures & Interfaces

```ts
// packages/shared/src/events.ts
/** True when an order may move from `from` to `to`; unknown statuses are never allowed. */
export const canTransitionOrder = (from: string, to: string): boolean =>
  (VALID_ORDER_TRANSITIONS[from as OrderStatus] ?? []).includes(to as OrderStatus);

// vitest.config.ts (shape)
export default defineConfig({
  resolve: { alias: { '@ecommerce/shared': resolve(root, 'packages/shared/src/index.ts') } },
  test: {
    projects: packageDirs.map((name) => ({
      extends: true,
      test: { name, root: `packages/${name}`, include: ['src/**/*.test.ts'], environment: 'node' },
    })),
  },
});

// packages/<svc>/tsconfig.build.json
{ "extends": "./tsconfig.json", "exclude": ["src/**/*.test.ts"] }
```

## Techniques

- **Controlled time:** Vitest fake timers mock `Date`, which `jsonwebtoken` reads for `iat` and when it checks
  `exp`. Always restore timers in `afterEach`.
- **Env isolation:** use `vi.stubEnv` and `vi.unstubAllEnvs()` in `afterEach`. `JWT_SECRET` is read once at module
  load, so the wrong-secret test signs with `jwt.sign(payload, 'other-secret')` directly and does not change env.
- **No sockets:** no test imports `kafka.ts`, a Knex/Mongoose model or a Redis client. Middleware is called as a
  plain function, so no `supertest` is needed and no new dependency is added.
- **Prove failure (AC-10):** for each test file, break the covered code briefly (e.g. remove a transition, skip the
  `exp` check by verifying with `ignoreExpiration`, make the middleware always call `next()`). Record the failing
  output in `tasks.md`, then restore.

## Test Approach

| AC | Test / measurement | Type |
| -- | ------------------ | ---- |
| AC-1 | `npm ci && npm test` from the root; record the summary and exit code | manual measurement |
| AC-2 | Break one assertion in `events.test.ts`, run `npm test`, record the exit code and the line naming the file and test; restore | manual measurement |
| AC-3 | Same break, run `npm run check`; expect `FAIL unit tests` with `\|shared\| src/events.test.ts` in the output and exit 1; restore, expect pass | manual measurement |
| AC-4 | Add a throwaway `packages/cart-service/src/probe.test.ts`, run `npm test`, see it run; delete it | manual measurement |
| AC-5 | Stop Docker, disconnect the network, run `npm test`; record the result | manual measurement |
| AC-6 | Time `npm test` 3× after a warm install; record the worst | manual measurement |
| AC-7 | `packages/shared/src/events.test.ts` | unit |
| AC-8 | `packages/shared/src/jwt.test.ts` | unit |
| AC-9 | `packages/shared/src/middleware/internalAuth.test.ts` | unit |
| AC-10 | Break and restore per test file; failing output recorded in `tasks.md` | manual measurement |
| AC-11 | `npm run build`; search `packages/*/dist` for `*.test.*` (expect none); `docker compose build order-service frontend`, then `find / -name '*.test.ts' -not -path '*/node_modules/*'` in each image (expect none) | manual measurement |
| AC-12 | Search the four docs for "none yet" or "planned" near unit tests | manual review |

Constitution DoD 5: every image changes (§7a) and order-service code changes (§5), so `docker compose up -d
--build` must start all services and each `/health` must report healthy (the frontend: `GET /` on :3000, D-006).

## Risks & Mitigations

- **Vitest 5 needs Node `^22.12 || ^24 || >=26`, but the root `engines` says `>=20`.** The dev machine runs Node
  26, and the Docker images (`node:20-alpine`) never run tests. Decided (D-008): use Vitest 5. **Superseded by
  D-009:** keeping images on Node 20 failed (npm 10.8 crash, below); images, `engines` and CI move to Node 26.
- **ESM-only `vitest` imported from CommonJS-mode packages** (`module: Node16`, no `"type": "module"`). `tsc` might
  reject `import … from 'vitest'` with TS1479, and Vitest might not handle the CJS interop of `jsonwebtoken`.
  Mitigation: a **spike** as task T1 installs Vitest, adds one trivial test in shared and one in the frontend, and
  confirms that both `npm test` and `npm run check` pass. Fallback: `globals: true` plus a
  `/// <reference types="vitest/globals" />`.
- **TypeScript 7 (root) vs Vitest's transform:** Vitest transpiles with its own bundled transformer and never calls
  `tsc`, so no conflict is expected. The T1 spike confirms it.
- **The `build` script change breaks a Dockerfile:** every Dockerfile calls `npm run build --workspace=…`, so the
  new script applies there too. The `tsconfig.build.json` files are under `packages/<svc>/`, which the Dockerfiles
  already copy. Verify with `docker compose build` (AC-11).
- **Realised (T022, 2026-10-23): the root `vitest` dev dependency broke every `node:20-alpine` image build**
  (npm 10.8.2 crash). Resolved by §7a. Node 26 is "Current" until its LTS promotion (expected late October 2026).
- **A root `vitest` dev dependency ends up in images.** `npm install --workspace=…` in the Dockerfiles may install
  root dev dependencies too. That costs image size but does no harm, and the Node 20 engine mismatch is only a
  warning. Record what is observed in T-result notes; out of scope to optimise.

## Constitution Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Spec before code | ✅ | Spec approved 2026-10-23 (D-007) |
| II. Test-gated delivery | ✅ | This feature adds the unit tests to `npm run check`; AC-10 proves the tests can fail; time is controlled (fake timers, `getGreeting(date)`) |
| III. Small dependencies | ✅ | One new **dev** dependency, `vitest`, approved 2026-10-23 (D-008), recorded in `tech-stack.md`. No runtime dependencies |
| IV. Memory maintained | ✅ | D-007 logged; D-008 (Vitest and Node version) logged; learnings added as found |
| V. Database per service | ✅ | No data access changes; tests open no connections |

## Dependency change (approved 2026-10-23, D-008)

- `specs/tech-stack.md` → Tooling: "Unit tests | Vitest 5 (root dev dependency; one project per `packages/*`)";
  Runtime: Node.js 26 everywhere (D-009).
- `memory/decisions.md` → **D-008 — Vitest 5 at the root, one project per package:** chosen to match the
  dashboard's version and to give AC-4 zero-config discovery. The alternatives were per-package `test` scripts
  (each package needs its own setup, which fails AC-4) and Vitest 3 (supports Node 20, but means two Vitest majors
  in the repo).
