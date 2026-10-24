# Testing Strategy

## Test Layers

| Layer | Tool | Location | What it covers | Command |
| ----- | ---- | -------- | -------------- | ------- |
| Typecheck | `tsc --noEmit` | every `packages/*` (test files included) | Types and compile errors in all packages | `npm run check` |
| Unit | Vitest 5 (root `vitest.config.mts`, one project per package) | `packages/*/src/**/*.test.ts`, next to the code | Pure logic: services, validators, tool functions, reducers | `npm test` (also run by `npm run check`) |
| Integration (manual today) | Docker Compose + curl / scripts | running stack | Gateway routing, auth, cross-service calls, SSE | `docker compose up -d --build`, then the checks the feature's tasks record |

The gate (`npm run check`) runs the typecheck and the unit tests; integration checks stay manual and are recorded
as evidence in each feature's tasks.

### Writing a unit test

- Put `<name>.test.ts` next to the file it covers under `packages/<pkg>/src/`; it is picked up with no config change
  and labelled with the package name (`✓ |shared| src/jwt.test.ts`).
- Import explicitly: `import { describe, expect, it, vi } from 'vitest'` (no globals).
- Import shared code as `@ecommerce/shared` or relatively; tests read shared's **source** (Vitest alias), so no
  build is needed first.
- Tests run in Node (no DOM). Control time with `vi.useFakeTimers()` / `vi.setSystemTime()` or a date parameter;
  isolate env with `vi.stubEnv()` + `vi.unstubAllEnvs()`.
- Call Express middleware as a plain function with a minimal `req` and a `vi.fn()` `next`; never open sockets.
- Write expected cases out; don't generate them from the table under test (deleting an entry would delete its
  test).
- Test files are typechecked by `npm run check` but excluded from builds (`tsconfig.build.json`) and images
  (`.dockerignore`).
- Running tests needs Node ≥ 26 (root `engines`; D-009).
- **Service tests without a database:** `vi.mock('../models/<x>Model')` with a small fake of the knex calls the
  code makes (`db(table).where(m).first()`, a thenable `where`), and mock other-service clients the same way. Keep
  the fake's state in `vi.hoisted(...)`, and import normally (no top-level `await`: packages are CommonJS).
- **Controller tests:** call the handler with a minimal `req` (`headers`, `params`, `query`), a `res` fake
  (`status` returning itself, `json`) and a `vi.fn()` `next`; assert what reaches `next` and that the service was
  or was not called.
- **HTTP clients:** `vi.stubGlobal('fetch', vi.fn())` and assert URL, forwarded headers and status mapping.
- **Model providers (assistant):** stub the SDK, not a server. `vi.mock('@anthropic-ai/sdk')` replaces only the
  `Anthropic` class; its fake `beta.messages.toolRunner(params)` records `params` and returns a runner that is
  async-iterable over streams (each async-iterable with `finalMessage()`) and has `done()`. `betaZodTool` comes
  from another import path and stays real, so the captured `tools[].input_schema` is the real JSON Schema. Assert
  the request the provider builds (cached `system` block, tool names) and the streamed result
  (`src/agent/providers/anthropic.test.ts`, D-018).
- **Kafka producers:** mock `createKafkaClient` / `createProducer` / `publishEvent` from `@ecommerce/shared`
  (keep the rest with `importOriginal`), and load a fresh module per test (`vi.resetModules()` +
  `vi.importActual`) when it caches the producer. Test a publish cap with a fake that never resolves and fake
  timers, not a stopped broker (`src/clients/handoffPublisher.test.ts`).
- **Ownership:** test owner → record and non-owner → the same 404 as missing (rule 6), and that a non-owner never
  triggers the read of the record itself.

## Rules

1. **Test-first for pure logic.** Write the failing test, then the code.
2. **Time and randomness are inputs.** Logic takes time/seeds as parameters so tests are deterministic.
3. **No flaky waits.** Wait on real signals (events, DOM attributes, readiness endpoints), not fixed sleeps. A
   flaky test is a bug: find the race, don't add retries.
4. **Prove important tests can fail** by briefly breaking the code they cover.

5. **No paid model calls in automated tests.** Assistant tests stub the model SDK (see "Model providers" above);
   live-model checks are manual.
6. **Security behaviour is tested both ways:** a user can reach their own data, and gets 401/404 for someone else's.
7. **Unit tests don't need the Docker stack.** Anything that needs running services is an integration check.

## Commands

```bash
npm run check  # fast gate — typecheck + unit tests (+ spec dashboard); must pass before any task is ticked
npm test       # unit tests in packages/ (Vitest)
npx vitest run --project shared   # one package
npx vitest                        # watch mode
npm run build  # production build
```
