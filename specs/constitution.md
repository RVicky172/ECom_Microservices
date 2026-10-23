# mercato — E-Commerce Microservices Platform — Constitution

> The non-negotiable principles of this project. Every spec, plan, task, and line of code must comply.
> If a change needs to break a principle, amend this document first (see "Governance & Amendments").

**Version:** 1.0.0 · **Ratified:** 2026-10-23

---

## Mission

mercato is a learning-oriented e-commerce platform: TypeScript microservices (gateway, auth, product, cart, order, inventory, payment, notification, AI assistant) behind one API gateway, with a React storefront. It shows production patterns (gateway auth, database per service, Kafka saga, outbox, idempotency, LLM tool use) in code that is correct, secure and readable enough to learn from. Success: the whole stack runs from `docker compose up`, checkout completes end to end, and every pattern is documented and tested.

## Core Principles

### I. Spec Before Code

No feature code is written without an approved spec in `specs/features/NNN-name/`.
The flow is always **Specify → Plan → Tasks → Implement → Verify** (see `workflow.md`).
Bug fixes and refactors that do not change behavior may skip the spec but must still be logged in `memory/progress.md`.

### II. Test-Gated Delivery

- No task is "done" until its tests pass: `npm run check`.
- Pure logic is unit-tested, test-first: write the failing test, then the code.
- Tests wait on real signals, never fixed sleeps; anything time-dependent takes time as an input so tests are
  deterministic.

### III. Simplicity and Small Dependencies

- Prefer the platform and small in-house helpers over new libraries.
- Adding a runtime dependency requires a justification in `specs/tech-stack.md` (size, license, why not
  hand-rolled) and a `memory/decisions.md` entry.
- YAGNI: build what the current roadmap phase needs, nothing more.

### IV. Memory Is Maintained

- Agents and humans keep `memory/` current: decisions, progress, and learnings (see `memory-management.md`).
- A session that changes direction or discovers a pitfall records it before ending.

### V. Database per Service

Each service owns its data store; no other service touches it.

- Owners: auth → `auth_db`, order → `order_db`, inventory → `inventory_db`, payment → `payment_db` (PostgreSQL);
  product → `product_db` (MongoDB); cart, product cache and assistant → their own Redis key prefixes
  (`cart:`, product cache keys, `assistant:`).
- A service never opens a connection to, queries, or writes another service's database or Redis keys.
- Cross-service data moves only through (a) the owning service's HTTP API, called through the gateway or
  internally with the forwarded identity headers and `x-internal-token`, or (b) Kafka events whose topic and type
  names are defined in `packages/shared/src/events.ts`.
- Changing an event payload updates its producer, every consumer and the shared definitions in the same feature.
- New data a feature needs is added to the owning service and exposed through its API; it is not copied into
  another service's store, except as an explicit, documented read model fed by events.

## Quality Gates (Definition of Done)

A feature is **Done** when all are true:

1. Spec status is `Implemented` and every acceptance criterion is checked — each one proven by a test or a
   recorded measurement.
2. `npm run check` passes (the fast gate: typecheck, lint, unit tests — whatever the project has).
3. `npm run build` succeeds.
4. `memory/progress.md`, `memory/MEMORY.md` and `specs/roadmap.md` are updated.

5. If the feature changes a service, `docker compose up -d --build <service>` starts it and its `/health`
   check reports healthy.

## Governance & Amendments

- This constitution supersedes all other docs. Conflicts are resolved in its favor.
- Amend by editing this file in a dedicated change: bump the version (MAJOR = principle removed/redefined,
  MINOR = principle added, PATCH = wording), and record the reason in `memory/decisions.md`.
