# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-25)

- **Phase:** 1 (Checkout & Assistant). Phase 0 fully done: exit criteria met 2026-10-23 (CI in backlog, D-012), and 005 ✔️ 2026-10-25. SDD since 2026-10-23 (D-001).
- **Active feature:** 012 assistant evals + feedback + analytics — 🚧 In Progress (spec D-023, plan D-024); tasks.md 26/31 (T001, T002, T010–T018, T020–T026, T028, T027, T029–T033, T036 done)
  (`specs/features/012-assistant-evals-feedback/`), branch **`feat/012-evals-on-main`** (local and origin; the old
  `feat/012-assistant-evals-feedback` and the merged 005 branches were deleted 2026-10-25). **`main` merged in 2026-10-25** (005 upgrades + standards), so 012 now
  runs on Express 5, React 19, TS 7 and must pass check-docs + check-size and follow `specs/coding-standards.md`.
- **Done:** 011 ✔️ (PR #1, `f6a355c`); 005 ✔️ Implemented 2026-10-25, 13/13 ACs (PR #2 `fa27285` upgrades, PR #3 `60f6041` standards/records).
  005 left: `specs/coding-standards.md` (16 rules, constitution 1.1.0, D-044), Dependabot (alerts + security updates on), 15-check gate.
- **Next step:** T034 (2 consecutive runs ≥ 90%, 0 safety). Latest run 7: 43/50, 0 safety (injection now filtered in code, D-047); recurring misses X03/X05/C01/C02, flaky H04/H05; then T034 (2 eval runs) after T030, T035 docs. Load LM Studio per
  `docs/lm-studio-setup.md` before live eval runs. Baseline user creds in `.env.local-notes`.
- **Testing:** `npm test` (Vitest: `packages/*/src/**/*.test.ts` + `scripts/**/*.test.mjs`); `npm run check` = 15 checks (typecheck ×11, unit tests,
  JSDoc, file size, dashboard). Node 26, TypeScript 7 everywhere (D-009, D-033).
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
