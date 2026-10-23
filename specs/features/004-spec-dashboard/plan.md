# 004 — Spec Dashboard · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-23, approved together with the spec: "plan and build it now";
§2–§3 revised the same day for JSON tracking files, D-005)

## Approach

§1 **Standalone app.** A Next.js 16 (App Router, TypeScript) app in `tools/spec-dashboard/`, outside the root
`packages/*` workspaces, with its own `package.json` and lockfile. Store packages, Docker images and
`npm run check` are untouched (spec NFR "Isolation"). Root script `npm run dashboard` runs its `start` script,
which installs dependencies on first run and then serves `next dev` on `127.0.0.1:3100` (AC-1).

§2 **Read-only file source.** Tracking data comes from JSON: `specs/roadmap.json` and each feature's
`feature.json` (schemas in `lib/schema.ts`, validated with Zod; a missing or invalid file becomes an error message
on the page, AC-7). Markdown documents are read only to render them. Server components read the files straight
from the repository on each request
(`dynamic = 'force-dynamic'`), so there is no cache to go stale and no database. The repository root is two
levels up from the app, overridable with `SPEC_DASHBOARD_ROOT`. Only fixed paths under `specs/` and `memory/`
and feature folders found by listing `specs/features/` are read; a feature id from the URL must match
`^\d{3}-[a-z0-9-]+$` **and** be one of the listed folders (no path traversal). Nothing is ever written (AC-8).

§3 **Consistency check (AC-9).** `lib/consistency.ts` compares the JSON with the Markdown — roadmap feature
ids, names and statuses; spec `Status:`; acceptance-criterion and task ids and done state — using the pure
Markdown parsers in `lib/parse/` (unit tested; unknown input yields `unknown`/empty, never a throw).
`lib/repo.consistency.test.ts` runs it on the real repository, and the root `npm run check` runs the dashboard's
tests, so drift fails the gate. The `/spec-*` commands are updated to edit JSON and Markdown together.

- Roadmap: `## Phase …` headings, `_Goal:_`, `**Exit criteria:**`, table rows `| NNN | name | spec | status |`;
  status emoji → `not-started | drafted | approved | in-progress | done | unknown` (AC-2).
- Feature: `**Status:**` value, title, summary, `- [x] **AC-n:**` lines, open questions still containing
  `[NEEDS CLARIFICATION]`, and task checkboxes `- [ ] **Tnnn**` from `tasks.md`. Stage: Verified if status
  Implemented; else Implementing if tasks exist and any is ticked; else Tasks / Plan / Spec by which files
  exist (AC-3, AC-4).
- Memory: `## Current State` section of `MEMORY.md`; `progress.md` entries (`## YYYY-MM-DD — …`, skipping the
  fenced format example), newest 5; `decisions.md` `## D-NNN — Title (date)` blocks; `learnings.md` `## Topic`
  sections (AC-5).

§4 **Live updates.** A route handler `GET /api/events` streams Server-Sent Events. One shared `fs.watch`
(recursive) per directory (`specs/`, `memory/`) emits a debounced (300 ms) `change` event to all connected
clients; a 25 s comment keeps connections open. A client component `LiveRefresh` subscribes with `EventSource`
and calls `router.refresh()`, which re-renders server components with fresh file contents (AC-6, ≤ 3 s).

§5 **UI.** Overview (`/`): status counts, phases with goal/exit criteria and feature rows (badge, stage, AC and
task progress bars, link). Feature page (`/features/[id]`): status, stage, AC and task checklists, open
questions, tabs with rendered `spec.md` / `plan.md` / `tasks.md`. Memory page (`/memory`): current state, 5
newest progress entries, decisions, learnings. Markdown rendered with `react-markdown` + `remark-gfm` (no raw
HTML). Plain CSS with light/dark tokens matching the store's palette.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `tools/spec-dashboard/package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts` | new | App setup |
| `tools/spec-dashboard/scripts/start.mjs` | new | Install deps on first run, then `next dev -H 127.0.0.1 -p 3100` |
| `tools/spec-dashboard/lib/repo.ts` | new | Repo root, safe file reads, feature folder listing |
| `tools/spec-dashboard/lib/schema.ts` | new | Zod schemas for `roadmap.json` / `feature.json`, tolerant loader |
| `tools/spec-dashboard/lib/consistency.ts` | new | JSON ↔ Markdown consistency check |
| `tools/spec-dashboard/lib/parse/{roadmap,feature,memory,markdown}.ts` | new | Pure Markdown parsers (memory view, consistency check) |
| `specs/roadmap.json`, `specs/features/*/feature.json`, `specs/templates/feature-template.json` | new | Tracking files |
| `scripts/check.mjs`, `.claude/commands/*`, `specs/workflow.md`, `CLAUDE.md` | modify | Gate runs the check; workflow keeps JSON current |
| `tools/spec-dashboard/lib/parse/*.test.ts` | new | Vitest unit tests with fixtures |
| `tools/spec-dashboard/lib/watch.ts` | new | Shared watcher + subscriber set |
| `tools/spec-dashboard/app/{layout,page}.tsx`, `features/[id]/page.tsx`, `memory/page.tsx` | new | Pages |
| `tools/spec-dashboard/app/api/events/route.ts` | new | SSE change stream |
| `tools/spec-dashboard/components/*.tsx`, `app/globals.css` | new | UI pieces, styles |
| `tools/spec-dashboard/README.md` | new | How to run, what it reads |
| `package.json` (root) | modify | `dashboard` script |
| `.gitignore` | modify | `.next/` |
| `specs/tech-stack.md`, `specs/architecture.md`, `memory/decisions.md` | modify | Dev-tool stack, layout, D-005 |

## Data Structures & Interfaces

```ts
type RoadmapStatus = 'not-started' | 'drafted' | 'approved' | 'in-progress' | 'done' | 'unknown';
interface RoadmapFeature { id: string; name: string; status: RoadmapStatus; specLink?: string }
interface Phase { title: string; goal?: string; exitCriteria?: string; features: RoadmapFeature[] }
interface Roadmap { phases: Phase[]; backlog: string[] }

type Stage = 'spec' | 'plan' | 'tasks' | 'implementing' | 'verified';
interface Checkbox { id: string; text: string; done: boolean }
interface Feature {
  id: string; title: string; status: string; stage: Stage; summary: string;
  criteria: Checkbox[]; tasks: Checkbox[]; openQuestions: string[];
  files: { spec?: string; plan?: string; tasks?: string };
}
interface Memory { currentState: string; progress: { date: string; title: string; body: string }[];
  decisions: { id: string; title: string; date: string; body: string }[]; learnings: { topic: string; body: string }[] }
```

## Techniques

- `fs.watch(dir, { recursive: true })` works on Windows/macOS and on Linux with Node ≥ 20. Errors (e.g. a
  deleted directory) are caught and logged; the page still works with manual reload.
- SSE through a `ReadableStream` in a route handler with `runtime = 'nodejs'`; the abort signal removes the
  subscriber.
- Status emoji are matched after stripping variation selectors so `✔️` and `✔` both parse.

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1 | `npm run dashboard`, open `http://127.0.0.1:3100`; store stack stopped | manual |
| AC-2 | `lib/parse/roadmap.test.ts` (phases, rows, statuses, counts) + page check | unit + manual |
| AC-3 | `lib/parse/feature.test.ts` (stage rules, AC/task counts) | unit |
| AC-4 | `lib/parse/feature.test.ts` (open questions, checkboxes) + page check | unit + manual |
| AC-5 | `lib/parse/memory.test.ts` (current state, 5 newest, fenced example skipped) + page check | unit + manual |
| AC-6 | Edit a spec file with the page open; time until it updates | manual measurement |
| AC-7 | Malformed fixtures in each parser test (missing file, unknown status, empty input) | unit |
| AC-8 | Browse every page, then `git status` | manual |

## Risks & Mitigations

- **Next.js 16 / React 19 API drift** from what I know: keep to stable App Router basics (server components,
  route handlers, `useRouter().refresh()`); verify with `next build`.
- **File watcher quirks** (duplicate events, editors writing temp files): debounce 300 ms; refresh is idempotent.
- **TypeScript 7 at the repo root**: the app pins TypeScript 5.9 locally, which Next's type checking supports.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | Spec 004 approved 2026-10-23 |
| II. Test-gated delivery | ✅ | Parsers test-first with Vitest; the app's `check` script (typecheck + tests) runs before ticking tasks, alongside the root `npm run check` |
| III. Small dependencies | ⚠️ | Adds next, react, react-dom, react-markdown, remark-gfm (runtime) and vitest (dev) — dev-tool only, isolated from the store; justified in `tech-stack.md` + D-005 |
| IV. Memory maintained | ✅ | Decision D-005, progress entry, MEMORY.md at verify |
| V. Database per service | ✅ | Not a service; reads only repo docs, no service data stores |
