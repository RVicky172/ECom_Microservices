# 002 — Ownership Checks on Orders and Payments · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

**§1 Shared identity helpers.** `packages/shared` gains two small pure functions in a new `src/identity.ts`, and
both services use them:

- `requireUserId(req)`: returns the `x-user-id` header, or throws `UnauthorizedError` (401) when it is missing or
  blank (AC-5).
- `isUuid(value)`: a strict check for an RFC 4122 UUID string, used to answer malformed IDs with 404 before they
  reach PostgreSQL (AC-6). Today PostgreSQL's `invalid input syntax for type uuid` error surfaces as a 500.

**§2 Order service.**

- `orderController.getOrderById` calls `requireUserId(req)`, then `orderService.getOrderForUser(orderId, userId)`.
- `getOrderForUser` returns `NotFoundError('Order')` in three cases: the ID is not a UUID, no row exists, or
  `order.user_id !== userId`. All three give the same status, message and body ("Order not found"), so a non-owner
  learns nothing (AC-2).
- It loads the order by ID and checks the owner in code instead of adding `user_id` to the SQL. That keeps the
  rule in one visible, unit-testable line, and both ways cost one query.
- `getOrders` also calls `requireUserId(req)` and no longer queries for `"undefined"` (AC-5, Q6).
- The old `getOrderById(orderId)` stays for internal callers, `updateOrderStatus` and the saga, which act on
  orders without a user. No HTTP route reaches it any more.

**§3 Payment service asks the order service (Q4).**

- `paymentController.getPayment` calls `requireUserId(req)`, then `paymentService.getPaymentForUser(orderId,
  userId, correlationId)`.
- `getPaymentForUser` steps:
  1. The ID is not a UUID → `NotFoundError('Payment')`.
  2. It asks the order service whether the caller owns the order: `orderClient.isOrderOwnedBy`, which calls
     `GET {ORDER_SERVICE_URL}/api/v1/orders/:id` and forwards `x-user-id`, `x-correlation-id` and
     `x-internal-token`. The order service answers 200 only to the owner (§2).
  3. Not owned (404) → `NotFoundError('Payment')`, identical to "no payment" (AC-4).
  4. Owned → load the payment by `order_id`. No payment → `NotFoundError('Payment')`.
- The ownership check always comes first, so a non-owner gets the same answer whether or not a payment exists.
- The order client returns `true` on 200 and `false` on 404. Any other status, a timeout (3 s) or a network error
  throws `AppError('Order service unavailable', 502)`. The shared error handler shows that as "Internal server
  error", so a failure is never mistaken for "not found".
- No new environment variable: `ORDER_SERVICE_URL` and `INTERNAL_SERVICE_TOKEN` already reach the payment service
  through `env_file: .env`. The default stays `http://localhost:4004` for local runs, as the assistant does.

**§4 Assistant (Q5).** No behaviour change. The `getOwnOrder` comment in `clients/storeClients.ts` now says that the
order service enforces ownership and this check is a second layer. The `getPaymentForOrder` comment says the
payment service enforces it too.

**§5 Docs (AC-10).**

- `000-baseline/baseline.md`: G1 and G2 rows get "closed by 002 (2026-10-23)".
- `memory/learnings.md`: replace the "browser callers stay exposed" entry.
- Order and payment READMEs: describe the rule in place of the "does not check ownership" notes.
- `specs/architecture.md`, Conventions:
  - read identity with `requireUserId`;
  - user-owned reads answer 404 to non-owners;
  - the payment service checks ownership through the order service.
- `testing-strategy.md`: add the controller and service test pattern from the Techniques section below.

## Files

| File | Change | Purpose |
| ---- | ------ | ------- |
| `packages/shared/src/identity.ts` | new | `requireUserId`, `isUuid` (§1) |
| `packages/shared/src/identity.test.ts` | new | Unit tests for §1 (AC-5, AC-6) |
| `packages/shared/src/index.ts` | modify | Export `./identity` |
| `packages/order-service/src/services/orderService.ts` | modify | `getOrderForUser` (§2) |
| `packages/order-service/src/services/orderService.test.ts` | new | Owner, non-owner, missing and malformed cases (AC-1, AC-2, AC-6, AC-8) |
| `packages/order-service/src/controllers/orderController.ts` | modify | `requireUserId` in `getOrderById` and `getOrders` (§2) |
| `packages/order-service/src/controllers/orderController.test.ts` | new | 401 without `x-user-id`; passes the caller's ID through (AC-5) |
| `packages/payment-service/src/clients/orderClient.ts` | new | `isOrderOwnedBy` (§3) |
| `packages/payment-service/src/clients/orderClient.test.ts` | new | Forwarded headers; 200, 404, other status and network failure (AC-3, AC-4) |
| `packages/payment-service/src/services/paymentService.ts` | modify | `getPaymentForUser` (§3) |
| `packages/payment-service/src/services/paymentService.test.ts` | new | Owner and no-payment, non-owner with and without a payment, malformed (AC-3, AC-4, AC-6, AC-8) |
| `packages/payment-service/src/controllers/paymentController.ts` | modify | `requireUserId` and the new service call (§3) |
| `packages/payment-service/src/controllers/paymentController.test.ts` | new | 401 without `x-user-id` (AC-5) |
| `packages/assistant-service/src/clients/storeClients.ts` | modify | Comments only (§4) |
| `packages/{order,payment}-service/README.md`, `specs/architecture.md`, `specs/testing-strategy.md`, `specs/features/000-baseline/baseline.md`, `memory/learnings.md` | modify | AC-10 (§5) |

## Data Structures & Interfaces

```ts
// packages/shared/src/identity.ts
/** The caller's user ID as set by the gateway; throws UnauthorizedError (401) when absent. */
export const requireUserId = (req: Request): string;
/** True for a canonical UUID string (8-4-4-4-12 hex). */
export const isUuid = (value: string): boolean;

// packages/order-service/src/services/orderService.ts
/** The order with its items, only if `userId` owns it; otherwise NotFoundError('Order'). */
export const getOrderForUser = async (orderId: string, userId: string): Promise<OrderWithItems>;

// packages/payment-service/src/clients/orderClient.ts
/** true = the order exists and belongs to userId; false = 404; throws AppError(502) on anything else. */
export const isOrderOwnedBy = async (orderId: string, userId: string, correlationId?: string): Promise<boolean>;

// packages/payment-service/src/services/paymentService.ts
/** The order's payment, only if the order belongs to userId; otherwise NotFoundError('Payment'). */
export const getPaymentForUser = async (orderId: string, userId: string, correlationId?: string): Promise<Payment>;
```

HTTP contract (unchanged for owners):

| Request | Owner | Non-owner / missing / malformed | No `x-user-id` |
| ------- | ----- | ------------------------------- | -------------- |
| `GET /api/v1/orders/:id` | 200 order + `items` | 404 `{ error: { code: 404, message: "Order not found" }, correlationId }` | 401 |
| `GET /api/v1/payments/:orderId` | 200 payment | 404 `{ error: { code: 404, message: "Payment not found" }, correlationId }` | 401 |
| `GET /api/v1/orders` | 200 own list | — | 401 |

## Techniques

- **Unit tests without a database** (001 harness): service tests `vi.mock('../models/orderModel')` (or
  `paymentModel`). The mocked `db` is a small fake for the chained calls the service makes: `db(table).where(…)
  .first()` and an awaited `db(table).where(…)`. The payment service test also mocks `../clients/orderClient`.
  Controller tests call the handler with a minimal `req`, a `res` fake (`status`, `json`) and a `vi.fn()` `next`,
  the same pattern as the 001 middleware test.
- **The order client is tested with `vi.stubGlobal('fetch', vi.fn())`**: assert the URL and the three forwarded
  headers, then map 200, 404, 500 and a rejected fetch. No sockets (001 AC-5).
- **Prove failure (AC-8):** delete the `user_id !== userId` line, and separately skip the `isOrderOwnedBy` call.
  Record the failing tests, then restore.
- **Manual integration (AC-1–AC-4, AC-6, AC-7, AC-9):**
  1. Register users A and B through the gateway (`POST /api/v1/auth/register` with header
     `Origin: http://localhost:3000`, which CSRF requires).
  2. A places an order (`POST /api/v1/orders`).
  3. curl both endpoints as A, as B and without a token. Use an unknown UUID and `abc` as well.
  4. For AC-3, insert one test row into `payment_db.payments` for A's order with `psql` inside the postgres
     container, then delete it afterwards. Checkout cannot create one while G3 is open. This is a manual test
     fixture, not service code, so Constitution V is unaffected.
  5. Ask the assistant (if a model is available) about A's order as A and as B. Otherwise, call the assistant's
     tool path directly and record which one was used.
- **No timing oracle work:** the non-owner path skips one payment query. That difference is negligible next to
  network jitter and is accepted (see Risks).

## Test Approach

| AC | Test / measurement | Type |
| -- | ------------------ | ---- |
| AC-1 | `orderService.test.ts` "owner gets the order with items"; curl as A → 200 | unit + manual |
| AC-2 | `orderService.test.ts` "non-owner gets the same NotFoundError as a missing order"; curl as B vs an unknown UUID → identical status and body (apart from `correlationId`) | unit + manual |
| AC-3 | `paymentService.test.ts` "owner gets the payment"; `orderClient.test.ts` 200 → true; curl as A with the test payment row → 200 | unit + manual |
| AC-4 | `paymentService.test.ts` "non-owner → NotFoundError whether or not a payment exists, payment table never queried"; `orderClient.test.ts` 404 → false; curl as B → body identical to an order without a payment | unit + manual |
| AC-5 | `identity.test.ts`; `orderController.test.ts` and `paymentController.test.ts` without the header → `next(UnauthorizedError)`, service not called | unit |
| AC-6 | `identity.test.ts` (`isUuid`); service tests with `abc` → NotFoundError and no DB call; curl `…/orders/abc` and `…/payments/abc` → 404 | unit + manual |
| AC-7 | curl `GET /orders` and `POST /orders` as A; assistant check as A and B; order and payment logs show no consumer errors after an order | manual |
| AC-8 | The unit tests above, plus a recorded break and restore of each ownership check | unit + manual measurement |
| AC-9 | `docker compose up -d --build order-service payment-service assistant-service` (shared changes, so all services that use it are rebuilt; see Risks); every `/health` 200; re-run AC-1, AC-2 and AC-4 | manual |
| AC-10 | Review the five docs and `memory/learnings.md` | manual review |

## Risks & Mitigations

- **Every service image builds `shared`.** A change to `packages/shared` only reaches a running service when its
  image is rebuilt. Only order and payment use the new helpers, but rebuild all services at the end (as in 001)
  so none runs a stale `shared`. Then check every `/health`.
- **The payment service now depends on the order service at request time.** If order is down, payment lookups
  return a 5xx instead of data. Accepted: only the payment read route is affected, the saga consumers don't use
  it, and the order service is a hard dependency of checkout anyway.
- **Mocking knex's chained API in unit tests could get fiddly.** Mitigation: the services call only `where` +
  `first` and an awaited `where`, so a fake of about 10 lines does it. If it grows beyond that, move the two
  queries behind small model functions (`findOrderById`, `findItems`) and mock those instead. Decide in the first
  test task; no spike needed.
- **Identical 404s also need identical headers.** Both paths go through the same `errorHandler`, so they get the
  same headers. The manual check compares status, body (minus `correlationId`) and `content-type`.
- **Timing side channel:** a non-owner's payment request skips one indexed query, a sub-millisecond difference.
  Accepted for a learning project; noted in the payment README.

## Constitution Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Spec before code | ✅ | Spec approved 2026-10-23 (D-010); plan approved 2026-10-23 (D-011) |
| II. Test-gated delivery | ✅ | Unit tests first for every rule (owner, non-owner, missing header, malformed ID), each proven to fail; integration checks recorded |
| III. Small dependencies | ✅ | No new dependencies: built-in `fetch`, existing Express, knex and Vitest |
| IV. Memory maintained | ✅ | D-010 logged; learnings entry replaced (§5); progress at verify |
| V. Database per service | ✅ | The payment service learns ownership only through the order service's HTTP API with forwarded identity and the internal token, never `order_db`. The AC-3 fixture row is inserted by hand during testing, not by a service |
