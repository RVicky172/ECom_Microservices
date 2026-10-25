# Spec-Driven Workflow

Every feature moves through five gated stages. Each stage produces a file in `specs/features/NNN-short-name/`.
Do not start a stage until the previous one is approved.

```
 1. SPECIFY  ──►  2. PLAN  ──►  3. TASKS  ──►  4. IMPLEMENT  ──►  5. VERIFY
   spec.md        plan.md       tasks.md        code + tests       Definition of Done, docs, memory
   (what/why)     (how)         (steps)
```

## Tracking files (JSON)

Tracking state is kept in JSON next to the Markdown, so tools (the spec dashboard, `npm run dashboard`) can read it:

- `specs/roadmap.json` — phases, features (`id`, `name`, `status`, `folder`), backlog. Mirrors `roadmap.md`.
- `specs/features/NNN-name/feature.json` — `status`, `stage`, acceptance criteria, tasks and open questions.
  Mirrors the feature's `spec.md` and `tasks.md`. Template: `templates/feature-template.json`.

Statuses: roadmap `not-started | drafted | approved | in-progress | done`; spec `draft | approved | in-progress |
implemented | superseded`; stage `spec | plan | tasks | implementing | verified`.

**Rule:** change the Markdown and the JSON in the same step. `npm run check` fails if ids, names, statuses or done
states disagree (schemas and check: `tools/spec-dashboard/lib/`).

## Feature numbering

`000–009` Phase 0 (foundation), `010–019` Phase 1 (checkout & assistant), `020–029` Phase 2 (to be planned), `030+` polish.

Folder name: `NNN-kebab-name` (e.g. `012-user-login`).

## Stage 1 — Specify (`spec.md`)

Copy `templates/spec-template.md`. Describe **what** and **why**, never **how**:
user stories, acceptance criteria (testable, numbered `AC-1…`, each naming the test type that proves it),
out-of-scope, open questions. Set `Status: Draft`. A human reviews and changes it to `Status: Approved`.
**Gate:** no `[NEEDS CLARIFICATION]` markers remain; every AC is testable.

## Stage 2 — Plan (`plan.md`)

Copy `templates/plan-template.md`. Describe **how**: files touched, interfaces, techniques, risks, a test for every
AC, and a **Constitution check** (each principle: ✅ / ⚠️ with justification). A human approves it.
**Gate:** constitution check passes; no new dependency without a `tech-stack.md` update.

## Stage 3 — Tasks (`tasks.md`)

Copy `templates/tasks-template.md`. Break the plan into small ordered tasks (≤ ~1 hour each), each naming the files
it touches and the test that proves it. Tests are written **before or with** the code they cover. Mark tasks that
can run in parallel with `[P]`. Every AC is covered by at least one task (AC coverage table).

## Stage 4 — Implement

Work one task at a time, following `specs/coding-standards.md` for new and changed code. After each task:

1. Run `npm run check`. Fix until green.
2. Tick the task in `tasks.md` and add a short dated **Result** note under it: what was done, what was measured,
   anything surprising. These notes are the evidence Stage 5 checks.
3. Record decisions in `memory/decisions.md` and gotchas in `memory/learnings.md` as they happen.

For an important test, prove it can fail: break the code briefly, see the test fail, restore.

## Stage 5 — Verify

Run every gate in the Definition of Done (`constitution.md`): `npm run check`, `npm run build`. Then:

- Check each AC against its test or measurement; tick only the proven ones. Set `Status: Implemented`.
- Update `roadmap.md`, add a `memory/progress.md` entry, refresh "Current State" in `memory/MEMORY.md`.
- Report honestly anything that failed, was flaky, or was skipped.

## Changing a spec mid-flight

Stop. Edit `spec.md`, add a line to its **Changelog**, log the decision in `memory/decisions.md`, and re-check
`plan.md`/`tasks.md` for impact (add tasks if needed) — then write the code. Never silently diverge code from spec.

## Reviewing a Dependabot PR

Dependabot (`.github/dependabot.yml`) opens weekly PRs: one grouped `minor-and-patch` PR per ecosystem, and one PR
per major. There is no CI yet (D-012), so every PR is checked locally before it is merged:

1. Check it out: `gh pr checkout <number>`.
2. `npm ci` (for a dashboard PR: `npm --prefix tools/spec-dashboard ci`).
3. `npm run check` and `npm run build`. For a dashboard PR, also `npm --prefix tools/spec-dashboard run check` and
   `NODE_ENV=production npx next build` in `tools/spec-dashboard`.
4. Rebuild the affected images: `docker compose up -d --build <service>` for each package whose `package.json`
   changed; all of them when `packages/shared` or a Dockerfile base image changed. Then check `/health` on each.
5. A **major** version: read its release notes or migration guide, try the paths it touches end to end, and add a
   `memory/decisions.md` entry (what broke, what changed, alternatives). If code has to change, it is a feature:
   spec it first.
6. Merge only when every step is green. If one fails, comment the failure on the PR and leave it open.

## Slash commands (Claude Code)

Shortcuts in `.claude/commands/`:

| Command                 | Does                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `/spec-new <name>`      | Creates the next numbered feature folder with a draft `spec.md` |
| `/spec-plan <NNN>`      | Writes `plan.md` for an approved spec                           |
| `/spec-tasks <NNN>`     | Writes `tasks.md` from the plan                                 |
| `/spec-implement <NNN>` | Implements the next unchecked task(s), running tests            |
| `/spec-verify <NNN>`    | Runs the Definition-of-Done checklist and updates docs/memory   |
