# 002 — Ownership Checks on Orders and Payments · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred. Keep `feature.json` in step (same ids, same done state).

## Setup

- [x] **T001** — Baseline before any change, through the gateway: register users A and B (`Origin:
      http://localhost:3000`), A places an order, then record what B gets today for `GET /api/v1/orders/<A's id>`
      (expect 200, the G1 leak) and what anyone gets for `GET /api/v1/orders/abc` (expect 500). Keep the tokens
      and order ID for T030 · files: none · test: recorded curl output (the "before" evidence)
      **Result (2026-10-23):** probe script (scratchpad `002/probe.mjs`) registered A `16be8435…` and B `9acba204…`; A
      placed order `4eb595bd…`. Before: B → A's order **200** with A's `user_id` (G1 reproduced); `/orders/abc` →
      **500**; unknown UUID → 404; no token → 401 (gateway). Payments: all 404 (no payment rows exist, G3).

## Tests First

- [x] **T010** — Failing tests for `requireUserId` (header present → ID; missing or blank → `UnauthorizedError`
      401) and `isUuid` (canonical UUID true; `abc`, empty, a UUID with extra characters, and an upper-case UUID
      per the chosen rule) · files: `packages/shared/src/identity.test.ts` · test: fails first (module missing)
      **Result (2026-10-23):** 15 tests; failed first (`Cannot find module './identity'`). Upper-case UUIDs accepted
      (PostgreSQL accepts them); repeated `x-user-id` header (array) → 401.
- [x] **T011** [P] — Failing tests for `getOrderForUser` with `../models/orderModel` mocked: owner → order with
      `items`; non-owner → `NotFoundError` with the same message as a missing order; missing → `NotFoundError`;
      `abc` → `NotFoundError` with no DB call · files: `packages/order-service/src/services/orderService.test.ts`
      · test: fails first (`getOrderForUser` missing). Decide on the knex fake vs model functions here (plan Risks)
      **Result (2026-10-23):** 4 tests, all failed first. Knex fake is ~10 lines (`where` → `first()` + thenable), kept;
      no model-function refactor needed. Also asserts a non-owner never triggers the `order_items` query.
- [x] **T012** [P] — Failing tests for the order controller: `getOrderById` and `getOrders` without `x-user-id` →
      `next(UnauthorizedError)` and the service is not called; with it → the caller's ID is passed to the service
      · files: `packages/order-service/src/controllers/orderController.test.ts` · test: fails first
      **Result (2026-10-23):** 4 tests; 3 failed first (the list-with-header case already passed, as expected).
- [x] **T013** [P] — Failing tests for `isOrderOwnedBy` with `fetch` stubbed: URL is
      `{ORDER_SERVICE_URL}/api/v1/orders/<id>`; forwards `x-user-id`, `x-correlation-id` and `x-internal-token`
      (when set); 200 → true; 404 → false; 500 and a rejected fetch → `AppError` 502 · files:
      `packages/payment-service/src/clients/orderClient.test.ts` · test: fails first (module missing)
      **Result (2026-10-23):** 7 tests; failed first (module missing). 500, 401 and a rejected fetch → 502.
- [x] **T014** [P] — Failing tests for `getPaymentForUser` with `../models/paymentModel` and
      `../clients/orderClient` mocked: owner with a payment → payment; owner without one → `NotFoundError`;
      non-owner with or without a payment → the same `NotFoundError` and the payments table is never queried;
      `abc` → `NotFoundError` with no order call · files:
      `packages/payment-service/src/services/paymentService.test.ts` · test: fails first
      **Result (2026-10-23):** 6 tests; failed first. Non-owner cases assert the payments table is never queried.
- [x] **T015** [P] — Failing tests for the payment controller: no `x-user-id` → `next(UnauthorizedError)` and the
      service is not called; with it → user ID and correlation ID are passed through · files:
      `packages/payment-service/src/controllers/paymentController.test.ts` · test: fails first
      **Result (2026-10-23):** 2 tests; both failed first.

## Core

- [x] **T020** — Implement `requireUserId` and `isUuid` and export them from shared; rebuild shared's `dist` ·
      files: `packages/shared/src/identity.ts`, `packages/shared/src/index.ts` · test: T010 passes
      **Result (2026-10-23):** 15/15; shared `dist` rebuilt and exports both helpers. Gotcha: the first test drafts used
      top-level `await import()` after `vi.mock`; Vitest ran them but `tsc` rejects top-level await in these CommonJS
      packages (TS1309). Switched to static imports + `vi.hoisted` for fake state (learnings).
- [x] **T021** — Implement `getOrderForUser` and the controller guards in the order service · files:
      `packages/order-service/src/services/orderService.ts`, `packages/order-service/src/controllers/orderController.ts`
      · test: T011 and T012 pass; delete the `user_id !== userId` line → T011's non-owner test fails; restore
      (AC-8)
      **Result (2026-10-23):** 8/8. Seen failing: owner comparison removed → 2 non-owner tests fail; `requireUserId`
      replaced by `String(req.headers['x-user-id'])` → the 401 test fails; `isUuid` guard removed → malformed test
      fails. All restored. `getOrderById` kept for internal callers only.
- [x] **T022** — Implement `isOrderOwnedBy`, `getPaymentForUser` and the payment controller change · files:
      `packages/payment-service/src/clients/orderClient.ts`, `packages/payment-service/src/services/paymentService.ts`,
      `packages/payment-service/src/controllers/paymentController.ts` · test: T013–T015 pass; skip the
      `isOrderOwnedBy` call → T014's non-owner tests fail; restore (AC-8)
      **Result (2026-10-23):** 15/15. Seen failing: ownership call skipped → 4 fail (both non-owner cases, owner call
      args, outage pass-through); 404 mapped to `true` → client test fails; `isUuid` guard removed → malformed test
      fails. Restored. Old `getPayment(orderId)` replaced (no other callers). Suite 10 files, 77 tests.
- [x] **T023** [P] — Update the assistant comments: the order service now enforces ownership, and `getOwnOrder` is
      a second layer · files: `packages/assistant-service/src/clients/storeClients.ts` · test: `npm run check`
      passes; no behaviour change (`git diff` shows comments only)
      **Result (2026-10-23):** two comments updated; diff is comment-only; `npm run check` 13/13.

## Integration

- [x] **T030** — Rebuild every service image (`docker compose up -d --build --wait`), check every `/health` (and
      `GET /` on :3000), then repeat T001 with the same users. Record:
      - A → own order 200 with `items`;
      - B → A's order 404;
      - unknown UUID 404, with the same status, body (minus `correlationId`) and `content-type` as B's;
      - `abc` → 404 on both endpoints;
      - no token → 401 from the gateway.

      · test: recorded output (AC-1, AC-2, AC-6, AC-9)
      **Result (2026-10-23):** `docker compose up -d --build --wait` exit 0; `/health` 200 on :4000–4008 and `GET /` 200
      on :3000 (the gateway answered ~10 s after `--wait` returned: it has no health check and fetches `tsx` with `npx`
      at start; pre-existing, learnings). Same users as T001: A → own order 200 (1 item, now `INVENTORY_RESERVED`);
      B → A's order **404** "Order not found" (was 200); unknown UUID 404, same body; `abc` → **404** (was 500) on both
      endpoints; no token → 401. Full header comparison B-on-A's-order vs unknown order: identical for orders and
      payments (6 headers; date, ETag, correlation ID and rate-limit counters excluded as per-request).
- [x] **T031** — Payment through the gateway:
      - Insert one test row into `payment_db.payments` for A's order (`docker compose exec postgres psql`).
      - Record: A → 200 with the row; B → 404; A for an order without a payment → 404, with B's body identical to
        that one (minus `correlationId`).
      - Delete the row and confirm it is gone.

      · test: recorded output (AC-3, AC-4)
      **Result (2026-10-23):** inserted fixture `bdf601ea…` (`idempotency_key = test-002-fixture`) for A's order 1. A →
      200 with that payment (25.00, COMPLETED); B → 404 "Payment not found"; A's order 2 (no payment) → 404 with an
      identical body (compared minus `correlationId`: true). Fixture deleted; 0 rows left (payments table empty).
      Same correlation IDs appear in payment and order logs, so the ownership call forwards them.
- [x] **T032** — No regressions:
      - as A, `GET /api/v1/orders` lists A's orders and `POST /api/v1/orders` returns 201;
      - order and payment logs show no new errors after the order;
      - assistant: ask about A's order as A (status answered) and as B (not found). Without a model, call the
        assistant's order lookup directly and say so (D-011).

      · test: recorded output (AC-7)
      **Result (2026-10-23):** A `POST /orders` → 201 (order 2 → `INVENTORY_RESERVED` through the saga, then the known
      G3 payment insert failure, unchanged); A's list 200 with 2 orders, all A's; B's list 200 with 0. Logs since
      rebuild: no unexpected errors besides that G3 line (the 404s logged at error level are the probes; pre-existing
      logging). Assistant on LM Studio `qwen/qwen3-30b-a3b-2507` (real model, no fallback): as A → "Your order
      4EB595BD is currently INVENTORY_RESERVED…"; as B → "I couldn't find an order with that ID…".

## Verify

- [x] **T090** — Docs (AC-10):
      - baseline G1 and G2 → "closed by 002 (2026-10-23)";
      - replace the `memory/learnings.md` "browser callers stay exposed" entry;
      - order and payment READMEs describe the rule;
      - `specs/architecture.md` Conventions: `requireUserId`, 404 for non-owners, payment → order ownership call;
      - `specs/testing-strategy.md`: the controller/service test pattern.

      · test: review; no "does not check ownership" wording left
      **Result (2026-10-23):** baseline G1/G2 rows and route rows marked "closed by 002" (originals kept);
      learnings entry replaced; order and payment READMEs describe the rule; `architecture.md` Identity convention
      plus a new "Ownership across services" one; `testing-strategy.md` gets service, controller, HTTP-client and
      ownership test patterns. Also fixed two docs that still said the services don't check (assistant README,
      `docs/ai-shopping-assistant.md`). Search for the old wording: only the internal `getOrderById` note remains.
- [x] **T091** — Every Definition-of-Done gate green (`specs/constitution.md`): `npm run check`, `npm run build`,
      every service `/health`; record the numbers
      **Result (2026-10-23):** `npm run check` 13/13; `npm run build` exit 0, no `*.test.*` in any `dist`; `/health` 200
      on :4000–4008, `GET /` 200 on :3000; `npx vitest run` 3× → 77/77 each (no flakes); live re-check: B → A's order
      404, `abc` 404, A → own order 200.
- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), update `roadmap.md`/`roadmap.json` (Phase 0 exit
      criterion "a user cannot read another user's order or payment" now met), `memory/progress.md`,
      `memory/MEMORY.md`
      **Result (2026-10-23):** AC-1–AC-10 ticked; spec Implemented; roadmap ✔️ (Phase 0 security exit criterion met;
      4 of 5 done, 003 CI left); progress and memory updated.

## AC coverage

| AC    | Tasks                         |
| ----- | ----------------------------- |
| AC-1  | T011, T021, T030              |
| AC-2  | T001, T011, T021, T030        |
| AC-3  | T013, T014, T022, T031        |
| AC-4  | T013, T014, T022, T031        |
| AC-5  | T010, T012, T015, T020–T022   |
| AC-6  | T001, T010, T011, T014, T030  |
| AC-7  | T023, T032                    |
| AC-8  | T021, T022                    |
| AC-9  | T030                          |
| AC-10 | T090                          |
