# 000 — Baseline

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 0 · **Created:** 2026-10-23 · **Owner:** RVicky172

## Summary

A written record of what the platform is and does today, before any spec-driven feature changes it: every
service and what it owns, every route the gateway exposes, every Kafka event and who produces and consumes it,
the work built before spec-driven development started (React Router frontend, AI shopping assistant with its two
model providers, the opt-in internal service token), and the known gaps. It matters because later specs describe
changes, and a change can only be checked against a known starting point. Without a baseline, questions like
"what did 002 change?" or "is this gap new?" have no answer, and the pre-SDD work stays undocumented.

## User Stories

- **US-1:** As a developer, I want one document listing every service with its port, data store and
  responsibility so that I know where a change belongs without reading every package.
- **US-2:** As a developer, I want every public route listed with its method, path, owning service and whether it
  needs a logged-in user so that I can see the API surface and spot unprotected routes.
- **US-3:** As a developer, I want every Kafka event listed with its producer and consumers so that I can trace
  the checkout saga and know what a payload change affects.
- **US-4:** As a developer, I want the known gaps listed, each linked to the roadmap feature or backlog item that
  will close it, so that no known problem is undocumented.
- **US-5:** As a developer, I want the features built before spec-driven development recorded as a feature with
  its own acceptance criteria so that the dashboard and roadmap show them as done work with evidence.

## Acceptance Criteria

- [x] **AC-1:** Given the baseline document, when compared with `docker-compose.yml` and `packages/`, then it
  lists all 10 runnable packages (gateway, 8 services, frontend) and `packages/shared`, each with port, owned data
  store (database or Redis key prefix) and a one-line responsibility; nothing is missing or extra. _(manual
  review against the repo)_
- [x] **AC-2:** Given the baseline document, when compared with the gateway's routing and each service's
  routers, then every route reachable through the gateway is listed with method, path, owning service and auth
  requirement (public / logged-in user / internal only), and every route a service registers but the gateway does
  not expose is listed as internal. _(manual review against the code)_
- [x] **AC-3:** Given `packages/shared/src/events.ts`, when compared with the baseline, then each of its 6 topics
  is listed with producer, consumers and the payload fields the producer actually sends; every mismatch between
  what a producer sends and what a consumer reads is listed as a known gap. _(manual review against the code)_
- [x] **AC-4:** Given the baseline, when read, then it records the pre-SDD work: the React Router frontend's
  pages, the assistant service's tools and its 2 providers (`anthropic`, `openai-compatible`) with how each is
  selected, and how the internal service token behaves when set and when unset. _(manual review)_
- [x] **AC-5:** Given the baseline's known-gaps list, when read, then it includes at least the ownership gap on
  `GET /orders/:id` and `GET /payments/:orderId` (→ 002), the saga payload gap (→ 010), unprotected product write
  routes, the per-process rate limiter and the client-trusted cart price (→ backlog), and every listed gap points
  to a roadmap feature or a backlog item (new backlog items are added to `roadmap.md` and `roadmap.json`).
  _(manual review)_
- [x] **AC-6:** Given a clean `docker compose up -d --build`, when the stack has started, then the `/health`
  check of every backend service listed in AC-1 reports healthy and the frontend's page loads (`GET /` returns
  200; it has no `/health`), and the result (date, pass/fail per service) is recorded
  in the baseline as a measurement. _(manual measurement)_
- [x] **AC-7:** Given the baseline is written, when `npm run check` and `npm run build` run, then both pass, and
  no file under `packages/` was changed by this feature (`git diff --stat packages/` is empty). _(manual)_

## Non-Functional Requirements

- Accuracy: every statement in the baseline is checkable against a file in the repo; each section names the
  files it was taken from.
- Length: readable in one sitting — tables, not narrative; the whole document stays under ~400 lines.

## Out of Scope

- Fixing any gap found — gaps are recorded and routed to a feature or the backlog, not fixed here.
- Changes to service code, configuration or the frontend.
- Updating the HLD/LLD `.docx` guide or `doc_extract.txt` (already a backlog item).
- Automated tests that keep the baseline in sync with the code (001 brings the test harness).

## Open Questions

- **Q1** _(Resolved 2026-10-23: proposed answer accepted)_ Where does the baseline live? _Proposed:_ a `baseline.md` in this feature folder
  (a point-in-time record), with `specs/architecture.md` linking to it; `architecture.md` stays the living
  overview and is not expanded into the baseline.
- **Q2** _(Resolved 2026-10-23: proposed answer accepted)_ Does AC-6 (whole stack healthy via Docker) belong here, given the assistant has not
  yet run against a live model? _Proposed:_ yes — health checks only, which do not need a model; whether the
  assistant answers on a live model is recorded as an open gap, not an AC.
- **Q3** _(Resolved 2026-10-23: proposed answer accepted)_ Should the frontend's routes (pages) be listed alongside the API routes?
  _Proposed:_ yes, as a short separate table (path → page, logged-in or not), since it is part of the pre-SDD work.
- **Q4** _(Resolved 2026-10-23: proposed answer accepted)_ Do gaps found while writing the baseline that are not yet on the roadmap go to the
  backlog or become new Phase 0 features? _Proposed:_ backlog by default; only a gap that lets one user read or
  change another user's data becomes a new Phase 0 feature (like 002).

## Changelog

- 2026-10-23 — Created.
- 2026-10-23 — Q1–Q4 resolved (proposed answers accepted); spec approved.
- 2026-10-23 — AC-6: the frontend is checked by `GET /` returning 200, since it has no `/health` (plan D1, D-006).
- 2026-10-23 — Verified: AC-1–AC-7 proven (see `tasks.md` Results); status Implemented.
