# 004 — Spec Dashboard

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 0 · **Created:** 2026-10-23 · **Owner:** RVicky172

## Summary

A local web dashboard, running as its own process separate from the store, that shows the state of the
spec-driven workflow at a glance: roadmap phases and feature statuses, each feature's stage and progress
(acceptance criteria and tasks ticked), and the project memory (current state, recent progress, decisions,
learnings). Tracking state lives in JSON files committed next to the specs — `specs/roadmap.json` for the
roadmap and a `feature.json` in each feature folder — so it is machine-readable, while the Markdown documents
stay the human-readable source of the prose. The dashboard reads these files directly (no database), and the
repository's gate keeps the JSON and Markdown in sync. It matters because the workflow's state is spread across
many files; the dashboard makes "where are we and what's next" visible without opening them one by one.

## User Stories

- **US-1:** As a developer, I want to see every roadmap phase and feature with its status so that I know what is
  done, in progress and next.
- **US-2:** As a developer, I want to open a feature and see its spec status, acceptance criteria and task list
  with what is ticked so that I can see how far it has got and what remains.
- **US-3:** As a developer, I want to see the project's current state, recent progress entries, decisions and
  learnings so that I can pick up work without reading every memory file.
- **US-4:** As a developer, I want the dashboard to update by itself when spec or memory files change so that I
  can keep it open while an agent works.

## Acceptance Criteria

- [x] **AC-1:** Given the dashboard is started with one command from the repository root, when I open its URL,
  then it loads on a port separate from the store's (not 3000 or 4000–4008), and the store's containers and
  services are not needed for it to run. _(manual)_
- [x] **AC-2:** Given `specs/roadmap.json`, when the overview loads, then every phase is listed with its goal
  and exit criteria and every feature with number, name and status (not started / spec drafted / spec approved /
  in progress / done, shown as labelled badges), plus overall counts per status and the backlog.
  _(unit: schema · manual: page)_
- [x] **AC-3:** Given a `feature.json` in a feature folder, when the overview loads, then that feature shows its
  stage (Spec / Plan / Tasks / Implementing / Verified) and progress bars with done/total acceptance criteria and
  done/total tasks, all read from the JSON. _(unit: schema · manual: page)_
- [x] **AC-4:** Given a feature, when I open its page, then I see from its `feature.json` the summary, acceptance
  criteria and tasks with their done state, unresolved open questions, and the rendered `spec.md`, `plan.md` and
  `tasks.md`. _(manual: page)_
- [x] **AC-5:** Given `memory/`, when I open the memory view, then I see "Current State" from `MEMORY.md`, the 5
  newest `progress.md` entries, and all decisions (`D-NNN`) and learnings. _(unit: memory parser · manual)_
- [x] **AC-6:** Given the dashboard is open, when a file under `specs/` or `memory/` is saved, then the open page
  shows the change within 3 seconds without a manual reload. _(manual measurement)_
- [x] **AC-7:** Given a missing or invalid tracking file (no `roadmap.json`, a feature folder without
  `feature.json`, malformed JSON, or a value that breaks the schema), when the dashboard loads, then it still
  renders the rest and shows a clear message naming the file and the problem instead of failing. _(unit)_
- [x] **AC-8:** The dashboard never writes to the repository: after using every page, `git status` shows no
  changes made by it. _(manual)_
- [x] **AC-9:** Given the tracking JSON, when `npm run check` runs at the repository root, then it fails if any
  JSON file breaks its schema or disagrees with the Markdown: feature ids/names/statuses vs `roadmap.md`,
  acceptance-criterion and task ids and done state vs `spec.md`/`tasks.md`, or the spec `Status:` line vs
  `feature.json`; and it passes when they agree. _(unit, proven by breaking a file)_

## Non-Functional Requirements

- Performance: the overview renders in under 1 second for up to 100 features on a typical dev machine.
- Security: binds to `localhost` only; read-only; serves only files under `specs/` and `memory/` (no path
  traversal outside them).
- Compatibility: Windows, macOS and Linux; Node.js ≥ 20; works in current Chrome, Edge and Firefox.
- Isolation: its dependencies don't change the store's packages or Docker images. The root `npm run check`
  gains one step: the tracking-file consistency check (AC-9).

## Out of Scope

- Editing specs, ticking tasks or changing statuses from the dashboard (read-only).
- Running the gate commands or agents from the dashboard.
- Authentication, multi-user use, or hosting it anywhere but the developer's machine.
- Git history or charts over time.

## Open Questions

- **Q1** Where does it live and how is it started? _Answer (2026-10-23):_ `tools/spec-dashboard/`, a
  standalone Next.js app outside the `packages/*` workspaces (its own `package.json`), started with
  `npm run dashboard` from the root, on port **3100**.
- **Q2** How "live" should updates be? _Answer (2026-10-23):_ the server watches `specs/` and `memory/`
  and pushes a change signal to open pages (AC-6, ≤ 3 s); no polling of unchanged files.
- **Q3** Should it also show the gate status (`npm run check` result)? _Answer (2026-10-23):_ no for
  now (out of scope); add later if wanted.

## Changelog

- 2026-10-23 — Created.
- 2026-10-23 — Approved by RVicky172 with the proposed answers to Q1–Q3.
- 2026-10-23 — Changed at RVicky172's request: tracking state moves to JSON (`specs/roadmap.json`, per-feature
  `feature.json`) instead of the dashboard parsing Markdown. AC-2/3/4/7 now read JSON; AC-9 added to keep JSON
  and Markdown in sync via `npm run check`; isolation NFR updated (D-005).
- 2026-10-23 — Verified: all 9 ACs proven; status Implemented.
