# 005 — Dependency Upgrades, Dependabot, JSDoc and Clean-Code Rules · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

The work follows the five upgrade steps agreed in Q7. Before them comes a short spike-and-cleanup step (§0), and
after them come Dependabot, the JSDoc check and the coding standards (§6–§8). Every step ends with `npm run check`
green and its own commit, so a break can be traced to one step. Every number below was measured on
`feat/005-dependency-upgrades-code-standards` on 2026-10-25: 237 unit tests, 111 non-test source files.

### §0 Spikes and dead dependencies (first)

Reading the code turned up facts the spec didn't account for:

- **Unused dependencies.** These are declared but never imported:
  - `express-rate-limit` and `opossum` in the gateway: it has its own in-memory limiter in
    `middleware/rateLimiter.ts`, and **no circuit breaker at all**;
  - `axios`, `mongoose` and `bcryptjs` in order;
  - `joi` in payment and in shared.

  Upgrading them is wasted work, so they are **removed** (Constitution III). This makes AC-6's circuit-breaker
  check impossible: there is no breaker to open. → Decision point **P1**.
- **`@types/http-proxy-middleware` 0.19** is a deprecated stub (http-proxy-middleware ships its own types). It is
  removed with the other stubs (AC-2).
- **TypeScript 7 has no stable JS API.** It is the native compiler; its package exports only `./unstable/*`.
  Three things depend on that API:
  - `ts-node` (every service's `dev` script) cannot run on it. → switch `dev` to `tsx`, which is already in the
    tech stack for the gateway (P2);
  - the JSDoc checker cannot parse code with it. → a line-based checker instead (§7);
  - Next.js type checking needs it, which is why the dashboard stays on TypeScript 5.9 (D-005). → spike **S3**.
- **`uuid` v5 is used**, not only v4: payment derives its outcome event IDs as
  `uuidv5(eventId, PAYMENT_OUTCOME_NAMESPACE)`, and duplicate detection depends on them. `crypto.randomUUID()`
  covers v4 only (Q4), so shared gets a small `uuidV5()` built on `node:crypto` SHA-1. Its output must be
  byte-identical to `uuid` 9; this is pinned by test vectors recorded **before** `uuid` is removed (§2).
- **react-router.** `react-router-dom` stops at 7.18.4. The latest major is `react-router` 8.5.0, which uses a
  single package. "Latest stable" therefore means `react-router` 8. → decision point **P3**; spike **S4**.
- **ESM-only latest versions:** `http-proxy-middleware` 4 (`"type": "module"`), `axios` and `zod`. On Node 26,
  `require(esm)` loads them from CommonJS, unless a module uses top-level await. Spike **S1** confirms each one.
  `bcryptjs` 3 has a `require` export, so it is not affected.

Spikes. Each is throwaway; its result goes in `tasks.md`.

| Spike | Question | Done when |
| --- | --- | --- |
| S1 | Do `http-proxy-middleware` 4, `ioredis` 6, `joi` 18 and `pino` 10 load and work from the CommonJS build (`tsc` → `node dist`) and under `tsx`? What breaking changes affect our call sites? | A scratch script per library runs; the API differences we use are listed |
| S2 | Does a `bcryptjs` 3 `compare` accept a hash written by 2.4.3 (`$2a$`), and does 2.4.3 accept a 3.x hash? | Both directions are checked in a script, and a 2.4.3 hash is saved as a test vector |
| S3 | Can `next build` on 16.4.3 type-check with TypeScript 7? | `next build` passes on TS 7 (→ no exception), or the error is recorded (→ exception E1) |
| S4 | React 19 + `react-router` 8 + Vite 8: does the storefront's router code (`createBrowserRouter`, `RouterProvider`, `useMatches`, `NavLink`, `Navigate`) compile unchanged? | A branch build compiles; the list of changes is recorded |

### §1 Step 1: tooling and types

- TypeScript `^7.0.2` in every package that lists `typescript`: 9 services and the frontend.
- `@types/node ^26.6.5` everywhere.
- Remove `ts-node`, `@types/ioredis`, `@types/uuid` and `@types/http-proxy-middleware`.
- Each service's `dev` script becomes `tsx watch src/index.ts`, as the gateway already does. `tsx` stays a root
  dev dependency.
- `scripts/check.mjs` keeps `npx tsc --noEmit -p …`: the TS 7 CLI has the same flags. Look for new TS 7 errors
  (stricter defaults) and fix each one in code, not by relaxing tsconfig.

### §2 Step 2: backend libraries

| Library | Change |
| --- | --- |
| `uuid` | Removed. v4 → `crypto.randomUUID()` (shared `kafka.ts`, `middleware/correlationId.ts`; order `orderService.ts`). v5 → new shared `uuidV5(name, namespace)` (`src/uuid.ts`), used by payment `sagaHandlers.ts`. |
| `joi` 17 → 18 | auth, cart, inventory, order, product (payment and shared lose it, §0). S1 lists API differences; validation errors must stay the same 400 bodies. |
| `pino` 9 → 10 | shared `logger.ts` only. |
| `ioredis` 5 → 6 | assistant `store/redis.ts`, cart `cartService.ts`, product `productService.ts`. |
| `mongoose` 8 → 9.11 | product; the root (seed script) moves to the same version. |
| `bcryptjs` 2 → 3 | auth and root seed; `@types/bcryptjs` is dropped if 3 ships its own types. Old hashes must still verify (S2, AC-5). |
| `pg` 8.23.1 | patch. |
| `@anthropic-ai/sdk` 1.3 | minor. The SDK-stub tests in `providers/anthropic.test.ts` must still pass. |
| other minors and patches | `axios`, `jsonwebtoken`, `cors`, `knex`, `kafkajs`, `openai`, `zod`, `tsx`, `vitest`: whatever `npm outdated` lists. |

`uuidV5` is test-first:

- Its vectors are recorded from `uuid` 9 before removal: the RFC 4122 example (`www.example.com` in the DNS
  namespace → `2ed6657d-e927-568b-95e1-2665a8aea6a2`) and 3 real `eventId`s under `PAYMENT_OUTCOME_NAMESPACE`.
- The test is seen failing when the variant or version bits are left out.

### §3 Step 3: Express 5

- `express ^5.3.0` and `@types/express ^5.0.6` in every package, including shared. D-029 is superseded.
- `http-proxy-middleware` 4 in the gateway.
- Behaviour that could change under Express 5, from an audit of our code:
  - **`req.body` is `undefined` when there is no body.** It was `{}`. Joi `validate(undefined)` then passes, and
    the controllers destructure `value` (auth, cart, inventory, order, product; product update passes `req.body`
    straight through). Each `POST`/`PUT` without a body must still return 400, not 500. → a shared
    `bodyOf(req)` helper (`req.body ?? {}`), plus a controller test per service sending no body.
  - **A rejected promise in an async handler now reaches `next(err)`**, where before it was an unhandled
    rejection. Errors the code already catches don't change. Uncaught ones now return the shared error body: a fix,
    not a regression, but noted in decisions.
  - **New path syntax** (path-to-regexp 8): our routes use no `*`, `?` or `(` patterns (grep). The gateway's
    `app.use('/api/v1/…')` prefixes are unchanged.
  - **`req.query` is a getter:** no code assigns to it (grep).
- The gateway's `on.proxyReq` and `on.error` handlers are checked against the http-proxy-middleware 4 API (S1).
  Assistant SSE must still stream through the proxy (AC-5).

### §4 Step 4: frontend

- `react`/`react-dom` 19 with their types, `react-router` 8 (P3), `vite` 8 and `@vitejs/plugin-react` 6.
- `main.tsx` already uses `createRoot`. Router imports move from `react-router-dom` to `react-router`.
- Changes found by S4 are applied. AC-7 is checked by hand on the 6 pages.

### §5 Step 5: spec dashboard

- `next`, `@types/node 26` and `typescript`: 7 if S3 passes, otherwise 5.9 stays as exception E1, listed in the
  spec under Q3 with its reason and agreed with the user.
- `npm --prefix tools/spec-dashboard run check` and `NODE_ENV=production npx next build` must both pass (see
  learnings).

### §6 Dependabot (AC-8, AC-9)

`.github/dependabot.yml`, version 2:

- `npm` on directory `/` (the workspaces) and on `/tools/spec-dashboard`.
- `docker` with `directories: ["/packages/*"]`: every service's Dockerfile.
- Every entry:
  - `schedule: { interval: weekly, day: monday, timezone: Asia/Kolkata }` (Q5, P4), at `"09:00"`;
  - `open-pull-requests-limit: 5`;
  - `labels: [dependencies]`;
  - `target-branch: main`;
  - `groups.minor-and-patch: { update-types: [minor, patch] }`, so each major gets its own PR.

The "Reviewing a Dependabot PR" checklist goes in `specs/workflow.md` (Q6), linked from `README.md`. It covers
`npm ci`, `npm run check`, `npm run build`, rebuilding the affected images, `/health`, and a decision entry for a
major. You switch on security updates in the GitHub repository settings.

### §7 JSDoc check (AC-10, AC-11)

- A pure checker, `scripts/lib/docCheck.mjs`, exports `findMissingDocs(path, text) → { line, kind, name }[]`.
  `scripts/check-docs.mjs` walks the files and prints `file:line` for each miss. `scripts/check.mjs` runs it as a
  new gate (14 checks).
- **Files:** `packages/*/src/**/*.{ts,tsx}`, excluding `*.test.ts(x)` and `*.d.ts`.
- **Header rule:** the first non-blank line of the file opens a `/**` block.
- **Export rule:** a line matching
  `^export (default )?(declare )?(async )?(abstract )?(function|class|const|let|var|interface|type|enum)` must have
  a `*/` on the line above that closes a `/**` block (not `//` or `/* */`), and that block is not the file header.
  Decorators and blank lines are not skipped, so the comment sits right on top. `export type { … }` lists are
  skipped like re-exports (D-041).
- **Not checked:** re-exports (`export { … } from`, `export * from`) and `export default <identifier>`, because the
  declaration they point at is checked.
- **Line-based, not the TypeScript API:** TS 7 has no stable API (§0), and Constitution III rules out a new
  parser dependency. The cost is a known blind spot: an export spread over several lines that starts with
  something other than `export` isn't seen. Our code style doesn't produce one.
- **Tests:** `scripts/lib/docCheck.test.mjs`, run by a new `scripts` project in `vitest.config.mts`. It covers a
  missing header, an undocumented export, a documented file, a re-export, a decorator, and a `//` comment that
  doesn't count. It is seen failing.
- **Baseline today,** with the prototype rule: 86 of 111 files have no header, and 121 of 264 exports have no
  JSDoc. The spec's 87/124 and 151/317 were counted on 012's branch. AC-10's end state is 0 and 0. The JSDoc is
  added package by package: shared, gateway, then each service, then the frontend.
- **Content rule** (in the standards): say what the item is for, and why when that isn't obvious. Add `@param` or
  `@returns` only when the name and type don't already say it. No TSDoc tooling.

### §8 Coding standards (AC-12) and records (AC-13)

- **`specs/coding-standards.md`:** the patterns from Q9, each with a `file:line` example from this repo, and the
  clean-code rules, each with one example and one counter-example. It applies to new and changed code.
- **References:** the constitution moves to version 1.1.0 and gains a "Coding standards" line under Quality
  Gates, recorded in decisions. `CLAUDE.md` gets a Key Docs row, and `workflow.md` refers to it in Stage 4.
  `architecture.md`'s "TypeScript: JSDoc on exported functions" convention points to the standards.
- **Records:**
  - `tech-stack.md`: the new majors; `ts-node` out, `tsx` for all dev servers; Lint/format becomes "JSDoc check
    (005); ESLint in the backlog".
  - `decisions.md`: one entry per major upgrade (Express 5, React 19, react-router 8, Vite 8, TS 7, joi 18, pino
    10, ioredis 6, bcryptjs 3, hpm 4), plus the dependency removals. D-029 is marked superseded.
  - `learnings.md`: as found.
  - Roadmap backlog: ESLint and Prettier; a gateway circuit breaker (P1).

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `packages/*/package.json`, `package.json`, `package-lock.json` | modify | Versions; removed dependencies (§0–§4); `dev` → `tsx` |
| `packages/shared/src/uuid.ts` (+ `.test.ts`), `index.ts` | new / modify | `uuidV5` with recorded vectors |
| `packages/shared/src/kafka.ts`, `middleware/correlationId.ts` | modify | `crypto.randomUUID()` |
| `packages/shared/src/http.ts` (or the existing helper module) | modify | `bodyOf(req)` for Express 5's `undefined` body |
| `packages/order-service/src/services/orderService.ts` | modify | `crypto.randomUUID()` |
| `packages/payment-service/src/events/sagaHandlers.ts` | modify | shared `uuidV5` |
| `packages/{auth,cart,inventory,order,product}-service/src/controllers/*.ts` (+ tests) | modify | `bodyOf(req)`; no-body → 400 tests |
| `packages/api-gateway/src/proxy.ts` | modify | http-proxy-middleware 4 API, if S1 finds changes |
| `packages/frontend/src/**` (router imports, S4 findings) | modify | React 19, react-router 8 |
| `tools/spec-dashboard/package.json`, lockfile | modify | Step 5 |
| `.github/dependabot.yml` | new | §6 |
| `scripts/lib/docCheck.mjs` (+ `.test.mjs`), `scripts/check-docs.mjs` | new | §7 |
| `scripts/check.mjs`, `vitest.config.mts` | modify | Doc gate; `scripts` test project |
| every non-test `packages/*/src` file | modify | Headers and export JSDoc (comments only) |
| `specs/coding-standards.md` | new | §8 |
| `specs/constitution.md`, `CLAUDE.md`, `specs/workflow.md`, `specs/architecture.md`, `specs/tech-stack.md`, `README.md` | modify | References, records, Dependabot checklist |
| `memory/decisions.md`, `memory/learnings.md`, roadmap | modify | AC-13 |

## Data Structures & Interfaces

```ts
// packages/shared/src/uuid.ts
/** RFC 4122 version-5 UUID: SHA-1 of namespace bytes + UTF-8 name; same output as uuid@9 `v5`. */
export function uuidV5(name: string, namespace: string): string;

// packages/shared/src/<http helper>
/** The parsed JSON body, or `{}` when the request had none (Express 5 leaves it `undefined`). */
export function bodyOf(req: Request): unknown;
```

```js
// scripts/lib/docCheck.mjs
/** @typedef {{ line: number, kind: 'header' | 'export', name: string }} MissingDoc */
/** @returns {MissingDoc[]} */
export function findMissingDocs(path, text);
```

## Techniques

- **One step per commit**, `chore(005): step N — …`. Each step: update versions, `npm install`, then
  `npm run check` → `npm run build` → rebuild the affected images and check `/health`. The full end-to-end checks
  (AC-5–AC-7) run after step 4 and again at the end.
- **Recorded before upgrading:** run `npm outdated` and `npm ls` (AC-1, AC-2), record the test count, and save a
  bcrypt hash and the uuid v5 vectors. A user is registered on the old stack for AC-5's "pre-upgrade user signs in".
- **Single major per library:** after each step, `npm ls @types/express express react typescript` shows one major
  each (AC-2).
- **Security:** run `npm audit --omit=dev` at the end and list any high or critical advisory (NFR).
- **No behaviour change:** response bodies are checked by the existing controller tests. The manual checks use
  the same curl calls as 010/011, so the before and after can be compared.

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1 | `npm outdated` (root, each workspace, dashboard), output in tasks.md; exceptions listed in the spec | manual measurement |
| AC-2 | `npm ls` for the stubs and duplicate majors | manual measurement |
| AC-3 | `npm run check`, `npm run build`; test count ≥ 237; changed tests listed. New: `shared/src/uuid.test.ts`, no-body controller tests | unit + manual measurement |
| AC-4 | `docker compose build --no-cache` and `up -d`, 10/10 `/health` | manual measurement |
| AC-5 | Scripted curl run through the gateway: old user signs in, register, products, cart, order to a final state, assistant turn (P5: ratings are checked by 012 T031) | manual measurement |
| AC-6 | 401 without JWT; 101st request → 429; service stopped → 502 within the timeout, then back to 200 (no breaker, P1) | manual measurement |
| AC-7 | `npm run build -w packages/frontend`; 6 pages in a browser, console clean | manual measurement |
| AC-8 | Lint `.github/dependabot.yml` against the schema; after the push, GitHub → Insights → Dependency graph → Dependabot shows no errors | manual measurement |
| AC-9 | Read the checklist in `workflow.md` and the README link | manual review |
| AC-10 | `node scripts/check-docs.mjs` reports 0 and 0 | manual measurement |
| AC-11 | `scripts/lib/docCheck.test.mjs`; the gate seen failing on a file with its header deleted | unit |
| AC-12 | Read `coding-standards.md`; references in the constitution (1.1.0), CLAUDE.md, workflow | manual review |
| AC-13 | Read tech-stack, decisions (one per major, D-029 superseded), learnings, roadmap | manual review |

## Risks & Mitigations

- **CommonJS loading ESM-only packages** (hpm 4, axios, zod) → S1. If one fails under `tsc` CommonJS output,
  that package is an exception under Q3 (it doesn't support CommonJS), listed in the spec for the user to agree.
- **TS 7 stricter checks produce many errors** → fix in a step-1 sub-commit per package. Over ~50 errors: stop and
  report before changing behaviour.
- **bcryptjs 3 hash format** → S2. If old hashes fail, stop: AC-5 needs them.
- **The uuid v5 rewrite changes IDs** → recorded vectors, so a mismatch fails the test. A changed ID would turn
  replayed payment events into duplicates.
- **Express 5 `undefined` body → 500s** → `bodyOf` and the no-body tests in every controller.
- **SSE through hpm 4** (assistant streaming, buffering) → AC-5's assistant turn through the gateway. Also watch
  the `proxyTimeout` handling (S1).
- **react-router 8 data-router changes** → S4 before step 4. Fall back to 7.18.4 as an exception only if the user
  agrees (P3).
- **Next.js and TS 7** → S3. Exception E1 if needed.
- **The JSDoc pass is large** (about 200 comments) → one commit per package, comments only, and
  `git diff --stat -w` reviewed for non-comment changes.
- **012 merges later** → its branch will conflict in lockfiles and in any files it adds without JSDoc. Its rebase
  runs `npm install` and the doc check (noted in D-030).

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | §0's findings (no circuit breaker, react-router 8) were written into the spec and its Changelog on 2026-10-25 (D-031) before any code. |
| II. Test-gated delivery | ✅ | Every step is green before the next. `uuidV5` and `docCheck` are test-first and seen failing. No-body controller tests. |
| III. Small dependencies | ✅ | No new runtime dependency. Six unused ones and four type stubs are removed, and `uuid` is replaced by the platform. `ts-node` goes and `tsx` (already in the stack) takes over. The doc check is in-house. |
| IV. Memory maintained | ✅ | One decision per major upgrade; spike results in tasks.md; gotchas in learnings. |
| V. Database per service | ✅ | No data-access change. The seed script stays on the root dependencies. |

## Points for the user to decide

**Resolved 2026-10-25 (RVicky172): all five as recommended (D-031).**

- **P1 — Circuit breaker:** the gateway has none (`opossum` is installed but unused). _Recommended:_ remove
  `opossum`, drop the breaker from AC-6 (it keeps the 502-within-timeout check), and add "gateway circuit breaker"
  to the backlog. _Alternative:_ add a breaker in 005, which is new behaviour and outside "no behaviour change".
- **P2 — `ts-node` → `tsx`** for every service's `dev` script, since `ts-node` can't run on TS 7. _Recommended:_ yes.
- **P3 — react-router 8** (single `react-router` package) instead of the spec's `react-router-dom` 7.
  _Recommended:_ 8, as "latest stable" (Q3).
- **P4 — Dependabot timezone:** the spec says Europe/Berlin, but your commits are in +05:30. _Recommended:_
  `Asia/Kolkata`, Monday 09:00.
- **P5 — AC-5's "a rating saves":** ratings are a 012 feature, which isn't on this branch. _Recommended:_ check only
  the assistant turn in 005; 012's T031 checks ratings on the upgraded stack.
