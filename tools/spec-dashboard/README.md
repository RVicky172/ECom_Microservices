# Spec Dashboard

A local web app that shows the spec-driven workflow at a glance: roadmap phases and feature statuses, each
feature's stage and progress, and the project memory. It updates by itself when files change, so you can keep it
open while you or an agent work. Spec: [`specs/features/004-spec-dashboard`](../../specs/features/004-spec-dashboard/spec.md).

## Run it

From the repository root:

```sh
npm run dashboard
```

The first run installs the dashboard's own dependencies. Then open **http://127.0.0.1:3100**. It runs as its own
process and doesn't need the store's containers or services.

## What it reads

| Source | Used for |
| --- | --- |
| `specs/roadmap.json` | Phases, goals, exit criteria, features and their statuses, backlog |
| `specs/features/NNN-name/feature.json` | A feature's status, stage, acceptance criteria, tasks, open questions |
| `specs/features/NNN-name/{spec,plan,tasks}.md` | Rendered on the feature page |
| `memory/*.md` | Current state, recent progress, decisions, learnings |

The JSON files are the tracking state. They mirror the Markdown documents, and the root `npm run check` fails when
the two disagree (wrong status, missing task, different tick). See "Tracking files" in
[`specs/workflow.md`](../../specs/workflow.md) for the format and statuses.

The dashboard only reads. It binds to `127.0.0.1`, serves only `specs/` and `memory/` content, and never writes
files. A missing or invalid tracking file shows as a message naming the file and the problem; the rest of the page
still works.

## Pages

- **`/` Overview:** counts per status, open questions, the current state, each phase with its features (status
  badge, stage, AC and task progress) and the backlog.
- **`/features/[folder]`:** stage steps, AC and task checklists, unresolved questions, and tabs for `spec.md`,
  `plan.md` and `tasks.md`.
- **`/memory`:** current state, the 5 newest progress entries, decisions and learnings.

## How live updates work

`lib/watch.ts` watches `specs/` and `memory/` and, 300 ms after the last change, notifies the
`/api/events` Server-Sent Events stream. `components/LiveRefresh.tsx` listens and calls `router.refresh()`, which
re-renders the page with the new file contents. The header shows "Live" while connected.

## Develop

```sh
cd tools/spec-dashboard
npm run dev        # http://127.0.0.1:3100
npm run check      # typecheck + tests (also run by the root npm run check)
npm run build      # production build
```

| Path | Contents |
| --- | --- |
| `lib/schema.ts` | Zod schemas for `roadmap.json` and `feature.json`, tolerant loader |
| `lib/consistency.ts` | JSON ↔ Markdown consistency check |
| `lib/repo.consistency.test.ts` | Runs that check on this repository |
| `lib/parse/` | Markdown parsers (memory view, consistency check) |
| `lib/repo.ts` | Safe, read-only file access |
| `app/` | Pages and the `/api/events` route |

`SPEC_DASHBOARD_ROOT` points the dashboard at another checkout (default: two folders up).
