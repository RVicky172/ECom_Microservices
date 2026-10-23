# Testing Strategy

## Test Layers

| Layer | Tool | Location | What it covers | Command |
| ----- | ---- | -------- | -------------- | ------- |
| Typecheck | `tsc --noEmit` | every `packages/*` | Types and compile errors in all packages | `npm run check` |
| Unit | Vitest (planned, feature 001) | `packages/*/src/**/*.test.ts` | Pure logic: services, validators, tool functions, reducers | `npm test` |
| Integration (manual today) | Docker Compose + curl / scripts | running stack | Gateway routing, auth, cross-service calls, SSE | `docker compose up -d --build`, then the checks the feature's tasks record |

Until 001 lands, the gate is the typecheck plus the manual checks each feature's tasks record as evidence.

## Rules

1. **Test-first for pure logic.** Write the failing test, then the code.
2. **Time and randomness are inputs.** Logic takes time/seeds as parameters so tests are deterministic.
3. **No flaky waits.** Wait on real signals (events, DOM attributes, readiness endpoints), not fixed sleeps. A
   flaky test is a bug: find the race, don't add retries.
4. **Prove important tests can fail** by briefly breaking the code they cover.

5. **No paid model calls in automated tests.** Assistant tests use a stubbed model server
   (`ANTHROPIC_BASE_URL` or `ASSISTANT_OPENAI_BASE_URL` pointing at a local stub); live-model checks are manual.
6. **Security behaviour is tested both ways:** a user can reach their own data, and gets 401/404 for someone else's.
7. **Unit tests don't need the Docker stack.** Anything that needs running services is an integration check.

## Commands

```bash
npm run check  # fast gate — typechecks all packages; must pass before any task is ticked
npm test       # unit tests (none yet — added by feature 001)
npm run build  # production build
```
