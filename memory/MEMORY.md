# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-25)

- **Phase:** 1 (Checkout & Assistant). Phase 0 fully done: exit criteria met 2026-10-23 (CI in backlog, D-012), and 005 ✔️ 2026-10-25. SDD since 2026-10-23 (D-001).
- **Just finished:** 005 dependency upgrades + Dependabot + JSDoc + coding standards — ✔️ Implemented 2026-10-25, 13/13 ACs, 43/43 tasks.
  Upgrades merged via **PR #2** (`fa27285`); the standards, records and verify are on `feat/005-standards-and-records` (uncommitted, needs a PR).
  New: `specs/coding-standards.md` (16 rules; constitution 1.1.0, D-044), Dependabot (alerts + security updates on), gates check-docs + check-size.
- **Paused → next:** 012 assistant evals + feedback + analytics — 🚧 20/30 tasks, branch `feat/012-assistant-evals-feedback`
  (local; remote still has the old stack). Resume: rebase onto the upgraded `main` (expect conflicts in package.json/lockfile and
  in files that gained JSDoc; 012's new files must pass check-docs and check-size), then T031; T027 cases need the user's review.
- **Merged:** 011 ✔️ (PR #1, `f6a355c`); 005 upgrades (PR #2, `fa27285`).
- **Next step:** commit and PR `feat/005-standards-and-records` (when the user asks), then `/spec-implement 012` after the rebase.
  Baseline user creds in `.env.local-notes`.
- **Testing:** `npm test` (Vitest: `packages/*/src/**/*.test.ts` + `scripts/**/*.test.mjs`; 283 tests on 005, 426 on 012 before its rebase);
  `npm run check` = 15 checks (typecheck ×11, unit tests, JSDoc, file size, dashboard). Node 26, TypeScript 7 everywhere (D-009, D-033).
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
