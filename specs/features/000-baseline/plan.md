# 000 — Baseline · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

This feature produces one document, `specs/features/000-baseline/baseline.md`: a point-in-time record (Q1) of the
platform as it is on the day it is written. No code under `packages/` changes (AC-7). Every section is built by
reading the source files it names, and each section opens with a `Source:` line listing those files so a reviewer
can check it (NFR: accuracy). Tables, not prose; the whole file stays under ~400 lines.

**§1 Document skeleton.** `baseline.md` has these sections, in order: header (date, commit hash it describes),
Services, API routes, Frontend pages, Kafka events, Pre-SDD work, Known gaps, Health measurement. The commit hash
pins the record: later readers diff against it.

**§2 Services (AC-1).** One row per package in `packages/` (10 runnable + `shared`): port, owned data store
(PostgreSQL database, MongoDB database or Redis key prefix), Kafka role (produces / consumes / none), and a
one-line responsibility. Taken from `docker-compose.yml` (ports, dependencies), each package's `src/index.ts` and
config/model files (store, connection), and `specs/constitution.md` §V (owners). Any service found touching a store
it does not own is a known gap (§7), not a correction to the table.

**§3 API routes (AC-2).** Start at the gateway: `packages/api-gateway/src/proxy.ts` (prefix → target, path
rewrite) and `middleware/auth.ts` (which prefixes require the Bearer JWT, which sub-paths are public). Then each
service's `src/routes/*.ts` and any `app.get/post` in `src/index.ts`. One row per route: method, public path
(`/api/v1/...`), owning service, auth (public / logged-in user / internal only), and a short purpose. A route a
service registers that no gateway prefix reaches (e.g. all of inventory) is listed with auth "internal only".
`/health` endpoints are listed once per service in §2, not in this table.

**§4 Frontend pages (Q3).** Short table from `packages/frontend/src/routes/router.tsx`, `paths.ts` and
`RequireAuth.tsx`: path → page component, logged-in required or not.

**§5 Kafka events (AC-3).** One row per topic in `packages/shared/src/events.ts` (6 topics): producer (file),
consumers (files), the payload fields the producer actually sends (read from the `send`/outbox call, not from a
type), and the fields each consumer reads. Where a consumer reads a field the producer does not send, or the types
differ, the row is flagged and the mismatch goes to §7. `EventTypes` values not carried on any topic
(`ORDER_CONFIRMED`, `ORDER_CANCELLED`) are noted as unused or internal.

**§6 Pre-SDD work (AC-4).** Three short subsections:
- Frontend: the router-based structure and its pages (refers to §4), session handling (`hooks/useSession.ts`).
- Assistant: each tool in `src/agent/tools.ts` (name, what it reads, which service it calls, read-only or
  proposal); the 2 providers (`providers/anthropic.ts`, `providers/openaiCompatible.ts`), the env variables that
  select and configure them (`ASSISTANT_PROVIDER` and friends, from `.env.example`), and the default.
- Internal service token: where the gateway adds `x-internal-token`, where `requireInternalToken` (shared) checks
  it, and the behaviour with `INTERNAL_SERVICE_TOKEN` unset (accepted) vs set (rejected without it).

**§7 Known gaps (AC-5).** Table: gap, evidence (file:line), impact, owner (roadmap feature id or "backlog").
Seeded with the 5 known gaps (ownership on `GET /orders/:id` and `GET /payments/:orderId` → 002; saga payload →
010; unprotected product writes, per-process rate limiter, client-trusted cart price → backlog) plus "assistant
not checked on a live model" (Q2) and anything §2–§6 surface. Per Q4, a new gap goes to the backlog unless it
lets one user read or change another user's data, which becomes a new Phase 0 roadmap feature. New backlog items
or features are added to `roadmap.md` **and** `roadmap.json` in the same step.

**§8 Health measurement (AC-6, Q2).** From a clean state (`docker compose down`, keeping volumes),
`docker compose up -d --build`, then wait on real signals: `docker compose ps` until every container with a
compose health check is `healthy`, then `curl` `/health` on each service port (4000–4008) and `GET /` on the
frontend (:3000, which has no `/health`; see decision D1). Record date, commit, and pass/fail + HTTP status per
service in `baseline.md`. No model is called.

**§9 Wire-up and gates (AC-7).** Add a one-line pointer from `specs/architecture.md` to `baseline.md` (Q1; the
architecture doc is otherwise unchanged). Run `npm run check` and `npm run build`; confirm
`git diff --stat packages/` is empty.

## Files

| File | Change | Purpose |
| ---- | ------ | ------- |
| `specs/features/000-baseline/baseline.md` | new | The baseline record (§1–§8) |
| `specs/architecture.md` | modify | One-line link to the baseline (§9) |
| `specs/roadmap.md`, `specs/roadmap.json` | modify | New backlog items / features found by §7; status updates |
| `specs/features/000-baseline/{tasks.md,feature.json,spec.md}` | modify | Tracking as tasks and ACs complete |
| `memory/progress.md`, `memory/MEMORY.md`, `memory/learnings.md` | modify | Session log, current state, gotchas found |
| `packages/**` | **none** | Read only (AC-7) |

## Data Structures & Interfaces

The baseline's table shapes (the "interface" later features diff against):

```
Services:   | Package | Port | Data store | Kafka | Responsibility |
API routes: | Method | Path | Service | Auth (public | user | internal) | Purpose |
Pages:      | Path | Page | Login required |
Events:     | Topic | Producer | Consumers | Payload sent | Fields read by consumers | Match? |
Gaps:       | # | Gap | Evidence (file:line) | Impact | Owner (NNN | backlog) |
Health:     | Service | URL | HTTP status | Result |   + date and commit hash
```

## Techniques

- **Cross-check counts.** For each table, a mechanical count from the code is recorded in the task's Result note
  and must match the row count: e.g. `router.(get|post|put|patch|delete)` calls across `packages/*/src/routes`
  (24 today) plus `app.<verb>` routes in `index.ts` files vs rows in API routes; `KafkaTopics` members (6) vs
  Events rows; directories in `packages/` (11) vs Services rows. This makes the manual review (AC-1–AC-3)
  repeatable instead of "looks complete".
- **Payloads from the send site.** Event payloads are read from the code that builds the message, because the
  known saga gap is exactly a type/send mismatch.
- **Security note.** The baseline names routes and token behaviour but never includes secret values from `.env`.

## Test Approach

There is no test harness yet (001), and this feature adds no code, so every AC is proven by a recorded manual
review or measurement, written as a Result note under its task.

| AC | Proof | Type |
| -- | ----- | ---- |
| AC-1 | Services rows = 11 = `ls packages/`; each port matches `docker-compose.yml` | manual review + count |
| AC-2 | Route rows match the router/app call count; each auth value checked against `proxy.ts` / `auth.ts` | manual review + count |
| AC-3 | 6 topic rows; each payload cited to its send site; mismatches present in §7 | manual review + count |
| AC-4 | Tools table matches the tool list in `tools.ts`; both providers and the token's set/unset behaviour recorded | manual review |
| AC-5 | The 5 seeded gaps present; every gap has an owner that exists in `roadmap.json` (feature id or backlog text) | manual review |
| AC-6 | Health table recorded from a clean `docker compose up -d --build` with date and commit | manual measurement |
| AC-7 | `npm run check` and `npm run build` exit 0; `git diff --stat packages/` empty | manual (command output) |

## Risks & Mitigations

- **The stack may not come up healthy** (Docker, Kafka start-up, `.env` drift). The measurement is recorded as it
  is; a failing service becomes a known gap with an owner rather than being fixed here (out of scope). If Docker
  itself is unavailable, AC-6 stays unchecked and is reported, not faked.
- **The frontend has no `/health`.** AC-6 says "the `/health` check of every service listed in AC-1", and AC-1
  includes the frontend. See decision D1.
- **Staleness.** The baseline goes out of date as soon as 001/002 land. Mitigation: it is pinned to a commit hash
  and labelled point-in-time; `architecture.md` stays the living overview.
- **Missed routes** (routes registered outside `routes/`, e.g. in `index.ts` or the assistant's chat router).
  Mitigation: the cross-check count covers `app.<verb>` and every `Router()` file, not only `routes/`.

No spike is needed; nothing here is technically uncertain.

## Constitution Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Spec before code | ✅ | Spec approved 2026-10-23; no feature code is written |
| II. Test-gated delivery | ⚠️ | No unit tests possible or needed (documentation only, harness arrives with 001); each AC is proven by a recorded review or measurement, and `npm run check` gates every task |
| III. Small dependencies | ✅ | No new dependency |
| IV. Memory maintained | ✅ | Progress, current state and any gotchas recorded; new gaps routed to the roadmap |
| V. Database per service | ✅ | No data access changes; the baseline records store ownership and flags any cross-service access as a gap |

## Decisions for review

- **D1 — Frontend health.** _Resolved 2026-10-23 (D-006):_ the frontend has no `/health`, so AC-6 accepts
  `GET /` returning 200 for it; the spec's AC-6 was reworded with a Changelog line.
