# Progress Log

Newest first. One entry per working session.

```
## YYYY-MM-DD — <feature id or "chore">
**Done:** …
**Next:** …
**Blockers:** …
```

---

## 2026-10-24 — 012: spikes T001, T002; shared analytics events T010, T020; provider usage T011, T021; observer T012, T022; handoff event T013, T023; publishers T014, T024; controller T015, T025; eval core T016, T026; usage report T017, T028; feedback UI T018, T029; chore D-029

**Done:** T001: LM Studio sends usage only with `include_usage`, as a last chunk with `choices: []`, no cached
count; `TokenUsage` mapping for both providers (D-025). T002: every fixture call works directly from the host
(paths `/api/v1/<service>`, eval emails `@example.com` since Joi rejects `.test`, product delete is soft); plan
§3.3 updated. T010/T020: `assistant.interaction` and `assistant.feedback` topics, payloads and parsers in shared,
41 tests, 8 break checks. T011/T021: both providers return `model` and per-turn summed `usage` (LM Studio via
`include_usage`), 7 tests, 6 break checks. T012/T022: `TurnObserver` (tools, outcome; repeat handoff = `handoff`, D-026) and
`buildInteractionEvent` (exact keys, parser contract), 21 tests, 8 break checks. T013/T023: handoff tool emits a `handoff` SSE event after the publish (`done`
fields moved to T025). T014/T024: one capped producer (`eventPublisher.ts`), fire-and-forget analytics
publisher (never rejects, one warn, no retry), 13 tests, 8 break checks. T015/T025: answer IDs, `done.usage`, interaction publish, transcript ratings, feedback
route, 23 tests, 12 break checks; live smoke ok; the first event per new Kafka topic was dropped, fixed by creating the analytics topics at
startup (D-027). T016/T026: SSE parser, rule grader (term matching D-028), report; 54 tests, 22 break
checks; the cases test moves to T027. T017/T028: usage aggregation (15 tests, 10 break checks) and the
`npm run assistant:usage` CLI (live, ends by itself). T018/T029: feedback buttons and reducer (10 tests, 6 break checks). Chore D-029:
shared emits `.d.ts`; shared and gateway on `@types/express` 4 (21 type errors fixed). Drafted 005 (upgrades,
Dependabot, JSDoc, coding standards). Gate: check 13/13, 426 tests.
**Next:** 005 open questions (user), then 005; 012 continues with T027 (cases, user review), T030–T035.
**Blockers:** none

## 2026-10-24 — 011: assistant policies + handoff, implement and sign-off (T034, T035, T090–T092; 22 of 22 tasks)

**Done:**
- LM Studio was off and then loaded with defaults (52k context, 4 slots): turns ~115 s, a second JIT copy. Reloaded
  with `-c 16384 --parallel 1` → 0.5–6 s; written up in `docs/lm-studio-setup.md`.
- T034 live handoff: notified 45 ms after the request; repeat and replay → still 1 notification; no transcript.
  Kafka stopped: honest reply, but the event landed ~50 s after Kafka returned (idempotent KafkaJS producer retries
  forever). Fixed with one bounded attempt (D-021, option A chosen by RVicky172): shared Kafka helpers take
  optional limits; 3 new tests, 2 break checks. Re-run: failure turns 4.0 s / 4.6 s (stopped / paused), 0 late
  deliveries in 90 s, a retry after recovery succeeded. 235 tests.
- T090 docs (design doc Phase 3 shipped, assistant/notification/shared READMEs, architecture event row, README
  handoff flow, testing patterns). T091: check 13/13, build ok, all images rebuilt, every `/health` 200.

- T035 (added on RVicky172's call): hand off on the first ask. 6 prompt attempts; faults found on the way: a
  "connecting you" claim with no tool call, a sample reference copied into a reply, invented branded products.
  Attempt 6 (D-022): first-ask handoffs 4/4, products 7/7 looked up, P1–P10 10/10, U1–U3 3/3, 0 unasked handoffs.
  237 tests.
- T092: 13/13 ACs, spec Implemented, roadmap 011 ✔️.

**Next:** commit 011 (on request); then `/spec-new` 012 (assistant evals), keeping T035's cases.
**Blockers:** none.

## 2026-10-23 — 011: assistant policies + handoff, implement (T001–T033 done, 16 of 21 tasks)

**Done:**
- T001 spike: Claude is tested with a stubbed `@anthropic-ai/sdk` (D-018); the assistant service's first tests.
- Policy document `packages/assistant-service/policies/store-policies.md` (D-016 terms) in the cached system prompt;
  a missing or empty file stops startup (checked live).
- Shared `assistant.handoff_requested` event + parser; assistant `request_human_handoff` tool (Redis reference per
  conversation, lazy Kafka producer, 5 s cap, D-019 edge cases); notification logs a support email once per event;
  widget label "Contacting support…". Every new test seen failing; break checks recorded. 228 tests.
- T032 live on Qwen3 30B: attempt 1 invented "we don't offer X" for all uncovered questions; prompt tuning fixed that
  but broke P7; attempt 4 with an explicit document (D-020, new term: refund period starts when the return is
  received) → 10/10 covered, 3/3 uncovered, 0 handoffs in 60 runs. T033: 30 → 45 days changes the answer (Docker
  needs a rebuild, not a restart).

**Next:** T034 live handoff runs (request, repeat, replay, Kafka stopped; user A's hourly budget was nearly used,
use the admin user or wait), then T090 docs, T091 gates, T092 close-out.
**Blockers:** none

## 2026-10-23 — 010: saga payloads verified ✔️

**Done:** T034 with RVicky172 in the storefront:
- orders `CONFIRMED` 0.41 s / 1.99 s after placing, shown on the Orders page after a reload;
- a declined order shows "0 items · Payment declined" after a hard reload (the first look was a stale tab).

All 13 ACs proven; spec Implemented, roadmap ✔️. Gates: check 13/13, build 0, 173/173 tests ×3, 10/10 healthy,
all saga consumers running, payment rate back at 0.85. Phase 1: 1 of 3 done. The exit criterion's checkout half
is met (an order placed in the UI reaches `CONFIRMED`, or `CANCELLED` with a reason, without manual steps).
**Next:** `/spec-new 011` (assistant: store policies in the prompt + human handoff via Kafka). Backlog grew: shared
`.d.ts`, Kafka volume, gateway limiter before `/health`, order list without items.
**Blockers:** none

## 2026-10-23 — 010: saga payloads, verify run (11 of 13 ACs; storefront check pending)

**Done:**
- Spike (T001) found the real cause of stuck `PENDING` orders: saga consumers that failed to start were never
  retried while `/health` stayed 200. Fixed with shared `startSagaConsumer` (retry with backoff, crash restart,
  ensure topics, `fromBeginning`) (D-015).
- G3/G4 closed: shared payload types and parsers; inventory forwards `userId, items, totalAmount`; payment
  charges the total and carries the items with a stable v5 outcome ID; order uses pure `nextTransitions`
  (arrival order, duplicates) and `cancel_reason`; the storefront shows the reason.
- Pre-existing payment idempotency bug fixed: the duplicate-key path aborted the PostgreSQL transaction.
- 173 tests. Live: success 10/10 `CONFIRMED` (max 2.21 s); decline 10/10 `CANCELLED` (max 2.21 s); out of stock
  `CANCELLED` (1.24 s). Stock and payments exact; 1 notification per order; replay of 3 real messages changed
  nothing; a Kafka reset no longer strands orders.
- Dev data reset by hand (10 stuck orders, 24 units).
- Gates: check 13/13, build 0, all healthy (gateway 429 on `/health` until restart: rate limiter, backlog).

**Next:** T034: the storefront check with RVicky172 (rate 1 → `CONFIRMED` ≤ 10 s, rate 0 → "Payment declined"),
then `/spec-verify 010` again to tick AC-6/AC-12 and close.
**Blockers:** none (needs someone at the browser, or permission to drive one)

## 2026-10-23 — chore: CI moved to the backlog

**Done:** 003 (CI) removed from Phase 0 and added to the roadmap backlog at RVicky172's request (D-012). Phase 0's
goal and exit criteria no longer mention CI; Phase 0 is complete (000, 001, 002, 004).
**Next:** Phase 1 — `/spec-new 010` (saga payloads).
**Blockers:** none

## 2026-10-23 — 002: ownership checks verified ✔️

**Done:** spec (Q1–Q6 as proposed, D-010), plan (D-011), 17 tasks, verify. `GET /orders/:id` and
`GET /payments/:orderId` now answer non-owners with the same 404 as a missing record; malformed IDs 404 (was 500);
missing `x-user-id` → 401 (also on `GET /orders`). Shared `requireUserId`/`isUuid`; order `getOrderForUser`;
payment asks order (`orderClient.isOrderOwnedBy`, forwards identity + internal token; outage → 502). 38 new unit
tests (77 total), every check seen failing when removed. Live, two real users: B → A's order 200 before, 404 after;
headers identical to an unknown order; payment proven with a fixture row (deleted). Assistant on LM Studio Qwen3:
A gets status, B "not found". G1/G2 closed. Gates: check 13/13, build 0, 10/10 healthy. Phase 0: 4 of 5 done; the
"cannot read another user's order or payment" exit criterion is met.
**Next:** `/spec-new 003` (CI). Note for 003: services' typecheck needs shared built first (no `.d.ts`, backlog).
**Blockers:** none

## 2026-10-23 — 001: test harness verified ✔️

**Done:** spec (Q1–Q5 as proposed, D-007), plan (D-008), 15 tasks, verify. Vitest 5 at the root, one project per
`packages/*` (`vitest.config.mts`); `npm test` = `vitest run`; `npm run check` runs it (13 checks). 39 tests in 4
files (shared: order transitions via new `canTransitionOrder`, JWT with fake timers, internal-token middleware;
frontend: `storePresentation`), every shared test seen failing by breaking its code. Suite 0.87 s worst of 3. Tests
excluded from builds (`tsconfig.build.json` ×9) and images (`.dockerignore`). The root dev dependency broke
`node:20-alpine` builds (npm 10.8 crash) → all images on `node:26-alpine`, `engines >=26` (D-009); 10/10 healthy.
Gates: check 13/13, build 0. Phase 0: 3 of 5 done.
**Next:** `/spec-new 002` (ownership checks on orders/payments). Backlog: shared `.d.ts` (found here; matters for 003).
**Blockers:** none

## 2026-10-23 — 000: baseline verified ✔️

**Done:** gates: `npm run check` 12/12, `npm run build` exit 0, `git diff --stat packages/` empty. AC-1–AC-7
proven by the counts and measurements in `tasks.md` (11 packages, 24 routes, 6 topics, 7 tools, 12 gaps with
owners, 10/10 health 200). Spec Implemented, roadmap ✔️. Phase 0: 2 of 5 done.
**Next:** `/spec-new` for 001 test harness. Consider adding G4 to 010's scope when it is specced.
**Blockers:** none

## 2026-10-23 — 000: baseline written (T001–T091 done; verify pending)

**Done:** spec approved (Q1–Q4 as proposed), plan (D1 → D-006), tasks, then `baseline.md` (188 lines): 11
packages, 24 routes, 6 pages, 6 topics, 7 assistant tools, 12 gaps. Found 6 new gaps (G4, G8–G11 + payment
`amount` NOT NULL failure that stalls checkout at `INVENTORY_RESERVED`); 4 new backlog items. Stack rebuilt from
clean: 10/10 HTTP 200. Gates: check 12/12, build 0, `packages/` untouched.
G11 narrowed: `.env` sets the internal token (direct calls → 401); only the empty `.env.example` default is a gap.
**Next:** `/spec-verify 000`; then 001.
**Blockers:** none

## 2026-10-23 — 004: spec dashboard verified ✔️

**Done:** T040 manual checks: AC-1 (127.0.0.1:3100 only, store down), AC-7 (malformed/invalid/missing
tracking files show named errors), AC-8 (no writes), 404/400 for bad folders; AC-6 confirmed in a browser by
RVicky172. Gates: `npm run check` 12/12 (39 dashboard tests), `npm run build` exit 0, dashboard `next build` ok
with `NODE_ENV=production` (shell's `NODE_ENV=development` breaks it — learnings). Spec Implemented, roadmap ✔️.
**Next:** `/spec-new 000-baseline`, then 001 test harness.
**Blockers:** none

## 2026-10-23 — 004: spec dashboard built (verification pending AC-6 in a browser)

**Done:** `tools/spec-dashboard` (Next.js 16, `npm run dashboard` → http://127.0.0.1:3100): overview, feature
and memory pages, live updates over SSE (~310 ms). Mid-build change (D-005): tracking state moved to
`specs/roadmap.json` + per-feature `feature.json`, kept in sync with the Markdown by a consistency test in the
root `npm run check`. 39 dashboard tests; gate 12/12. ACs 1–5, 7–9 proven.
**Next:** confirm AC-6 in a browser (open the dashboard, save a spec file, see it update), then `/spec-verify 004`;
then `/spec-new 000-baseline`.
**Blockers:** none

## 2026-10-23 — chore: spec-driven development set up

**Done:** `specs/` (constitution, workflow, roadmap, tech stack, architecture, testing strategy, templates),
`memory/`, `/spec-*` commands, CLAUDE.md section (D-001).
**Next:** see `MEMORY.md` → Next step.
**Blockers:** none
