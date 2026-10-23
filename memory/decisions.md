# Decision Log

Append-only. Newest at the bottom. To reverse a decision, add a new entry that says `Supersedes D-00X`.

Format:

```
## D-00X — Title (YYYY-MM-DD)
**Context:** … **Decision:** … **Alternatives:** … **Consequences:** …
```

---

## D-001 — Adopt spec-driven development (2026-10-23)

**Context:** Work is done across many sessions, by people and AI agents that don't remember earlier sessions.
**Decision:** Every feature goes Specify → Plan → Tasks → Implement → Verify (`specs/workflow.md`), gated by the
Definition of Done in `specs/constitution.md`; durable project memory lives in the committed `memory/` folder.
**Alternatives:** ad-hoc issues/PR descriptions only; an external tracker.
**Consequences:** Specs and memory are part of every feature's diff; `/spec-*` commands drive the stages.

## D-002 — Internal service token, opt-in (2026-10-23)

**Context:** Services trust `x-user-id` and their ports are published, so anyone reaching a port could impersonate a user.
**Decision:** `requireInternalToken` (shared) rejects requests without `x-internal-token` when `INTERNAL_SERVICE_TOKEN`
is set; the gateway and assistant send it. The gateway also strips client-sent `x-user-*` headers.
**Alternatives:** remove host port mappings; mTLS between services.
**Consequences:** Unset = old behaviour for simple local dev. Changing the token requires rebuilding every service.

## D-003 — Assistant model providers (2026-10-23)

**Context:** No Anthropic API credits for now; a local LM Studio model should work for development.
**Decision:** `ASSISTANT_PROVIDER` = `anthropic` (Claude via the SDK tool runner) | `openai-compatible` (LM Studio,
Ollama, vLLM via Chat Completions). Tools are written once against a neutral contract (`agent/toolTypes.ts`);
stored conversations are tagged with their provider.
**Alternatives:** Claude only; LM Studio only.
**Consequences:** Two code paths to keep in sync; switching provider starts conversations fresh.

## D-004 — Fast gate is a repo-wide typecheck (2026-10-23)

**Context:** No tests or linter exist; `tsc` per package was the only check.
**Decision:** `npm run check` runs `scripts/check.mjs`, which typechecks all packages in parallel. Later gates
(Vitest in 001, lint) are added to that script so it stays the single command.
**Alternatives:** per-package `typecheck` scripts run via `--workspaces`.
**Consequences:** One place to extend the gate; `npm run build` builds every package that has a build script.

## D-005 — Tracking state in JSON next to the specs (2026-10-23)

**Context:** The spec dashboard (004) first parsed status, checkboxes and tables out of Markdown; RVicky172 asked
for machine-readable tracking files instead.
**Decision:** `specs/roadmap.json` (phases, features, statuses, backlog) and `specs/features/NNN-name/feature.json`
(status, stage, acceptance criteria, tasks, open questions) hold the tracking state; Markdown keeps the prose and
its own checkboxes. A consistency test, run by the root `npm run check`, fails when they disagree. The dashboard
(`tools/spec-dashboard`, Next.js) reads only the JSON for tracking and renders the Markdown documents.
**Alternatives:** dashboard parses Markdown (first version); JSON only, dropping Markdown checkboxes.
**Consequences:** `/spec-*` commands update both JSON and Markdown in the same step; drift is caught by the gate.
The dashboard adds next, react, react-markdown, remark-gfm, zod and vitest to its own isolated package.
