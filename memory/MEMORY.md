# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-23)

- **Phase:** 0 (Foundation). Spec-driven development set up on 2026-10-23 (D-001).
- **Active feature:** 004 spec dashboard — built; AC-6 awaits a browser check, then `/spec-verify 004`.
- **Next step:** finish 004, then `/spec-new 000-baseline` and 001 test harness (see `specs/roadmap.md`).
- **Tracking:** status lives in `specs/roadmap.json` + `feature.json` too; keep in sync (D-005). View: `npm run dashboard`.
- **Blockers:** none
- **Built before SDD (record in 000):** React Router frontend; AI assistant service (design-doc phases 0–2)
  with `anthropic` and `openai-compatible` (LM Studio) providers; opt-in internal service token.
- **Open:** assistant not yet checked on a live model (no Anthropic credits; LM Studio model being installed).
  Known gaps: `GET /orders/:id` and `/payments/:orderId` lack ownership checks (002); saga payload gap (010).

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
