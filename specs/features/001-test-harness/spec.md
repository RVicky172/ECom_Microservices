# 001 — Test Harness

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 0 · **Created:** 2026-10-23 · **Owner:** RVicky172

## Summary

Today the only automated gate on the services is a typecheck: `npm test` runs nothing (no package defines tests)
and `npm run check` cannot catch a logic bug. This feature gives every package in `packages/` a way to run fast,
offline unit tests with Vitest (the tool already chosen in `tech-stack.md` and used by the spec dashboard), wires
them into `npm test` and `npm run check` so a failing test blocks a task from being ticked, and adds a first set of
tests on shared logic that later features (002 ownership checks, 010 saga payloads) build on. It is the
precondition for the test-first rule in the constitution (Principle II) and for CI (003).

## User Stories

- **US-1:** As a developer, I want one command (`npm test`) that runs every unit test in the repo so that I know in
  seconds whether I broke something.
- **US-2:** As a developer (or agent) ticking a task, I want `npm run check` to fail when a unit test fails so that
  the gate in the workflow actually covers behaviour, not only types.
- **US-3:** As a developer starting feature 002 or 010, I want to add a `*.test.ts` file next to the code and have it
  picked up with no setup so that writing the test first is the easy path.
- **US-4:** As a maintainer, I want tests that need no Docker stack, network or paid model so that they run the same
  on any machine and, later, in CI.

## Acceptance Criteria

- [x] **AC-1:** Given a clean `npm ci`, when `npm test` is run from the repo root, then it runs the unit tests of
  every package under `packages/` that has any, prints a per-file pass/fail summary, and exits `0` when all pass.
  _(manual measurement)_
- [x] **AC-2:** Given one deliberately failing assertion in any one package, when `npm test` is run, then it exits
  non-zero and the output names the failing test file and test name. _(manual measurement: break, run, restore)_
- [x] **AC-3:** Given the same deliberately failing assertion, when `npm run check` is run, then it reports that
  package's tests as `FAIL` and exits non-zero; with the assertion restored it passes. _(manual measurement)_
- [x] **AC-4:** Given a new file `packages/<name>/src/**/<x>.test.ts` in a package that had no tests before, when
  `npm test` is run, then the new test runs without editing any config file or `package.json`. _(manual
  measurement on one backend package)_
- [x] **AC-5:** Given Docker stopped and no network access, when `npm test` is run, then every test passes; no test
  opens a socket to PostgreSQL, MongoDB, Redis, Kafka or a model API. _(manual measurement)_
- [x] **AC-6:** The whole unit suite (`npm test`) completes in ≤ 30 seconds wall-clock on the dev machine after a
  warm install. _(manual measurement, recorded in tasks.md)_
- [x] **AC-7:** Order status transitions in `packages/shared` are covered: every transition listed in
  `VALID_ORDER_TRANSITIONS` is accepted, at least 3 transitions not listed (including leaving a terminal state) are
  rejected, and every `OrderStatus` value has an entry. _(unit)_
- [x] **AC-8:** JWT helpers in `packages/shared` are covered: a signed token verifies back to the same `id`, `email` and
  `role`; an expired token, a token signed with another secret and a modified token are each rejected. Expiry is
  tested with injected or controlled time, not by waiting. _(unit)_
- [x] **AC-9:** The internal-service-token middleware in `packages/shared` is covered: with a token configured, a
  request with the right `x-internal-token` passes, one with a missing or wrong token is rejected with a 401
  (`UnauthorizedError`), and `/health` passes without a token; with no token configured, today's opt-in behaviour
  (requests pass) is pinned by a test. _(unit)_
- [x] **AC-10:** Each test from AC-7 to AC-9 has been seen to fail at least once by briefly breaking the code it
  covers; the break and the failing output are recorded in tasks.md. _(manual measurement)_
- [x] **AC-11:** `npm run build` still succeeds, and no `*.test.ts` file (or its compiled output) ends up in any
  package's build output or Docker image. _(manual measurement)_
- [x] **AC-12:** `specs/testing-strategy.md`, `specs/tech-stack.md`, `CLAUDE.md` and `README.md` describe the real
  `npm test` (no "none yet" / "planned" wording remains for unit tests). _(manual review)_

## Non-Functional Requirements

- Performance: unit suite ≤ 30 s (AC-6); `npm run check` stays the single fast gate.
- Determinism: no fixed sleeps; time and randomness are inputs (testing-strategy rules 2–3). Running `npm test` 3
  times in a row gives the same result.
- Dependencies: Vitest is the only new dev dependency expected; anything else needs a `tech-stack.md` justification
  (Principle III). No new runtime dependencies.
- Compatibility: Node ≥ 26 on Windows (the dev machine) and Linux (CI in 003, Docker images on `node:26-alpine`).

## Out of Scope

- Integration or end-to-end tests against the Docker stack (they stay manual; a later feature may automate them).
- React component / DOM tests for the frontend (see Q1).
- Coverage thresholds or coverage reports as a gate (see Q4).
- CI wiring — feature 003.
- Fixing any bug the new tests reveal: it is recorded in `000-baseline/baseline.md` or the backlog, and the test is
  written against intended behaviour only if the fix is in this feature's scope.
- Tests for order/payment ownership (002) and saga payloads (010) — those features write their own.

## Open Questions

- **Q1** **Resolved 2026-10-23 (accepted as proposed).** Does the harness cover the frontend? _Proposed:_ yes, but only for pure TypeScript
  modules (e.g. `src/utils/`) run in a Node environment; no DOM, React Testing Library or jsdom in this feature.
- **Q2** **Resolved 2026-10-23 (accepted as proposed).** Are AC-7…AC-9 (order transitions, JWT, internal token middleware, all in
  `packages/shared`) the right first tests? _Proposed:_ yes — they are pure, security- or saga-relevant and reused
  by 002 and 010. Assistant tool tests wait for 012's eval work.
- **Q3** **Resolved 2026-10-23 (accepted as proposed).** Should `npm test` also run the spec dashboard's tests (`tools/spec-dashboard`), as
  `npm run check` already does? _Proposed:_ no — `npm test` covers `packages/` only; `npm run check` keeps running
  both, so nothing is skipped at the gate.
- **Q4** **Resolved 2026-10-23 (accepted as proposed).** Coverage: gate, report, or neither? _Proposed:_ neither in this feature; revisit once
  002 and 010 have added their tests.
- **Q5** **Resolved 2026-10-23 (accepted as proposed).** Is 30 s the right budget for the unit suite (AC-6)? _Proposed:_ yes; the first suite
  should take well under 10 s, leaving room to grow before CI (003).

## Changelog

- 2026-10-23 — Created.
- 2026-10-23 — Q1–Q5 accepted as proposed by RVicky172; status → Approved (D-007).
- 2026-10-23 — Plan approved (D-008), tasks written; status → In Progress.
- 2026-10-23 — Compatibility moved from Node ≥ 20 to Node ≥ 26: the root `vitest` dev dependency crashes npm 10.8 in
  the `node:20-alpine` image builds; all images move to `node:26-alpine` (D-009).
- 2026-10-23 — Verified: AC-1–AC-12 proven (evidence in `tasks.md`); status → Implemented.
