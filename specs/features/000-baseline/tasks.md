# 000 — Baseline · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred. Keep `feature.json` in step (same ids, same done state).

This feature writes documentation only; no file under `packages/` changes. The "tests" are the cross-check counts
taken mechanically from the code (plan, Techniques) before the tables are written; each table must match them.

## Setup

- [x] **T001** — Create `baseline.md` skeleton: header (date, commit hash described), section headings §2–§8 in
      plan order, a `Source:` line per section · files: `specs/features/000-baseline/baseline.md` · test:
      `npm run check` passes; headings match plan §1
      **Result (2026-10-23):** Skeleton with header (commit e9685bf), 7 sections in plan order, a Source line each.

## Tests First

- [x] **T005** — Record the expected counts from the code, before writing any table: packages in `packages/`
      (expect 11), route registrations (`router.<verb>` in `packages/*/src/**` incl. the assistant's chat router,
      plus `app.<verb>` in each `src/index.ts`, excluding `/health`), `KafkaTopics` members (expect 6), assistant
      tools in `src/agent/tools.ts`, frontend routes in `router.tsx` · files: this file (Result note) · test: the
      commands and numbers are recorded so T010–T014 can be checked against them
      **Result (2026-10-23):** Counted before writing tables: 11 dirs in packages/; 24 router.<verb> registrations (assistant 3, auth 5, cart 5, inventory 2, order 3, payment 1, product 5); app.<verb> only /health (9 services); 6 KafkaTopics; 7 defineTool calls; 6 frontend route entries.

## Core

- [x] **T010** — Services table (plan §2): port, data store, Kafka role, responsibility for all 11 packages;
      flag any access to a store the service does not own · files: `baseline.md` · test: row count = T005
      packages; every port matches `docker-compose.yml`
      **Result (2026-10-23):** 11 rows = 11 packages; ports match docker-compose.yml. No cross-service store access found (constitution V holds).
- [x] **T011** [P] — API routes table (plan §3): method, public path, service, auth (public / user / internal),
      purpose; inventory and other unexposed routes as "internal only" · files: `baseline.md` · test: row count
      = T005 route count; each auth value checked against `api-gateway/src/proxy.ts` and `middleware/auth.ts`
      **Result (2026-10-23):** 24 rows = 24 registrations; auth checked against proxy.ts (requireAuth on cart, orders, payments, assistant, auth/profile; products none); inventory internal only.
- [x] **T012** [P] — Frontend pages table (plan §4, Q3): path → page, login required · files: `baseline.md` ·
      test: row count = T005 frontend routes; guards checked against `RequireAuth.tsx`
      **Result (2026-10-23):** 6 rows = 6 route entries; guard from RequireAuth; the assistant is a panel in StoreLayout, not a route.
- [x] **T013** [P] — Kafka events table (plan §5): producer, consumers, payload sent (cited to the send site),
      fields read by consumers, match flag; unused `EventTypes` noted · files: `baseline.md` · test: 6 rows; every
      payload has a file:line citation; every mismatch is carried into T020
      **Result (2026-10-23):** 6 topic rows with send-site citations. Found: inventory.reserved sends only orderId (G3); payment.* carry items undefined (G4); order.shipped has no producer or handler (G9); ORDER_CONFIRMED/CANCELLED unused. Payment inserts amount undefined into a NOT NULL column, so orders stop at INVENTORY_RESERVED.
- [x] **T014** [P] — Pre-SDD work (plan §6): frontend structure and session, assistant tools table, the 2
      providers and their selecting env vars and default, internal service token set/unset behaviour · files:
      `baseline.md` · test: tools rows = T005 tool count; both providers and both token modes described with
      file citations; no secret values copied from `.env`
      **Result (2026-10-23):** 7 tool rows = 7 tools; both providers with env vars and defaults; token set/unset behaviour and /health exemption; no secret values copied.

## Integration

- [x] **T020** — Known gaps table (plan §7): the 5 seeded gaps, "assistant not checked on a live model", and every
      gap found by T010–T014, each with evidence (file:line), impact and owner; add new backlog items (or, for a
      cross-user data gap, a new Phase 0 feature) to `roadmap.md` **and** `roadmap.json` · files: `baseline.md`,
      `specs/roadmap.md`, `specs/roadmap.json` · test: the 5 seeded gaps present; every owner exists in
      `roadmap.json`; `npm run check` passes
      **Result (2026-10-23):** 12 gaps (G1-G12): the 5 seeded + live-model check (-> 012) + 6 found. New backlog items added to roadmap.md and roadmap.json for G8-G11. G11 narrowed after the user pointed out `.env` sets the token: direct service calls measured 401; only the empty `.env.example` default remains (backlog).
- [x] **T030** — Health measurement (plan §8): `docker compose down` (keep volumes), `docker compose up -d --build`,
      wait for `docker compose ps` healthy, then `curl` each backend `/health` (4000–4008) and `GET /` on :3000;
      record date, commit, HTTP status and result per service; a failing service becomes a gap in T020's table ·
      files: `baseline.md` · test: the recorded table itself (manual measurement)
      **Result (2026-10-23):** docker compose down (volumes kept), up -d --build --wait exit 0; at 2026-10-23T15:31:47Z all 9 backend /health and frontend GET / returned 200. gateway, notification and frontend have no compose healthcheck.

## Verify

- [x] **T090** — Link `baseline.md` from `specs/architecture.md` (one line; the doc stays the living overview) ·
      files: `specs/architecture.md`
      **Result (2026-10-23):** One-line link from specs/architecture.md to baseline.md.
- [x] **T091** — Definition-of-Done gates: `npm run check` and `npm run build` exit 0; `git diff --stat packages/`
      is empty; `baseline.md` is under ~400 lines; record the numbers
      **Result (2026-10-23):** npm run check 12/12, npm run build exit 0, git diff --stat packages/ empty, baseline.md 188 lines.
- [x] **T092** — Tick ACs in `spec.md` and `feature.json` (Status `Implemented`), update `roadmap.md`/`roadmap.json`,
      `memory/progress.md`, `memory/MEMORY.md`
      **Result (2026-10-23):** check 12/12, build exit 0, `packages/` unchanged; AC-1–AC-7 ticked; spec Implemented, roadmap ✔️.

## AC coverage

| AC   | Tasks            |
| ---- | ---------------- |
| AC-1 | T005, T010       |
| AC-2 | T005, T011       |
| AC-3 | T005, T013, T020 |
| AC-4 | T005, T012, T014 |
| AC-5 | T020             |
| AC-6 | T030             |
| AC-7 | T091             |
