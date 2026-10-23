# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-23)

- **Phase:** 1 (Checkout & Assistant). Phase 0 complete 2026-10-23 (CI moved to backlog, D-012). SDD since 2026-10-23 (D-001).
- **Active feature:** 011 assistant policies + handoff — 🚧 In Progress since 2026-10-23; spec (D-016), plan (D-017);
  T001–T033 done (16 of 21): code complete, policies measured 10/10 + 3/3 on Qwen3 (D-018–D-020).
  Phase 0 done; Phase 1: 010 done ✔️ (checkout completes end to end).
- **Next step:** `/spec-implement 011` → T034 live handoff runs (incl. Kafka stopped), then T090–T092.
- **Testing:** `npm test` (Vitest, `packages/*/src/**/*.test.ts`, 228 tests); `npm run check` runs it. Node 26
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
