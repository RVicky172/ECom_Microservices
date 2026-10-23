# 010 — Saga Payloads: Checkout Reaches CONFIRMED

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 1 · **Created:** 2026-10-23 · **Owner:** RVicky172

## Summary

Checkout never finishes. After inventory reserves stock, its `inventory.reserved` event carries only `orderId`.
The payment service needs the amount and items, so it tries to save a payment with no amount, fails, and sends
nothing. Every order stops at `INVENTORY_RESERVED`, with its stock reserved forever (baseline gap G3). Behind that
is a second gap (G4): the payment events carry `items: undefined`, so even a successful payment could never
finalize or release stock.

This feature makes the checkout saga complete on its own:

- a paid order reaches `CONFIRMED`, and its stock is taken for good;
- an out-of-stock order, or one whose payment fails, reaches `CANCELLED` with a reason the shopper can see, and
  any reserved stock comes back.

It is the first half of Phase 1's exit criterion: "an order placed in the UI reaches `CONFIRMED` (or `CANCELLED`
with a reason) without manual steps".

Found while drafting (2026-10-23): 5 orders are stuck at `PENDING` (4 from 2026-09-15, 1 from today) even though
inventory reserved their stock. The order service never recorded `inventory.reserved` for them, and the cause is
not yet known (Q3).

## User Stories

- **US-1:** As a shopper, I want my order to be confirmed once payment succeeds, so that I know it is going to
  ship.
- **US-2:** As a shopper whose order cannot go through, I want to see that it was cancelled and why (out of stock
  or payment declined), so that I can decide what to do next.
- **US-3:** As the store, I want stock to be taken only for confirmed orders and returned for cancelled ones, so
  that the catalog does not run out because of orders that never completed.
- **US-4:** As a maintainer, I want every saga event's payload defined once and checked by tests, so that a
  producer and its consumers cannot drift apart again (Constitution V).

## Acceptance Criteria

"Through the gateway" means placing the order as a signed-in user with `POST /api/v1/orders`. Timings are on the
local Docker stack. "Before" means stock levels read just before the order is placed.

- [x] **AC-1:** Given payments set to always succeed, when 10 orders are placed one after another through the
  gateway, then all 10 reach `CONFIRMED`, each within 10 seconds of being placed. _(manual measurement)_
- [x] **AC-2:** Given AC-1's orders, then each has exactly one payment:
  - status `COMPLETED`;
  - amount equal to the order's `total_amount`, to the cent;
  - visible to its owner through `GET /api/v1/payments/:orderId` (feature 002).

  _(manual measurement + unit)_
- [x] **AC-3:** Given a `CONFIRMED` order, then for each of its items the product's available quantity is lower
  than before by the item's quantity, and its reserved count is back to its before value. _(manual measurement)_
- [x] **AC-4:** Given payments set to always fail, when 10 orders are placed through the gateway, then:
  - all 10 reach `CANCELLED` within 10 seconds;
  - each has exactly one payment with status `FAILED` and the right amount;
  - available and reserved stock are back to their before values exactly.

  _(manual measurement)_
- [x] **AC-5:** Given an order for more units than are available, when it is placed, then it reaches `CANCELLED`
  within 10 seconds, no payment is created, and stock is unchanged. _(manual measurement)_
- [x] **AC-6:** Given a `CANCELLED` order, its owner can see why it was cancelled:
  - "out of stock" or "payment declined", in both `GET /api/v1/orders/:id` and the order list;
  - on the Orders page in the storefront.

  `CONFIRMED` orders show no reason (Q1). _(unit + manual)_
- [x] **AC-7:** Given any saga event (`inventory.reserved`, `payment.completed`, `payment.failed`) is delivered
  twice, then none of these happen:
  - a second payment is created;
  - stock is finalized or released twice;
  - an order's final status changes.

  _(unit + manual measurement: replay one of each)_
- [x] **AC-8:** Given the order service happens to process `payment.completed` (or `payment.failed`) before
  `inventory.reserved` for the same order, then the order still ends `CONFIRMED` (or `CANCELLED`), not stuck
  (Q2). _(unit)_
- [x] **AC-9:** Every saga event's payload is defined once in `packages/shared` (alongside the topic names), and
  every producer and consumer of `order.created`, `inventory.reserved`, `inventory.rejected`,
  `payment.completed` and `payment.failed` uses that definition. Unit tests check that each producer emits a
  payload its consumers accept. _(unit)_
- [x] **AC-10:** The notification service logs exactly one payment-success or payment-failure notification per
  order, naming the order (and the reason on failure). _(manual measurement)_
- [x] **AC-11:** The saga logic (building events, handling them, stock and status changes) is unit-tested without
  Kafka or a database. Each new test is seen failing once by breaking the code it covers, recorded in tasks.md.
  _(unit + manual measurement)_
- [x] **AC-12:** One order placed in the storefront UI shows `CONFIRMED` on the Orders page within 10 seconds of
  placing it, after a reload if needed (Phase 1 exit criterion). _(manual)_
- [x] **AC-13:** The fix reaches the running stack, and the docs say so:
  - every changed service is rebuilt and `/health` reports healthy;
  - G3 and G4 are marked closed in `000-baseline/baseline.md`;
  - the event contract in `specs/architecture.md` matches the new payloads;
  - the affected service READMEs are updated.

  _(manual review)_

## Non-Functional Requirements

- Data ownership (Constitution V): each service keeps its own data. Inventory writes only stock, payment only
  payments, order only orders. Data travels only in events defined in `packages/shared`. Changing an event updates
  its producer, every consumer and the shared definition together.
- Determinism (Constitution II): whether a payment succeeds is still decided at random, but the chance is
  configurable. Tests set it, never rely on it.
- Reliability: a duplicate event changes nothing (AC-7). An event the service cannot process is logged with its
  order ID and does not stop the consumer.
- Compatibility: order and payment API responses keep their current fields. The cancel reason is an added field.

## Out of Scope

- Server-side prices (G7, G8): the payment amount is the order's stored total, still computed from client prices.
- Shipping: `order.shipped` and its notification (G9); the unused `ORDER_CONFIRMED` and `ORDER_CANCELLED` event
  types (Q6).
- Durable idempotency for the notification consumer (G10). AC-10 is measured on a stack that is not restarted
  mid-test.
- A real payment provider, refunds, retries of declined payments.
- Repairing the orders already stuck in the dev database (Q4).
- CI (backlog).

## Open Questions

- **Q1** **Resolved 2026-10-23 (accepted as proposed).** Should the cancel reason be stored and shown to the shopper (AC-6)? Today the order
  has no reason field and the UI shows only the status. _Proposed:_ yes. Add a reason to the order, return it from
  the order API, and show it next to the status on the Orders page. The exit criterion asks for "CANCELLED with a
  reason".
- **Q2** **Resolved 2026-10-23 (accepted as proposed).** Is the arrival-order case (AC-8) in scope? The order service listens to
  `inventory.reserved` and the payment events on different topics, so their order is not guaranteed. A fast
  payment could arrive first, and the order would then refuse `PENDING → CONFIRMED` and stay stuck. _Proposed:_
  yes. It would make AC-1's "10 of 10" flaky.
- **Q3** **Resolved 2026-10-23 (accepted as proposed).** 5 orders are stuck at `PENDING` although inventory reserved their stock (see
  Summary). Should 010 find out why the order service missed those events, and fix it? _Proposed:_ yes, start with
  a short investigation (spike). If the cause is in how the saga consumers start or read events, fix it here,
  since it breaks "without manual steps". If it is unrelated (e.g. a one-off from an old stack), record it and
  move on.
- **Q4** **Resolved 2026-10-23 (accepted as proposed).** What about the dev data already stuck? Today that is 8 orders (5 `PENDING`, 3
  `INVENTORY_RESERVED`) holding 22 reserved units. _Proposed:_ no code for it. Document a one-off reset for local
  dev (reseed, or a short SQL script per database run by hand) in the tasks, and leave old orders as they are.
- **Q5** **Resolved 2026-10-23 (accepted as proposed).** How should tests and measurements control payment success? _Proposed:_ keep
  `PAYMENT_SUCCESS_RATE` (default 0.85). Set it to 1 for AC-1–AC-3 and to 0 for AC-4, then restore it. Unit tests
  inject the random draw, so they never depend on chance.
- **Q6** **Resolved 2026-10-23 (accepted as proposed).** Should 010 also emit the unused `ORDER_CONFIRMED` and `ORDER_CANCELLED` events?
  _Proposed:_ no. Nothing consumes them; leave them for a later feature (with shipping, G9).
- **Q7** **Resolved 2026-10-23 (accepted as proposed).** Are 10 seconds and 10 orders per path the right bar for AC-1, AC-4 and AC-5?
  _Proposed:_ yes. Measured today, an order reaches `INVENTORY_RESERVED` in about 1 second.

## Changelog

- 2026-10-23 — Created.
- 2026-10-23 — Q1–Q7 accepted as proposed by RVicky172; status → Approved (D-013).
- 2026-10-23 — Plan approved (D-014), tasks written; status → In Progress.
- 2026-10-23 — Verify run: 11 of 13 ACs proven; AC-6 (storefront part) and AC-12 wait on the storefront check
  (T034). Status stays In Progress.
- 2026-10-23 — T034 done with RVicky172 in the storefront; all 13 ACs proven; status → Implemented.
