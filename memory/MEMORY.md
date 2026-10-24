# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-24)

- **Phase:** 1 (Checkout & Assistant). Phase 0 complete 2026-10-23 (CI moved to backlog, D-012). SDD since 2026-10-23 (D-001).
- **Active feature:** 012 assistant evals + feedback + analytics — 🚧 In Progress 2026-10-24 (spec D-023, plan D-024); tasks.md 0/30
  (`specs/features/012-assistant-evals-feedback/`). 011 assistant policies + handoff ✔️ Implemented 2026-10-24 (13/13 ACs; D-016–D-022):
  policies 10/10 + 3/3 on Qwen3, first-ask handoff 4/4, product answers grounded 7/7, Kafka-down safe (D-021).
  Phase 1: 010 ✔️, 011 ✔️; 012 🚧.
- **Next step:** `/spec-implement 012` from T001 (LM Studio usage spike) and T002 (direct-call spike). Load LM Studio per
  `docs/lm-studio-setup.md` before live eval runs. 011 is in PR #1; 012 work is on branch `feat/012-assistant-evals-feedback`.
- **Testing:** `npm test` (Vitest, `packages/*/src/**/*.test.ts`, 237 tests); `npm run check` runs it. Node 26
  everywhere (D-009).
- **Tracking:** status lives in `specs/roadmap.json` + `feature.json` too; keep in sync (D-005). View: `npm run dashboard`.
- **Blockers:** none
- **Built before SDD (recorded in 000 `baseline.md`):** React Router frontend; AI assistant service (design-doc phases 0–2)
  with `anthropic` and `openai-compatible` (LM Studio) providers; opt-in internal service token.
- **Open:** assistant answered order questions on a live local model (LM Studio `qwen/qwen3-30b-a3b-2507`, 002
  T032); still unchecked on Claude (no Anthropic credits); full eval is 012 (G12).
  Known gaps: `specs/features/000-baseline/baseline.md` (G1, G2 closed by 002); G3/G4 closed by 010 (checkout completes).

## Files

- [decisions.md](decisions.md) — append-only decision log (why we chose X)
- [progress.md](progress.md) — session log, newest first
- [learnings.md](learnings.md) — gotchas and non-obvious fixes
