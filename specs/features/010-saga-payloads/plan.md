# 010 — Saga Payloads: Checkout Reaches CONFIRMED · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved <!-- Draft | Approved -->

## Approach

**§0 Why orders stick at `PENDING` (Q3): spike done (T001, 2026-10-23).** The first theory was that topics are
auto-created by their first message, so `fromBeginning: false` consumers skip it. It was **not confirmed**: the
consumers' own subscriptions create the topics.

The real cause:

- After a Kafka (re)start, the order service subscribed before the new topic's partition leader was ready
  (`This server does not host this topic-partition`).
- Every service's `startConsumer` catches that error, logs "Failed to start … consumer" and gives up. The process
  keeps serving HTTP with `/health` 200 but never consumes again.
- Orders then stay `PENDING` for the whole session. This matches the 4 consecutive stuck orders of 2026-09-15 and
  the 15:42 order that a restart cured.
- Kafka's data volume being off (no persistence) makes Kafka restarts common, but is not the bug.

§6 is the fix (revised 2026-10-23, D-015).

**§1 One definition per saga event (AC-9).** `packages/shared/src/events.ts` gains:

- **Payload types** for the five saga events (see Interfaces).
- **A small parser per event** (`parseInventoryReserved(data)`, …) that checks the required fields and throws
  `ValidationError` naming the event and the missing field.
- **A `CancelReason` type:** `OUT_OF_STOCK | PAYMENT_DECLINED`.

`packages/shared/src/kafka.ts` gains `publishEvent(producer, topic, eventType, aggregateId, data, correlationId,
eventId?)`. It replaces the identical private copies in the inventory and payment consumers and builds the
standard envelope `{ eventId, eventType, aggregateId, data, timestamp }` with `correlation-id` and `event-type`
headers. Every producer builds its payload with the shared type, and every consumer parses with the shared parser.
The order outbox payload is typed as `OrderCreatedData`.

**§2 Inventory forwards what payment needs (G3).**

- On a successful reservation, `inventory.reserved` carries `{ orderId, userId, items, totalAmount }`, copied from
  `order.created`.
- On rejection, `inventory.rejected` carries `{ orderId, reason: 'OUT_OF_STOCK' }`.
- The payment handlers read `items` from the now-complete `payment.*` payloads (G4), then finalize or release
  stock.
- Handlers move into an exported `sagaHandlers.ts` so they can be unit-tested. The consumer only wires topics to
  handlers.

**§3 Payment pays the order total and passes items on (G3, G4).**

- The consumer parses `inventory.reserved` and calls `processPayment(orderId, totalAmount, key, draw = Math.random)`.
  The random draw is injectable (Q5); `PAYMENT_SUCCESS_RATE` still sets the chance.
- Outcomes:
  - `payment.completed` carries `{ orderId, items, amount }`;
  - `payment.failed` carries `{ orderId, items, amount, reason: 'PAYMENT_DECLINED' }`.
- **Stable outcome IDs (AC-7).** When `inventory.reserved` is delivered twice, `processPayment` already returns
  the stored result instead of paying again (idempotency key `evt_<eventId>`). But the consumer would publish the
  outcome a second time with a new random `eventId`, and inventory would finalize or release twice. Fix: the
  outcome's `eventId` is derived from the incoming one, `uuidv5(incomingEventId, PAYMENT_OUTCOME_NAMESPACE)` (the
  `uuid` package is already a dependency). A redelivery then republishes the same ID, and inventory's
  `processed_events` and notification's seen-set skip it.

**§4 Order service: transitions, arrival order, reason (AC-6, AC-7, AC-8).**

- **A new pure function `nextTransitions(currentStatus, event)`** in `services/sagaTransitions.ts` returns the
  status steps to apply, with an optional reason:

  | Event | Order status | Result |
  | ----- | ------------ | ------ |
  | `inventory.reserved` | `PENDING` | → `INVENTORY_RESERVED` |
  | `inventory.reserved` | anything else | nothing (late or duplicate) |
  | `inventory.rejected` | `PENDING` | → `CANCELLED` (`OUT_OF_STOCK`) |
  | `payment.completed` | `INVENTORY_RESERVED` | → `CONFIRMED` |
  | `payment.completed` | `PENDING` | → `INVENTORY_RESERVED` → `CONFIRMED` (payment implies stock was reserved; arrival-order case) |
  | `payment.failed` | `PENDING` or `INVENTORY_RESERVED` | → `CANCELLED` (`PAYMENT_DECLINED`) |
  | any event | terminal status | nothing |

  Each step still goes through `updateOrderStatus`, so the state machine (`canTransitionOrder`) and optimistic
  locking stay the single gate. No new transition is added to `VALID_ORDER_TRANSITIONS`.
- **The consumer** loads the order's status, asks `nextTransitions`, and applies the steps. "Nothing" is logged
  at info level, not as an error.
- **`cancel_reason`** (nullable string): the migration adds the column when missing (`hasColumn`), so existing
  databases upgrade in place. `updateOrderStatus(orderId, status, reason?)` writes it with `CANCELLED`.
  `GET /orders/:id` and `GET /orders` return it automatically, since they select `*`.

**§5 Notification.** Reads the shared payload types. Its in-memory seen-set skips redeliveries now that outcome
IDs are stable. The failure message includes the reason.

**§6 A saga consumer that cannot silently die (fix for §0; D-015).** Shared `startSagaConsumer(options)` in
`packages/shared/src/kafka.ts` replaces each service's hand-rolled `startConsumer` setup. It runs a start loop:

1. `ensureTopics` for its topics: `admin.createTopics` with `waitForLeaders: true`, treating "already exists" as
   success, so partitions are servable before subscribing.
2. Connect, then subscribe with `fromBeginning: true`. A group with no committed position, e.g. after a Kafka
   reset, reads what was published while it was down instead of starting at the end. Every handler is idempotent
   (§3, §4; inventory's `processed_events`).
3. `run` with the service's `onMessage(topic, event, correlationId)`.

Failure handling:

- If any step throws, log it, disconnect, wait and retry. The waits are 1 s, 2 s, 4 s and so on, capped at 30 s,
  for as long as it takes.
- If KafkaJS emits `consumer.events.CRASH` with `restart: false`, rerun the loop the same way.
- The sleep and the Kafka client are injectable, so the loop is unit-tested without Kafka or real waiting.

`startSagaConsumer` returns a handle with `status(): 'starting' | 'running'`. Each saga service's `/health` adds
`"consumer": status()` to its body and stays 200 (no 503: a Kafka hiccup must not mark every service unhealthy),
so a stuck consumer is visible at a glance. Kafka's data volume stays off in 010 (backlog item).

**§7 Storefront shows the reason (AC-6, AC-12).**

- `Order` gains `cancel_reason?: string | null`.
- `utils/storePresentation.ts` gains `cancelReasonLabel(reason)`: `OUT_OF_STOCK` → "Out of stock",
  `PAYMENT_DECLINED` → "Payment declined", anything else → "Cancelled".
- `OrdersSection` shows that label under the status of cancelled orders.

**§8 Dev data reset (Q4).** No code. The tasks record a one-off manual reset for the currently stuck orders:
cancel them in `order_db` and give their units back in `inventory_db` with `psql` by hand. Constitution V governs
services, not a developer's manual fix. The same steps go in `memory/learnings.md`.

**§9 Docs (AC-13).**

- `000-baseline/baseline.md`: G3 and G4 marked closed.
- `specs/architecture.md`: the event contract table with the new payloads, and "payloads live in shared".
- Order, inventory and payment READMEs updated.
- `memory/learnings.md`: the Kafka-reset gotcha and the reset steps.

## Files

| File | Change | Purpose |
| ---- | ------ | ------- |
| `packages/shared/src/events.ts` | modify | Payload types, parsers, `CancelReason` (§1) |
| `packages/shared/src/events.test.ts` | modify | Parser accept/reject cases; producer payloads satisfy consumer parsers (AC-9) |
| `packages/shared/src/kafka.ts` | modify | `publishEvent`, `ensureTopics`, `startSagaConsumer` (§1, §6) |
| `packages/shared/src/kafka.test.ts` | new | Envelope shape and headers; `ensureTopics` tolerates existing topics; `startSagaConsumer` retries with backoff after a start failure, restarts after a non-restarting crash, reports `starting`/`running` (mocked Kafka, injected sleep) |
| `packages/order-service/src/services/orderService.ts` | modify | Typed outbox payload; `updateOrderStatus(…, reason?)` |
| `packages/order-service/src/services/sagaTransitions.ts` | new | `nextTransitions` (§4) |
| `packages/order-service/src/services/sagaTransitions.test.ts` | new | Every table row above (AC-6–AC-8) |
| `packages/order-service/src/events/consumer.ts` | modify | Parse, `nextTransitions`, apply; started via `startSagaConsumer` |
| `packages/order-service/src/events/consumer.test.ts` | new | Applies steps in order; a no-op logs info; a bad payload is logged, not thrown |
| `packages/order-service/src/models/orderModel.ts` | modify | Add `cancel_reason` column when missing |
| `packages/inventory-service/src/events/sagaHandlers.ts` | new | Handlers moved out of the consumer (§2) |
| `packages/inventory-service/src/events/sagaHandlers.test.ts` | new | Reserved payload carries userId/items/total; rejected reason; finalize/release per item; duplicate skipped |
| `packages/inventory-service/src/events/consumer.ts` | modify | Wiring only; shared `publishEvent`; started via `startSagaConsumer` |
| `packages/payment-service/src/services/paymentService.ts` | modify | Injectable random draw |
| `packages/payment-service/src/events/sagaHandlers.ts` | new | `handleInventoryReserved` (§3) |
| `packages/payment-service/src/events/sagaHandlers.test.ts` | new | Amount = totalAmount; items passed on; reason on failure; same outcome `eventId` on redelivery |
| `packages/payment-service/src/services/paymentService.test.ts` | modify | Draw below/above rate → COMPLETED/FAILED |
| `packages/payment-service/src/events/consumer.ts` | modify | Wiring only; started via `startSagaConsumer` |
| `packages/notification-service/src/events/consumer.ts`, `services/notificationService.ts` | modify | Shared types; started via `startSagaConsumer`; reason in the failure message |
| `packages/{order,inventory,payment,notification}-service/src/index.ts` | modify | `/health` body adds `consumer: status()` (§6) |
| `packages/frontend/src/types/store.ts`, `components/OrdersSection.tsx`, `utils/storePresentation.ts` (+ test) | modify | Cancel reason (§7) |
| `specs/architecture.md`, `specs/features/000-baseline/baseline.md`, order/inventory/payment READMEs, `memory/learnings.md` | modify | AC-13 (§9) |

## Data Structures & Interfaces

```ts
// packages/shared/src/events.ts
export interface SagaItem { productId: string; quantity: number; productName?: string; price?: number }
export type CancelReason = 'OUT_OF_STOCK' | 'PAYMENT_DECLINED';

export interface OrderCreatedData      { orderId: string; userId: string; items: SagaItem[]; totalAmount: number }
export interface InventoryReservedData { orderId: string; userId: string; items: SagaItem[]; totalAmount: number }
export interface InventoryRejectedData { orderId: string; reason: 'OUT_OF_STOCK' }
export interface PaymentCompletedData  { orderId: string; items: SagaItem[]; amount: number }
export interface PaymentFailedData     { orderId: string; items: SagaItem[]; amount: number; reason: 'PAYMENT_DECLINED' }

/** Each throws ValidationError("<event>: <field> missing") on a bad payload. */
export const parseOrderCreated: (data: unknown) => OrderCreatedData;
export const parseInventoryReserved: (data: unknown) => InventoryReservedData;
export const parseInventoryRejected: (data: unknown) => InventoryRejectedData;
export const parsePaymentCompleted: (data: unknown) => PaymentCompletedData;
export const parsePaymentFailed: (data: unknown) => PaymentFailedData;

// packages/shared/src/kafka.ts
export const publishEvent: (producer: Producer, topic: KafkaTopics, eventType: EventTypes, aggregateId: string,
  data: object, correlationId: string, eventId?: string) => Promise<void>;
export const ensureTopics: (kafka: Kafka, topics: KafkaTopics[]) => Promise<void>;
export interface SagaConsumerOptions {
  clientId: string; groupId: string; topics: KafkaTopics[]; logger: Logger;
  onMessage: (topic: string, event: SagaEnvelope, correlationId: string) => Promise<void>;
  createKafka?: (clientId: string) => Kafka;          // injectable for tests
  sleep?: (ms: number) => Promise<void>;              // injectable for tests
}
export const startSagaConsumer: (options: SagaConsumerOptions) => { status: () => 'starting' | 'running' };

// packages/order-service/src/services/sagaTransitions.ts
export type SagaEvent =
  | { topic: 'inventory.reserved' } | { topic: 'inventory.rejected' }
  | { topic: 'payment.completed' } | { topic: 'payment.failed' };
export interface Step { status: OrderStatus; reason?: CancelReason }
export const nextTransitions: (current: string, event: SagaEvent) => Step[];

// packages/payment-service/src/services/paymentService.ts
export const processPayment: (orderId: string, amount: number, idempotencyKey: string,
  draw?: () => number) => Promise<Payment>;
```

## Techniques

- **Testable handlers:** the handlers take their side effects as module imports that the tests mock: the
  service's `db`, the stock or payment functions, and the shared `publishEvent`. `db.transaction(cb)` is faked as
  `cb(trx)` with a recording `trx`. Same pattern as 002 (`vi.mock`, `vi.hoisted`, no top-level `await`).
- **Contract tests (AC-9):** for each event, the producer test captures the `data` passed to `publishEvent` and
  feeds it to the consumer's shared parser. If a producer drops a field, the parser throws and the test fails.
- **Measurements (AC-1–AC-5, AC-7, AC-10, AC-12):** a scratchpad script (like 002's probes) does the following.
  1. Sign in and read stock with `GET /api/v1/inventory/:productId`.
  2. Place N orders.
  3. Poll each order's status every 250 ms in `order_db` with `psql` (read-only), not through the gateway: its
     limit is 100 requests per 15 min per IP (D-015). Stop when the status is final; record the time and status.
  4. Read the payment through the gateway (002) and stock again.
  5. Print a table.

  Payment success is forced by setting `PAYMENT_SUCCESS_RATE=1` (then `0`) in `.env` and recreating only
  payment-service. `.env` is read when a container is created (learnings). The original value is restored after.
- **Replay (AC-7):** read one `inventory.reserved`, one `payment.completed` and one `payment.failed` message for a
  finished order with `kafka-console-consumer.sh --from-beginning`. Re-send each unchanged with
  `kafka-console-producer.sh`. Check that payments, stock and status did not change, and that notification logged
  nothing new.
- **Prove failure (AC-11):** break each rule briefly and record the failing test:
  - drop `totalAmount` from the reserved payload;
  - give outcome events a random `eventId` again;
  - remove the `PENDING` row for `payment.completed`;
  - remove the reason.

## Test Approach

| AC | Test / measurement | Type |
| -- | ------------------ | ---- |
| AC-1 | Script: 10 orders with rate 1; every one `CONFIRMED`; record max time-to-final (≤ 10 s) | manual measurement |
| AC-2 | Script: 1 payment per order, `COMPLETED`, amount = `total_amount` (via `GET /payments/:orderId` as owner); `payment-service sagaHandlers.test.ts` amount = totalAmount | manual + unit |
| AC-3 | Script: stock before/after per product: available −qty, reserved unchanged overall | manual measurement |
| AC-4 | Script: 10 orders with rate 0; all `CANCELLED` ≤ 10 s, `cancel_reason = PAYMENT_DECLINED`, 1 `FAILED` payment each, stock back exactly | manual measurement |
| AC-5 | Script: order quantity > available → `CANCELLED` (`OUT_OF_STOCK`) ≤ 10 s, payment 404, stock unchanged | manual measurement |
| AC-6 | `sagaTransitions.test.ts` (reasons); `storePresentation.test.ts` (`cancelReasonLabel`); script reads `cancel_reason` from the API; UI screenshot or description in tasks.md | unit + manual |
| AC-7 | `sagaTransitions.test.ts` (terminal/duplicate → no steps); inventory and payment handler tests (duplicate skipped, stable `eventId`); Kafka replay check | unit + manual measurement |
| AC-8 | `sagaTransitions.test.ts` `PENDING` + `payment.completed` → two steps; `consumer.test.ts` applies both in order | unit |
| AC-9 | `events.test.ts` parsers; contract tests in each producer's handler test | unit |
| AC-10 | Notification logs after AC-1/AC-4 runs and the replay: exactly one success or failure line per order | manual measurement |
| AC-11 | All of the above run without Kafka or a database; break/restore results recorded per test file | unit + manual measurement |
| AC-12 | Place one order in the storefront with rate 1; Orders page shows `CONFIRMED` ≤ 10 s (reload) | manual |
| AC-13 | `docker compose up -d --build --wait` (all services; shared changed), every `/health`; docs reviewed | manual review |

## Risks & Mitigations

- **Spike outcome (T001):** the first theory was wrong; the real cause (a consumer start failure swallowed) was
  reproduced, and §6 was revised to fix it (D-015).
- **A retry loop could spin or hide a permanent misconfiguration** (wrong broker address). Backoff caps at 30 s,
  every failure is logged with its error, and `/health` shows `consumer: starting`, so it is loud, not silent.
- **`fromBeginning: true` replays old messages when a group is new but the topic still has data.** Today Kafka
  data dies with the container, so topics are empty. If the Kafka volume is turned on later, groups keep their
  committed positions and nothing replays. In both cases handlers are idempotent (AC-7).
- **Topic auto-creation race between services.** `ensureTopics` uses `createTopics` with
  `waitForLeaders: true` and treats "already exists" as success, so two services racing at startup is harmless.
- **Changing the payload breaks a consumer this plan missed.** Mitigation: the five topics' producers and
  consumers are listed in the baseline (all in the Files table), and AC-9's contract tests cover each pair.
- **Notification dedupe is in memory (G10).** A notification restart between a delivery and its replay would log
  twice. AC-10 is measured without restarts (spec Out of Scope).
- **Schema change on a live table.** Adding a nullable column is backward compatible; `hasColumn` makes the
  migration safe to run on every start.
- **The arrival-order case is hard to trigger live.** AC-8 is proven by unit tests, as the spec says. The live
  runs (AC-1) show it does not happen or is handled.

## Points to decide (approved 2026-10-23 as recommended, D-014)

1. **Arrival order:** step `PENDING → INVENTORY_RESERVED → CONFIRMED` in the consumer (recommended, the state
   machine stays as it is), or add `PENDING → CONFIRMED` to `VALID_ORDER_TRANSITIONS`.
2. **Kafka data volume:** leave it commented out and rely on §6 (recommended for 010), or turn it on now (one line
   in `docker-compose.yml`, separate from the saga fix). Either way, add a backlog note.
3. **Stable outcome IDs via `uuidv5`** (recommended), or dedupe in inventory by `(orderId, action)` instead.

## Constitution Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Spec before code | ✅ | Spec approved 2026-10-23 (D-013); plan approved 2026-10-23 (D-014), §0/§6 revised after the spike (D-015) |
| II. Test-gated delivery | ✅ | Pure transition table and handlers unit-tested first; randomness injected (`draw`); polling waits on real status changes, no fixed sleeps; each rule proven to fail |
| III. Small dependencies | ✅ | No new dependencies: `uuid` (v5), KafkaJS admin and Vitest are already in use |
| IV. Memory maintained | ✅ | D-013 logged; Kafka-reset gotcha and reset steps go to learnings; progress at verify |
| V. Database per service | ✅ | Each service writes only its own store; data moves only in the shared event payloads; producer, consumers and shared definitions change together (AC-9). The §8 reset is a manual developer step, not service code |
