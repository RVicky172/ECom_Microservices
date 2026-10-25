# 005 — Dependency Upgrades, Dependabot, JSDoc and Clean-Code Rules

**Status:** In Progress <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 0 · **Created:** 2026-10-24 · **Owner:** RVicky172

## Summary

Most npm packages in the repo are one or more major versions behind (measured with `npm outdated` on 2026-10-24,
table below). Express is on 4 while the gateway's types were on 5, and that mismatch only surfaced when shared
started shipping type declarations (D-029). Nothing tells us when a package falls behind or gets a security fix.
Most source files also have no doc comment: 87 of 124 non-test source files have no header, and 151 of 317
exported declarations have no JSDoc. And there is no written rule for how code should be structured.

This feature does four things:

- **Upgrades** every package to its latest stable version, with the behaviour of the store unchanged.
- **Sets up Dependabot** so GitHub opens pull requests for new versions and security fixes.
- **Adds JSDoc** to every source file and exported declaration, enforced by `npm run check`.
- **Writes coding standards:** clean-code rules and the design patterns this codebase uses, with examples, and
  links them from the constitution and `CLAUDE.md`.

The records (`tech-stack.md`, `decisions.md`, `learnings.md`, roadmap) are updated to match.

### Outdated packages (npm outdated, 2026-10-24)

| Package | Current → latest | Used by |
| --- | --- | --- |
| express / @types/express | 4.22.3 / 4.17.25 → 5.3.0 / 5.0.6 | gateway, shared, 8 services |
| express-rate-limit | 7.5.1 → 8.7.1 | gateway |
| http-proxy-middleware | 3.0.7 → 4.2.0 | gateway |
| opossum | 8.5.0 → 10.0.0 | gateway |
| ioredis | 5.11.1 → 6.0.0 | assistant, cart, product |
| joi | 17.13.8 → 18.3.0 | shared, 6 services |
| mongoose | 8.24.4 → 9.11.4 (product); 9.10.1 → 9.11.4 (order) | product, order |
| pino | 9.14.0 → 10.4.0 | shared |
| uuid | 9.0.1 → 14.0.3 (ESM-only since v12; the repo is CommonJS) | shared, order, payment |
| bcryptjs | 2.4.3 → 3.0.3 | auth, order |
| pg | 8.23.0 → 8.23.1 | auth, inventory, order, payment |
| @anthropic-ai/sdk | 1.1.0 → 1.3.0 | assistant |
| react / react-dom / @types/react(-dom) | 18.3.x → 19.3.x | frontend |
| react-router-dom → react-router | 6.30.6 → `react-router` 8.5.0 (`react-router-dom` ends at 7; v8 is one package; P3) | frontend |
| vite / @vitejs/plugin-react | 5.4.21 / 4.7.0 → 8.3.5 / 6.1.2 | frontend |
| typescript | 5.9.3 → 7.0.2 (root and shared already 7) | 10 packages |
| @types/node | 20.19.43 → 26.6.5 (the runtime is Node 26) | 10 packages |
| @types/ioredis, @types/uuid | deprecated stubs (the packages ship their own types) | cart, product, order, payment |

## User Stories

- **US-1:** As a maintainer, I want every package on its latest stable version, so that I get bug and security
  fixes and don't face one huge upgrade later.
- **US-2:** As a maintainer, I want GitHub to tell me when a package has a new version or a security fix, so that
  the repo doesn't fall behind again.
- **US-3:** As a shopper, I want the store to work exactly as before after the upgrade (sign in, browse, cart,
  checkout, assistant), so that maintenance doesn't break my shopping.
- **US-4:** As a reader of the code (this is a learning project), I want every file and exported function to say
  what it does and why, so that I can find my way without reading every line.
- **US-5:** As a contributor (human or AI agent), I want written coding rules and named design patterns with
  examples from this repo, so that new code is consistent and reviews have a shared reference.

## Acceptance Criteria

### Upgrades

- [ ] **AC-1:** After the upgrade, `npm outdated` across the root, every workspace and `tools/spec-dashboard`
  reports no package behind its latest stable version. The only exceptions are the ones listed in this spec with a
  reason, agreed under Q3. _(manual measurement: the command output recorded in tasks.md)_
- [ ] **AC-2:** The deprecated stub packages `@types/ioredis` and `@types/uuid` are removed, and no library that a
  `package.json` in this repo declares (nor its `@types` package) is installed in two majors (for example
  `@types/express` 4 and 5). A transitive package held on an older major by an upstream package's own range is
  out of scope: it is listed in tasks.md, not forced with `overrides`. _(manual measurement: `npm ls`)_
- [ ] **AC-3:** `npm run check` and `npm run build` pass, and the unit-test count is at least the count before the
  upgrade (237 on the 005 branch base, 2026-10-25; 012's tests are not on `main` yet, Q2). Every test changed because of an upgrade's API is listed in tasks.md with the
  reason. _(unit + manual measurement)_
- [ ] **AC-4:** Every service image rebuilds from clean, and all 10 `/health` checks report healthy.
  _(manual measurement)_
- [ ] **AC-5:** The store behaves as before, checked end to end on the rebuilt stack:
  - a user registered **before** the upgrade can still sign in (password hashes stay valid);
  - a new user can register and sign in;
  - products list and search work;
  - add to cart, change the quantity and remove work;
  - an order reaches `CONFIRMED`, or `CANCELLED` with a reason;
  - an assistant chat turn streams through the gateway (ratings are 012's and are checked by 012 T031 on the
    upgraded stack; P5).

  _(manual measurement, recorded in tasks.md)_
- [ ] **AC-6:** The gateway's protections behave as before:
  - a protected route without a JWT returns 401;
  - the 101st request within 15 minutes from one IP returns 429;
  - with a service stopped, its route returns 502 within the configured timeout, and works again once the
    service is back. (The gateway has no circuit breaker: `opossum` was installed but never used. It is removed,
    and a breaker goes to the backlog; P1.)

  _(manual measurement)_
- [ ] **AC-7:** The storefront builds with the new React, router and Vite. Each of its 6 pages loads in a browser
  with no errors in the console. _(manual measurement)_

### Dependabot

- [ ] **AC-8:** `.github/dependabot.yml` is committed and covers:
  - npm for the root workspace (all `packages/*`) and for `tools/spec-dashboard`;
  - Docker for every Dockerfile's base image;
  - a weekly schedule, with minor and patch updates grouped per ecosystem and each major as its own PR (Q5).

  After it is pushed, GitHub's Dependabot tab for the repository shows the configuration with no errors.
  _(manual measurement)_
- [ ] **AC-9:** The repository docs say how to review a Dependabot pull request without CI (Q6): check it out,
  `npm ci`, `npm run check`, `npm run build`, rebuild the affected images and check `/health`, and add a
  `decisions.md` entry for a major version. _(manual review)_

### Documentation and coding rules

- [ ] **AC-10:** Every non-test `.ts` / `.tsx` file under `packages/*/src` starts with a doc comment saying what
  the file is for, and every exported function, class, constant, interface, type and enum has a JSDoc block.
  Measured today: 87 of 124 files have no header and 151 of 317 exports are undocumented; after this feature, both
  are 0. _(manual measurement with the checker in AC-11)_
- [ ] **AC-11:** `npm run check` fails when a source file or an exported declaration has no doc comment, naming
  the file and line. The checker is unit-tested: it is seen failing on a file without a header and on an
  undocumented export, and passing on a documented one. _(unit)_
- [ ] **AC-12:** A coding-standards document exists. For each design pattern the repo uses, and each clean-code
  rule, it gives at least one example taken from this repository. The constitution references it, with a version
  bump recorded in `decisions.md`; so do `CLAUDE.md` and the spec workflow. _(manual review)_

### Records

- [ ] **AC-13:** The records match the new state:
  - `specs/tech-stack.md` lists the new major versions;
  - `memory/decisions.md` has one entry per major upgrade, with the breaking changes that applied here and how
    they were handled, and marks D-029 superseded;
  - `memory/learnings.md` records any upgrade gotcha that cost more than 10 minutes;
  - the roadmap backlog is updated.

  _(manual review)_

## Non-Functional Requirements

- **No behaviour change:** API routes, status codes, response bodies, Kafka event payloads and the storefront's
  look stay the same. Upgrades that would change one of these need the user's agreement first.
- **Security:** after the upgrade, `npm audit` reports no high or critical advisory. Any that remain are listed
  with a reason.
- **Small dependencies (Constitution III):** no new runtime dependency. Where a platform API replaces a library
  (for example `crypto.randomUUID` for `uuid`), the platform is preferred (Q4).
- **Reviewable:** the upgrade lands in steps (Q7), each passing `npm run check`, so a break can be traced to one
  step.

## Out of Scope

- Changing features, APIs or the UI design.
- CI (GitHub Actions): it stays in the backlog (D-012). Dependabot PRs are checked locally until CI exists (AC-9).
- ESLint or Prettier (Q8): only the JSDoc check is added now.
- Refactoring existing code to the documented patterns. The standards apply to new and changed code; existing code
  is brought in line when a feature touches it.
- Infrastructure images in `docker-compose.yml` (Postgres, MongoDB, Redis, Kafka) unless agreed under Q5.
- Node itself (already 26, D-009).

## Open Questions

Number them so answers can be referenced (Q1, Q2…). Each with a proposed default answer.

- **Q1** **Resolved 2026-10-25 (accepted as proposed).** Number and phase. This is foundation work, not checkout or assistant work.
  _Proposed:_ 005 in Phase 0 (003 stays reserved for CI). Phase 0 keeps its exit criteria; its status line notes
  the late addition.
- **Q2** **Resolved 2026-10-25 (variant chosen by RVicky172).** When, relative to 012? _Decision:_ pause 012 now
  (its progress is committed on `feat/012-assistant-evals-feedback`) and do 005 first, on its own branch
  `feat/005-dependency-upgrades-code-standards` from `main` after 011 was merged (PR #1). The D-029 chore
  (shared type declarations) was carried over from 012's branch, since the upgrade builds on it. 012 resumes
  after 005, rebased on the upgraded `main`; its eval runs (T034) measure the upgraded stack.
- **Q3** **Resolved 2026-10-25 (accepted as proposed).** "Latest stable" for every major, with no exceptions? _Proposed:_ yes, all majors
  in the table, including Express 5, React 19, react-router 8 (P3), Vite 8 and TypeScript 7. The only allowed exception
  is a package whose latest version doesn't support Node 26 or CommonJS and has no replacement. Each exception is
  listed in this spec with its reason, and needs the user's agreement.
- **Q4** **Resolved 2026-10-25 (accepted as proposed).** `uuid` 14 is ESM-only and the repo is CommonJS. _Proposed:_ replace `uuid` with
  Node's built-in `crypto.randomUUID()` in shared, order and payment, and drop the dependency (Constitution III).
  _Alternative:_ keep `uuid` 14 and rely on Node 26's `require(esm)`.
- **Q5** **Resolved 2026-10-25 (accepted as proposed).** Dependabot settings. _Proposed:_
  - weekly, Monday 09:00 `Asia/Kolkata` (changed from Europe/Berlin by P4, 2026-10-25);
  - npm for the root (it covers the workspaces) and for `tools/spec-dashboard`, plus Docker for each service's
    Dockerfile;
  - minor and patch updates grouped into one PR per ecosystem, and each major as its own PR;
  - at most 5 open PRs;
  - target branch `main`, with the label `dependencies`;
  - security updates switched on in the repository settings (done by the user, since it is a GitHub setting).
  - **Not yet:** `docker-compose.yml` infrastructure images and GitHub Actions (no workflows exist).
- **Q6** **Resolved 2026-10-25 (accepted as proposed).** Where does the "review a Dependabot PR" checklist live? _Proposed:_ a short section
  in `specs/workflow.md`, linked from `README.md`.
- **Q7** **Resolved 2026-10-25 (accepted as proposed).** Upgrade in one go or in steps? _Proposed:_ five steps, each green before the next:
  1. tooling and types (TypeScript 7, @types/node 26, remove the stubs);
  2. backend libraries (joi, pino, ioredis, mongoose, pg, bcryptjs, uuid, @anthropic-ai/sdk);
  3. Express 5 with the gateway middleware (express-rate-limit, http-proxy-middleware, opossum);
  4. frontend (React 19, react-router 7, Vite 8);
  5. `tools/spec-dashboard`.
- **Q8** **Resolved 2026-10-25 (accepted as proposed).** Add ESLint or Prettier to enforce style? _Proposed:_ no, not in 005: they bring
  new tooling and a large reformatting diff. The JSDoc rule is enforced by a small in-house check in
  `npm run check` (AC-11). ESLint goes to the backlog.
- **Q9** **Resolved 2026-10-25 (accepted as proposed).** Where do the coding rules live, and which patterns? _Proposed:_
  - **Where:** a new `specs/coding-standards.md`, referenced from the constitution (version 1.0.0 → 1.1.0, a
    MINOR amendment), `CLAUDE.md` and `specs/workflow.md`.
  - **Patterns already in the repo:** layered controller → service → data access; adapter and strategy (assistant
    providers); observer (`TurnObserver`); factory functions (tools, Kafka clients); saga and outbox
    (checkout); dependency injection through parameters (clock, `sleep`, `createKafka`) for testable cores.
  - **Clean-code rules:** pure cores with thin I/O shells; small single-purpose functions; names that say intent;
    no `any` in new code; typed errors through the shared `AppError`s; no magic numbers (named constants);
    comments that say why, not what; and the JSDoc rule from AC-10.
- **Q10** **Resolved 2026-10-25 (accepted as proposed).** Is `tools/spec-dashboard` (Next.js 16) included? _Proposed:_ yes, in step 5 and in
  Dependabot.

## Changelog

- 2026-10-24 — Created from the user's request (upgrades, Dependabot, JSDoc, coding rules).
- 2026-10-25 — Approved: Q1, Q3–Q10 as proposed; Q2 = pause 012 and do 005 first from `main` (D-030). AC-3's
  test baseline is now 237 (this branch).
- 2026-10-25 — Plan points P1–P5 accepted as recommended (D-031): AC-6 drops the circuit breaker (none exists;
  `opossum`, `express-rate-limit` and other unused dependencies removed; breaker to the backlog); react-router 8
  replaces react-router-dom 7; services' `dev` runs on `tsx` (ts-node cannot run on TS 7); Dependabot on
  Asia/Kolkata; AC-5 checks the assistant turn only (ratings stay with 012).
- 2026-10-25 — AC-2 narrowed (user's call at T062): it covers the libraries our `package.json`s declare and their
  `@types`. Transitive duplicates pinned by upstream ranges (`mime-types` 2/3, `picomatch` 2/4) are recorded in
  tasks.md, not overridden.
