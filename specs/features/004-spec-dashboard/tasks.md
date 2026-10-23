# 004 — Spec Dashboard · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred. Keep `feature.json` in step (same ids, same done state).

## Setup

- [x] **T001** — Scaffold `tools/spec-dashboard` (package.json, tsconfig, next.config, vitest config, start
      script), root `dashboard` script, `.gitignore` `.next/` · files: `tools/spec-dashboard/*`, `package.json`,
      `.gitignore` · test: app `npm run check` passes
      **Result (2026-10-23):** Next 16.4.2, React 19.3.1, TypeScript 5.9.3, Vitest 5.0.5. Vitest 5 needs
      `@types/node` ≥ 22 (peer conflict with 20). Config renamed to `vitest.config.mts` to avoid a Vite ESM warning.

## Tests First

- [x] **T010** — Failing tests for the roadmap Markdown parser · files: `lib/parse/roadmap.test.ts`
      **Result (2026-10-23):** failed first (module missing), then passed.
- [x] **T011** [P] — Failing tests for the feature Markdown parser · files: `lib/parse/feature.test.ts`
      **Result (2026-10-23):** failed first, then passed; sabotaging the "Implemented → verified" rule fails 1 test.
- [x] **T012** [P] — Failing tests for the memory parser · files: `lib/parse/memory.test.ts`
      **Result (2026-10-23):** first sabotage (no fence stripping) went unnoticed; fixture strengthened with a
      dated example inside a fence, after which the sabotage fails the test.
- [x] **T013** — Failing tests for the JSON schemas (valid files, missing, malformed, schema errors) · files:
      `lib/schema.test.ts`
      **Result (2026-10-23):** 5 tests, passing.
- [x] **T014** [P] — Failing tests for the JSON ↔ Markdown consistency check · files: `lib/consistency.test.ts`
      **Result (2026-10-23):** 8 tests, passing.
- [x] **T015** — Real-repository consistency test · files: `lib/repo.consistency.test.ts`
      **Result (2026-10-23):** failed before `roadmap.json` existed ("file not found"), as intended.

## Core

- [x] **T020** — Roadmap Markdown parser (now used by the consistency check) · files: `lib/parse/roadmap.ts`,
      `lib/parse/markdown.ts` · test: T010
      **Result (2026-10-23):** passing.
- [x] **T021** — Feature Markdown parser (consistency check) · files: `lib/parse/feature.ts` · test: T011
      **Result (2026-10-23):** passing.
- [x] **T022** — Memory parser · files: `lib/parse/memory.ts` · test: T012
      **Result (2026-10-23):** passing.
- [x] **T023** — Repo access: root resolution, safe reads, folder listing and name validation, JSON loading ·
      files: `lib/repo.ts` · test: typecheck + T040 (unknown folder → 404)
      **Result (2026-10-23):** rewritten for JSON after the spec change; typechecks.
- [x] **T024** — JSON schemas and tolerant loader · files: `lib/schema.ts` · test: T013
      **Result (2026-10-23):** Zod 4 schemas; errors name the file and the first 5 issues.
- [x] **T025** — Consistency check · files: `lib/consistency.ts` · test: T014
      **Result (2026-10-23):** compares roadmap ids/names/statuses, spec status, AC and task ids and done state.
- [x] **T026** — Tracking files for this repo: `specs/roadmap.json`, `specs/features/004-spec-dashboard/feature.json`,
      `specs/templates/feature-template.json` · test: T015 passes
      **Result (2026-10-23):** roadmap.json (8 features, 2 phases), 004 feature.json, feature template; the real-repo check passes.

## Integration

- [x] **T030** — Overview page from `roadmap.json` and `feature.json` files · files: `app/layout.tsx`,
      `app/page.tsx`, `components/*`, `app/globals.css` · test: page renders this repo (manual)
      **Result (2026-10-23):** overview renders from JSON: counts, current state, phases, progress (e.g. "ACs 0/9", "Tasks 13/24"); 200 in 0.05 s.
- [x] **T031** — Feature page from `feature.json` plus rendered documents · files: `app/features/[id]/page.tsx` ·
      test: 004 page renders (manual)
      **Result (2026-10-23):** feature page renders checklists, notes and spec/plan/tasks tabs; unknown folder → 404, `..%2F` path → 400.
- [x] **T032** — Memory page · files: `app/memory/page.tsx` · test: page renders (manual)
      **Result (2026-10-23):** memory page shows current state, 5 progress entries, 5 decisions, 3 learning topics.
- [x] **T033** — Live updates: watcher, SSE route, `LiveRefresh` · files: `lib/watch.ts`,
      `app/api/events/route.ts`, `components/LiveRefresh.tsx` · test: AC-6 measurement
      **Result (2026-10-23):** file change → SSE `change` event in 310–314 ms over 4 runs (specs/ and memory/), 300 ms of it debounce.
- [x] **T034** — Root `npm run check` runs the dashboard's typecheck and tests (incl. the consistency check)
      when the dashboard is installed · files: `scripts/check.mjs` · test: break a JSON file → root check fails
      **Result (2026-10-23):** root `npm run check` = 11 typechecks + dashboard check; marking T030 done only in feature.json made it fail with the exact mismatch, restored → pass.
- [x] **T035** — Workflow keeps JSON current: `/spec-*` commands, `workflow.md`, `CLAUDE.md`, templates ·
      files: `.claude/commands/*`, `specs/workflow.md`, `CLAUDE.md`
      **Result (2026-10-23):** /spec-new, -plan, -tasks, -implement, -verify, workflow.md ("Tracking files"), CLAUDE.md, specs/README.md and roadmap.md now require updating JSON with the Markdown.

## Verify

- [x] **T040** — Manual checks: AC-1 (port, store not needed), AC-6 (≤ 3 s), AC-7 (broken JSON shows a
      message), AC-8 (`git status` clean), unknown folder → 404; `next build` succeeds
      **Result (2026-10-23):** AC-1 ✔ (127.0.0.1:3100 only; Docker and ports 3000/4000/4001 down; `/` 200 in
      0.07 s). AC-7 ✔ (malformed `feature.json` → "invalid JSON: Expected double-quoted property name…"; bad
      `status` → "status: Invalid option…"; missing `roadmap.json` → "file not found"; rest of page renders).
      AC-8 ✔ (`git status` unchanged after all pages). `/features/999-nope` → 404, `..%2F` → 400. `next build`
      ✔ with `NODE_ENV=production` (fails with the shell's `NODE_ENV=development`, see learnings).
      AC-6 ✔ confirmed by RVicky172 in a browser: saving `memory/MEMORY.md` updated the open `/memory` page
      within seconds, no reload (server-side signal ~310 ms).
- [x] **T090** — Update `specs/architecture.md`, `specs/tech-stack.md`, `tools/spec-dashboard/README.md`, root
      README pointer.
      **Result (2026-10-23):** architecture.md (layout + tracking section), tech-stack.md (Developer Tools), tools/spec-dashboard/README.md, root README.
- [x] **T091** — Every Definition-of-Done gate green (`npm run check`, `npm run build`); record the numbers.
      **Result (2026-10-23):** root `npm run check`: all 12 checks pass; root `npm run build`: exit 0 (8.9 s); dashboard `next build`: compiled, no warnings after the turbopackIgnore fix.
- [x] **T092** — Tick ACs in `spec.md` and `feature.json` (status `implemented`), update `roadmap.md` and
      `roadmap.json`, `memory/progress.md`, `memory/MEMORY.md`.

## AC coverage

| AC   | Tasks |
| ---- | ----- |
| AC-1 | T001, T040 |
| AC-2 | T013, T024, T026, T030 |
| AC-3 | T013, T024, T026, T030 |
| AC-4 | T031 |
| AC-5 | T012, T022, T032 |
| AC-6 | T033, T040 |
| AC-7 | T013, T024, T030, T031, T040 |
| AC-8 | T023, T040 |
| AC-9 | T014, T015, T025, T034, T035 |
