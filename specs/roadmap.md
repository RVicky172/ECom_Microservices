# mercato — E-Commerce Microservices Platform — Roadmap

> Phased plan. Each phase is a set of feature specs. Update statuses as work moves.
> Status legend: ⬜ Not started · 📝 Spec drafted · ✅ Spec approved · 🚧 In progress · ✔️ Done
> Machine-readable copy: `roadmap.json` — keep both in sync (`npm run check` verifies). Live view: `npm run dashboard`.

**Last updated:** 2026-10-23

---

## Phase 0 — Foundation

_Goal:_ what exists is recorded, the repo has a real test harness and CI, and known security gaps are closed.

| #   | Feature                                                                                                       | Spec | Status |
| --- | ------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| 000 | Baseline: record current services, routes, events and known gaps as the starting point | — | ⬜ |
| 001 | Test harness: Vitest across packages, wired into `npm test` and `npm run check`, first unit tests | — | ⬜ |
| 002 | Ownership checks on `GET /orders/:id` and `GET /payments/:orderId` (users see only their own data) | — | ⬜ |
| 003 | CI: GitHub Actions running check, test and build on every push and pull request | — | ⬜ |
| 004 | Spec dashboard: local Next.js app showing roadmap, feature progress and memory, live | [spec](features/004-spec-dashboard/spec.md) | 🚧 |

**Exit criteria:** on a clean clone, `npm ci && npm run check && npm test && npm run build` pass, the same runs
green in CI, and a user cannot read another user's order or payment.

## Phase 1 — Checkout & Assistant

_Goal:_ checkout completes end to end through the saga, and the AI assistant reaches its planned feature set.

| #   | Feature | Spec | Status |
| --- | ------- | ---- | ------ |
| 010 | Saga payloads: align `inventory.reserved` with the payment consumer so checkout reaches `CONFIRMED` | — | ⬜ |
| 011 | Assistant: store policies in the prompt and human handoff via Kafka (design doc Phase 3) | — | ⬜ |
| 012 | Assistant: eval suite, answer feedback and usage analytics (design doc Phase 4) | — | ⬜ |

**Exit criteria:** an order placed in the UI reaches `CONFIRMED` (or `CANCELLED` with a reason) without manual
steps, and the assistant eval suite passes its agreed target on the configured model.

## Backlog (unscheduled ideas)

- Protect product write routes (admin role check at the gateway or in product-service).
- Shared rate limiting (the gateway limiter is per process, in memory).
- Assistant: `assistant.interaction` analytics events; compaction for long conversations.
- Update the HLD/LLD `.docx` guide with the assistant service, then regenerate `doc_extract.txt`.
- Server-side price lookup when adding to cart (the cart currently trusts the client's price).
