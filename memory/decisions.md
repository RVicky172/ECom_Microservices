# Decision Log

Append-only. Newest at the bottom. To reverse a decision, add a new entry that says `Supersedes D-00X`.

Format:

```
## D-00X — Title (YYYY-MM-DD)
**Context:** … **Decision:** … **Alternatives:** … **Consequences:** …
```

---

## D-001 — Adopt spec-driven development (2026-10-23)

**Context:** Work is done across many sessions, by people and AI agents that don't remember earlier sessions.
**Decision:** Every feature goes Specify → Plan → Tasks → Implement → Verify (`specs/workflow.md`), gated by the
Definition of Done in `specs/constitution.md`; durable project memory lives in the committed `memory/` folder.
**Alternatives:** ad-hoc issues/PR descriptions only; an external tracker.
**Consequences:** Specs and memory are part of every feature's diff; `/spec-*` commands drive the stages.

## D-002 — Internal service token, opt-in (2026-10-23)

**Context:** Services trust `x-user-id` and their ports are published, so anyone reaching a port could impersonate a user.
**Decision:** `requireInternalToken` (shared) rejects requests without `x-internal-token` when `INTERNAL_SERVICE_TOKEN`
is set; the gateway and assistant send it. The gateway also strips client-sent `x-user-*` headers.
**Alternatives:** remove host port mappings; mTLS between services.
**Consequences:** Unset = old behaviour for simple local dev. Changing the token requires rebuilding every service.

## D-003 — Assistant model providers (2026-10-23)

**Context:** No Anthropic API credits for now; a local LM Studio model should work for development.
**Decision:** `ASSISTANT_PROVIDER` = `anthropic` (Claude via the SDK tool runner) | `openai-compatible` (LM Studio,
Ollama, vLLM via Chat Completions). Tools are written once against a neutral contract (`agent/toolTypes.ts`);
stored conversations are tagged with their provider.
**Alternatives:** Claude only; LM Studio only.
**Consequences:** Two code paths to keep in sync; switching provider starts conversations fresh.

## D-004 — Fast gate is a repo-wide typecheck (2026-10-23)

**Context:** No tests or linter exist; `tsc` per package was the only check.
**Decision:** `npm run check` runs `scripts/check.mjs`, which typechecks all packages in parallel. Later gates
(Vitest in 001, lint) are added to that script so it stays the single command.
**Alternatives:** per-package `typecheck` scripts run via `--workspaces`.
**Consequences:** One place to extend the gate; `npm run build` builds every package that has a build script.

## D-005 — Tracking state in JSON next to the specs (2026-10-23)

**Context:** The spec dashboard (004) first parsed status, checkboxes and tables out of Markdown; RVicky172 asked
for machine-readable tracking files instead.
**Decision:** `specs/roadmap.json` (phases, features, statuses, backlog) and `specs/features/NNN-name/feature.json`
(status, stage, acceptance criteria, tasks, open questions) hold the tracking state; Markdown keeps the prose and
its own checkboxes. A consistency test, run by the root `npm run check`, fails when they disagree. The dashboard
(`tools/spec-dashboard`, Next.js) reads only the JSON for tracking and renders the Markdown documents.
**Alternatives:** dashboard parses Markdown (first version); JSON only, dropping Markdown checkboxes.
**Consequences:** `/spec-*` commands update both JSON and Markdown in the same step; drift is caught by the gate.
The dashboard adds next, react, react-markdown, remark-gfm, zod and vitest to its own isolated package.

## D-006 — Baseline checks the frontend by page load, not `/health` (2026-10-23)

**Context:** 000's AC-6 asked for `/health` on every package in AC-1, but the frontend (static SPA) has none.
**Decision:** for the frontend, AC-6 accepts `GET /` on :3000 returning 200; backend services keep `/health`.
**Alternatives:** leave the frontend out of AC-6; add a `/health` route to the frontend (a code change, out of
scope for 000).
**Consequences:** 000 spec AC-6 reworded (Changelog); no code changes.

## D-007 — 001 test harness scope (2026-10-23)

**Context:** 001's draft spec had five open questions (Q1–Q5).
**Decision:** all accepted as proposed: frontend covered only for pure TS modules in a Node environment (no DOM
tests); first tests are order transitions, JWT helpers and the internal-token middleware in `packages/shared`;
`npm test` covers `packages/` only while `npm run check` also runs the spec dashboard; no coverage gate or report;
unit-suite budget 30 s.
**Alternatives:** DOM/component tests now; a coverage threshold; `npm test` including `tools/`.
**Consequences:** 001 spec Approved; 002 and 010 add their own tests on top of the harness.

## D-008 — Vitest 5 at the root, one project per package (2026-10-23)

**Context:** 001 needs a unit-test runner that picks up new test files in any package with no setup (AC-4).
**Decision:** add `vitest` 5 as a root dev dependency; a root `vitest.config.ts` defines one project per
`packages/*` directory. Same major as the spec dashboard. Vitest 5 needs Node ≥ 22.12 to run tests: documented,
the root `engines` stays `>=20` and Docker images stay on Node 20 (they never run tests); CI (003) uses Node ≥ 22.
Shared gains `canTransitionOrder()`, used by order-service, so the transition table has a testable function.
**Alternatives:** per-package `test` scripts (fails AC-4); Vitest 3 (supports Node 20, but two majors in the
repo); raising the root `engines` to `>=22.12`; testing the transition table without a helper.
**Consequences:** contributors on Node 20 can build and run services but not tests; order-service is rebuilt and
health-checked when 001 is verified.

## D-009 — Node 26 everywhere (2026-10-23)

**Context:** 001 T022: with `vitest` 5 in the root `devDependencies`, every `node:20-alpine` image build fails —
npm 10.8.2 crashes in `npm install --workspace=…` ("Cannot read properties of null (reading 'edgesOut')").
`node:22-alpine` and `node:26-alpine` build fine. Node 20 reached end of life in April 2026. RVicky172 chose the
newest line to stay current.
**Decision:** all 10 Dockerfiles use `node:26-alpine` (Node 26.12, npm 11.20 at the time); root `engines` is
`>=26.0.0`; CI (003) uses Node 26. Supersedes D-008's "images stay on Node 20" and "CI uses Node ≥ 22".
**Alternatives:** `node:22-alpine` (LTS "Jod", tested working); `node:24-alpine` (LTS "Krypton"); upgrading npm
inside Node 20 images; Vitest 3 (supports Node 20).
**Consequences:** Node 26 is "Current" until its LTS promotion (expected late October 2026); all services are
rebuilt and health-checked in 001. Contributors need Node 26.

## D-010 — 002 ownership checks scope (2026-10-23)

**Context:** 002's draft spec had six open questions (Q1–Q6).
**Decision:** all accepted as proposed: a non-owner gets 404, identical to a missing record; no role bypasses the
check; malformed IDs return 404 instead of 500; the payment service asks the order service whether the order
belongs to the caller (payments store no owner; no schema change, independent of 010), and AC-3 is proven with a
temporary test payment row because checkout stalls before payments (G3); the assistant keeps its own check (comment
fixed); `GET /orders` also rejects a missing `x-user-id` with 401.
**Alternatives:** 403 for non-owners; an admin read path; storing `user_id` on payments from a saga event.
**Consequences:** payment lookups make one internal call to the order service; 002 does not touch the saga.

## D-011 — 002 plan choices (2026-10-23)

**Context:** 002's plan left four points for RVicky172; approved as written.
**Decision:** (1) the order service checks `order.user_id === userId` in code after loading by ID, not in SQL, so
the rule is one unit-testable line; (2) when the order service is down, payment lookups return a 5xx ("Internal
server error"), never a 404; (3) all 10 service images are rebuilt at the end because each builds `shared`
itself; (4) if no model is available, AC-7's assistant check calls the assistant's order lookup directly, and the
result says so. New shared helpers `requireUserId` and `isUuid` (`packages/shared/src/identity.ts`).
**Alternatives:** `where({ id, user_id })` in SQL; serving payment data without the ownership check when order is
down; rebuilding only order and payment.
**Consequences:** payment reads depend on the order service at request time; a non-owner's payment request skips
one query (accepted timing difference).

## D-012 — CI (003) moved to the backlog (2026-10-23)

**Context:** Phase 0 had 000, 001, 002 and 004 done; 003 (GitHub Actions CI) was the last feature. RVicky172 chose
to postpone it until they decide it is needed.
**Decision:** 003 is removed from Phase 0 and listed in the roadmap backlog. Phase 0's goal and exit criteria drop
"runs green in CI"; Phase 0 is complete. The number 003 stays unused; when CI is picked up it gets a fresh spec
(its number chosen then).
**Alternatives:** keep 003 in Phase 0 as not started (Phase 0 stays open).
**Consequences:** `npm run check` stays the only gate, run locally. When CI is done: Node 26 (D-009), and build
`shared` before typechecking services (no `.d.ts`; backlog).

## D-013 — 010 saga payloads scope (2026-10-23)

**Context:** 010's draft spec had seven open questions (Q1–Q7).
**Decision:** all accepted as proposed: cancelled orders store and show a reason (order field, API, Orders page);
payment events that reach the order service before `inventory.reserved` are handled; a spike investigates the 5
orders stuck at `PENDING` and the cause is fixed in 010 if it is in the saga consumers; stuck dev data gets a
documented manual reset, no code; payment success stays random behind `PAYMENT_SUCCESS_RATE` (1/0 for
measurements, injected randomness in unit tests); `ORDER_CONFIRMED`/`ORDER_CANCELLED` stay unused; the bar is
10 orders per path, each final within 10 s.
**Alternatives:** status only, no reason; ignoring arrival order; leaving the `PENDING` mystery to the backlog.
**Consequences:** 010 touches order (schema + consumer), inventory, payment, notification, shared and the frontend.

## D-014 — 010 plan choices (2026-10-23)

**Context:** 010's plan left three points for RVicky172; approved as recommended.
**Decision:** (1) a payment event that reaches the order service while the order is still `PENDING` is applied as
two steps, `PENDING → INVENTORY_RESERVED → CONFIRMED`, by a pure `nextTransitions` function; the state machine
gets no new transition; (2) the Kafka data volume stays off in 010: services create their topics at startup and
saga consumers use `fromBeginning: true`, so a Kafka reset no longer loses first messages; persisting Kafka data is
a backlog item; (3) payment outcome events get a deterministic `eventId` (`uuidv5` of the incoming event ID), so a
redelivered `inventory.reserved` republishes the same ID and inventory/notification skip it.
**Alternatives:** allow `PENDING → CONFIRMED`; enable the Kafka volume now; dedupe in inventory by
`(orderId, action)`.
**Consequences:** shared gains event payload types, parsers, `publishEvent` and `ensureTopics`; every saga service
changes in 010.

## D-015 — 010: self-healing saga consumers (2026-10-23)

**Context:** 010's spike (T001) disproved plan §0's theory (first messages skipped). The real cause of orders
stuck at `PENDING`: after a Kafka (re)start a service's consumer fails to subscribe ("This server does not host this
topic-partition"), `startConsumer` logs and gives up, and the service keeps running with `/health` 200 and no
consumer. Also found: the gateway rate limit (100 requests / 15 min per IP) blocks scripted polling.
**Decision:** shared `startSagaConsumer` runs ensure-topics (wait for leaders) → connect → subscribe
(`fromBeginning: true`) → run, retrying on any failure with backoff 1 s → 30 s cap, forever, and restarting after a
KafkaJS crash with `restart: false`; every saga service uses it. `/health` adds `consumer: starting|running` but
stays 200. Measurements poll order status in `order_db` with psql instead of through the gateway. Approved by
RVicky172. Supersedes plan §6 of D-014 (topic creation and `fromBeginning` remain, now inside the loop).
**Alternatives:** exit the process and add a Docker restart policy; return 503 from `/health` while the consumer is
down; raise the gateway rate limit for measurements.
**Consequences:** one consumer start path for all saga services, unit-tested with injected Kafka and sleep; a dead
consumer is visible in `/health`.
