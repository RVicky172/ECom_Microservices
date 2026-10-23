# 002 — Ownership Checks on Orders and Payments

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 0 · **Created:** 2026-10-23 · **Owner:** RVicky172

## Summary

Any signed-in user can read any other user's order with `GET /api/v1/orders/:id`, and that order's payment with
`GET /api/v1/payments/:orderId`. Neither endpoint checks who owns the record (baseline gaps G1, G2). Order IDs are
UUIDs, but they show up in logs, notifications and assistant chats, so treating them as secrets is not enough. This
feature makes both endpoints return a record only to its owner. Anyone else gets the same answer as for a record
that does not exist. It closes the last security item in Phase 0's exit criteria ("a user cannot read another
user's order or payment"). The AI assistant already guards orders on its own side (`getOwnOrder`), but the browser
and any direct caller do not.

## User Stories

- **US-1:** As a shopper, I want my orders and payments visible only to me, so that nobody can see what I bought,
  where it ships or what I paid.
- **US-2:** As a shopper, I want to keep seeing my own orders and payments exactly as today, so that the fix does
  not break order tracking or the assistant.
- **US-3:** As a maintainer, I want the ownership rule enforced by the services that own the data and proven by
  tests both ways, so that a new caller (UI page, script, another service) cannot bypass it.

## Acceptance Criteria

Users A and B are two distinct registered accounts. "Through the gateway" means with that user's access token.

- [x] **AC-1:** Given order O belongs to A, when A requests `GET /api/v1/orders/O` through the gateway, then the
  response is 200 with the same body as today (order fields and `items`). _(unit + manual integration)_
- [x] **AC-2:** Given order O belongs to A, when B requests `GET /api/v1/orders/O`, then the response is 404 with
  the same status, `error.code` and `error.message` as a request for an order ID that does not exist. Nothing in the
  response reveals that O exists. _(unit + manual integration)_
- [x] **AC-3:** Given order O belongs to A and has a payment, when A requests `GET /api/v1/payments/O`, then the
  response is 200 with the same body as today. _(unit + manual integration; see Q4 on producing a payment while
  checkout stalls at G3)_
- [x] **AC-4:** Given order O belongs to A, when B requests `GET /api/v1/payments/O`, then the response is 404,
  identical to the response for an order that has no payment. This holds whether or not O has a payment.
  _(unit + manual integration)_
- [x] **AC-5:** Given a request that reaches the order or payment service with a valid internal token but no
  `x-user-id`, when it calls `GET /orders/:id`, `GET /orders` or `GET /payments/:orderId`, then the response is 401
  and no data is returned. Today `GET /orders` queries for user `"undefined"` (Q6). _(unit)_
- [x] **AC-6:** Given an ID that is not a valid UUID (e.g. `abc`), when any user requests `GET /api/v1/orders/abc`
  or `GET /api/v1/payments/abc`, then the response is 404, not 500 (Q3). _(unit + manual integration)_
- [x] **AC-7:** Nothing else changes for owners:
  - `GET /api/v1/orders` (the list) and `POST /api/v1/orders` behave as before;
  - the saga's Kafka handling is unaffected;
  - asked about one of A's own orders by ID, the assistant still answers with its status and payment;
  - asked about one of B's orders, it still says the order was not found.

  _(manual integration, recorded in tasks.md)_
- [x] **AC-8:** Ownership is tested both ways (testing-strategy rule 6). Unit tests cover owner → record and
  non-owner → not found for both endpoints. Each is seen to fail at least once by briefly removing the check, and
  the failing output is recorded in tasks.md. _(unit + manual measurement)_
- [x] **AC-9:** The fix reaches the running stack. After `docker compose up -d --build` of every changed service,
  each `/health` reports healthy, and AC-1, AC-2 and AC-4 are re-run through the gateway with real tokens for A
  and B. _(manual integration)_
- [x] **AC-10:** Docs reflect the change:
  - G1 and G2 are marked closed by 002 in `000-baseline/baseline.md` (the original rows kept, with a closing note);
  - the "browser callers stay exposed until 002" entry in `memory/learnings.md` is removed or updated;
  - the order and payment service READMEs describe the ownership rule;
  - `specs/architecture.md` states it as a convention.

  _(manual review)_

## Non-Functional Requirements

- Security: a non-owner cannot tell "exists but not yours" from "does not exist". Status, body and headers are the
  same for both. Ownership is decided by the identity the gateway sets (`x-user-id`), never by anything in the
  request body or query.
- Data ownership (Constitution V): the order service decides who owns an order. Any service that needs that answer
  gets it through the order service's API or a Kafka event, never by reading `order_db`.
- Performance: an owner's `GET /orders/:id` adds no extra network calls. A payment lookup adds at most one internal
  call.
- Compatibility: 200 responses keep their current shape, so the frontend and assistant need no changes.

## Out of Scope

- An admin or support role that can read any order or payment (Q2).
- Write routes: order status changes come from the saga, not HTTP; product write protection (G5) stays in the
  backlog.
- Fixing the saga payloads (G3, G4). That is feature 010.
- Server-side prices (G7, G8), shared rate limiting (G6), the empty internal token in `.env.example` (G11).
- Removing the assistant's own ownership check (Q5).

## Open Questions

- **Q1** **Resolved 2026-10-23 (accepted as proposed).** Should a non-owner get 404 or 403? _Proposed:_ 404, the same as a missing record,
  so record IDs cannot be probed (testing-strategy rule 6 already says "401/404").
- **Q2** **Resolved 2026-10-23 (accepted as proposed).** Should any role (e.g. `admin`) bypass the check? _Proposed:_ no. Every account gets
  role `user` today and there is no admin UI. Add an admin read path later as a backlog item if it is ever needed.
- **Q3** **Resolved 2026-10-23 (accepted as proposed).** Should malformed IDs be fixed to return 404 instead of 500 (AC-6) here?
  _Proposed:_ yes. It is the same endpoints and the same "don't reveal anything" goal. The assistant currently has
  to treat 500 as not found.
- **Q4** **Resolved 2026-10-23 (accepted as proposed).** Payments do not record who owns them. Where should the payment endpoint get the
  owner from? _Proposed:_ from the order service, the owner of order data. The payment service returns a payment
  only if the order service says the order belongs to the caller. This needs no schema change and does not depend
  on 010's saga payload fix. The alternative is storing the user ID on each payment from a saga event, but today's
  `inventory.reserved` carries only `orderId` (G3). Because checkout stalls before any payment is written (G3),
  AC-3 is proven with a payment row inserted for testing (recorded in tasks.md and removed afterwards), not one
  made by a real checkout.
- **Q5** **Resolved 2026-10-23 (accepted as proposed).** Should the assistant drop its own order ownership check once the order service
  enforces it? _Proposed:_ no, keep it as defence in depth; it costs nothing. Update its comment so it no longer
  says the order service does not check.
- **Q6** **Resolved 2026-10-23 (accepted as proposed).** Should `GET /orders` (the list) also reject a missing `x-user-id` with 401 (AC-5)?
  It is not in G1/G2, but it is the same class of bug. _Proposed:_ yes, it is a one-line guard on the same
  controller.

## Changelog

- 2026-10-23 — Created.
- 2026-10-23 — Q1–Q6 accepted as proposed by RVicky172; status → Approved (D-010).
- 2026-10-23 — Plan approved (D-011), tasks written; status → In Progress.
- 2026-10-23 — Verified: AC-1–AC-10 proven (evidence in `tasks.md`); status → Implemented.
