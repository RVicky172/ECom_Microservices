# Project Memory — Index

> Read this first every session. Keep ≤ 40 lines. Rules: `specs/memory-management.md`.

## Current State (2026-10-25)

- **Phase:** 1 (Checkout & Assistant). Phase 0 exit criteria met 2026-10-23 (CI moved to backlog, D-012); 005 added to it. SDD since 2026-10-23 (D-001).
- **Active feature:** 005 dependency upgrades + Dependabot + JSDoc + coding standards — 🚧 In Progress 2026-10-25 (spec D-030, plan D-031); tasks.md 36/43 (setup, steps 1–5 and the after-upgrade checks done: T001–T007, T010, T020–T027, T030–T033, T040, T041, T050, T060–T062, T070, T071, T075–T082)
  (`specs/features/005-dependency-upgrades-code-standards/`), branch `feat/005-dependency-upgrades-code-standards` from `main`.
- **Paused:** 012 assistant evals + feedback + analytics — 🚧 20/30 tasks, on branch `feat/012-assistant-evals-feedback`
  (rebased on `main` 2026-10-25, local only; remote still has the old stack). Resumes after 005: rebase on the upgraded
  `main`, then T031 next; T027 cases need the user's review.
- **Merged:** 011 assistant policies + handoff ✔️ squash-merged to `main` (PR #1, `f6a355c`, 2026-10-25).
- **Next step:** `/spec-implement 005`
  T085 (`specs/coding-standards.md`), then T086–T087 (references, records). `npm run check` is now 14 checks (JSDoc gate). T072 needs the branch pushed. Baseline user creds in `.env.local-notes`.
- **Testing:** `npm test` (Vitest, `packages/*/src/**/*.test.ts`, 275 tests on 005 (237 on `main`); 426 on 012); `npm run check` runs it. Node 26
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
