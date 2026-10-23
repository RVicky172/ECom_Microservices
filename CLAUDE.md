# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository.

## Project

**mercato — E-Commerce Microservices Platform** — a learning-oriented e-commerce platform of TypeScript
microservices behind an API gateway, with a React storefront and an AI shopping assistant. See
`specs/constitution.md` for the mission and `README.md` for running the stack.

## Start Every Session

1. Read `memory/MEMORY.md` (current state + active feature).
2. Read the newest entry in `memory/progress.md`.
3. Open the active feature in `specs/features/NNN-*/` and find the next unchecked task.
4. If the task touches principles, re-read `specs/constitution.md`.

## Spec-Driven Workflow (mandatory)

**Specify → Plan → Tasks → Implement → Verify.** Full rules: `specs/workflow.md`.

- Never write feature code without an **Approved** `spec.md`. If none exists, draft one and stop for review.
- Never plan from a spec that still has `[NEEDS CLARIFICATION]` markers — ask the user.
- Work one task from `tasks.md` at a time; tick it only after its tests pass.
- If code must diverge from the spec, update the spec (and its Changelog) first.
- Tracking state also lives in JSON (`specs/roadmap.json`, the feature's `feature.json`); whenever a status, an AC or a task changes, update the Markdown **and** the JSON in the same step — `npm run check` fails if they disagree.
- Slash commands: `/spec-new`, `/spec-plan`, `/spec-tasks`, `/spec-implement`, `/spec-verify`.

## Key Docs

| Doc                         | Read when                                               |
| --------------------------- | ------------------------------------------------------- |
| `specs/constitution.md`     | Before any design decision; contains Definition of Done |
| `specs/architecture.md`     | Before touching shared code or adding a module          |
| `specs/tech-stack.md`       | Before adding any dependency                            |
| `specs/testing-strategy.md` | Before writing tests                                    |
| `specs/roadmap.md`          | Choosing what's next                                    |
| `specs/roadmap.json`, `specs/features/*/feature.json` | Tracking state (keep in sync with the Markdown) |

## Commands

```bash
npm run check  # fast gate — typechecks all packages; must pass before any task is ticked
npm test       # unit tests (none yet — the harness arrives with feature 001)
npm run build  # production build of every package
npm run dashboard  # spec dashboard on http://127.0.0.1:3100 (separate process, live)

docker compose up -d --build <service>   # rebuild and restart one service
docker compose logs -f <service>         # follow its logs
```

After changing `.env`, rebuild every service that reads the changed variable (for `INTERNAL_SERVICE_TOKEN`,
all of them).

`npm run check` must pass before any task is marked done.

## Memory Management (project memory in `memory/`)

Full rules: `specs/memory-management.md`.

- **Decision made** (library, pattern, spec change) → append to `memory/decisions.md` right away.
- **Gotcha found** (lost >10 min, non-obvious fix) → add to `memory/learnings.md`.
- **End of session** → add an entry to `memory/progress.md` and update "Current State" in `memory/MEMORY.md`.
- Shared project knowledge goes in `memory/` (committed). Personal agent memory is only for one user's
  preferences — never the only place a project fact lives.
- Use absolute dates. Fix or delete memory that becomes wrong.

## Git

- Commit only when asked. Conventional-style messages referencing the feature: `feat(012): add login form`.
- Run `npm run check` before committing.
