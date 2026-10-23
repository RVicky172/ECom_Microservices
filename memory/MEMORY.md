# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-23)

- **Phase:** 1 (Checkout & Assistant). Phase 0 complete 2026-10-23 (CI moved to backlog, D-012). SDD since 2026-10-23 (D-001).
- **Active feature:** none — 010 saga payloads verified ✔️ 2026-10-23 (Phase 1: 1 of 3; checkout completes end to end).
  Phase 0 done (000, 001, 002, 004).
- **Next step:** `/spec-new 011` (assistant: store policies in the prompt, human handoff via Kafka). Saga consumers
  use shared `startSagaConsumer` (D-015); event payloads live in shared.
- **Testing:** `npm test` (Vitest, `packages/*/src/**/*.test.ts`, 173 tests); `npm run check` runs it. Node 26
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
