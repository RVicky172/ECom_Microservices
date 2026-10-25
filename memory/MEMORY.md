# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-25)

- **Phase:** 1 (Checkout & Assistant). Phase 0 fully done: exit criteria met 2026-10-23 (CI in backlog, D-012), and 005 ✔️ 2026-10-25. SDD since 2026-10-23 (D-001).
- **Active feature:** none. 012 assistant evals + feedback + analytics ✔️ **Implemented 2026-10-25** (14 ACs; **AC-5 deferred**, D-049):
  50 eval cases + `npm run eval`, feedback, analytics + `npm run assistant:usage`, plural search, injection filter (D-047), handoff guard (D-048).
  Branch `feat/012-evals-on-main` (not yet PR'd/merged). Phase 1: 010, 011, 012 done; its eval exit criterion deferred.
- **Done:** 011 ✔️ (PR #1, `f6a355c`); 005 ✔️ Implemented 2026-10-25, 13/13 ACs (PR #2 `fa27285` upgrades, PR #3 `60f6041` standards/records).
  005 left: `specs/coding-standards.md` (16 rules, constitution 1.1.0, D-044), Dependabot (alerts + security updates on), 15-check gate.
- **Next step:** commit + PR + merge `feat/012-evals-on-main` when the user asks; then pick the next feature from the roadmap backlog
  (Phase 1 is done). AC-5 (deferred): 2× `npm run eval` ≥ 90% on a stronger model. Creds in `.env.local-notes`.
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
