# 010 — Saga Payloads: Checkout Reaches CONFIRMED · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task. Each task lists files and the proving test.
Test-first: each "tests" task must fail before its paired implementation makes it pass.
When a task is done, tick it and add an indented **Result (YYYY-MM-DD):** note: what was done, numbers measured,
anything surprising or deferred. Keep `feature.json` in step (same ids, same done state).

## Setup

- [x] **T001** — Spike (plan §0): record the consumer group offsets and stock. Recreate only the Kafka container
      (`docker compose up -d --force-recreate kafka`) and restart the four saga services. Place one order straight
      away and watch whether it sticks at `PENDING` while inventory reserves its stock. Record offsets and topic
      contents again. Confirmed → continue. Not confirmed → stop and report (plan Risks) · files: none · test:
      recorded output
      **Result (2026-10-23):** plan §0's theory **not confirmed**; real cause found. After recreating Kafka and
      restarting the four saga services, all topics existed immediately (the consumers' subscriptions auto-created
      them), so no first message was skipped. Instead, order-service's consumer failed to start:
      `Failed to start Order Service consumer: This server does not host this topic-partition` (topic just created,
      partition leader not yet ready). `startConsumer` catches the error, logs it and gives up. The service keeps
      running, `/health` stays 200, and it never consumes again until restarted. Order `d65e2d78…` (placed 16:40:40)
      stayed `PENDING`; inventory reserved its stock at 16:40:41 and sent `inventory.reserved`. This also explains
      the 4 consecutive stuck orders on 2026-09-15 (a dead consumer for the whole session, not one lost message)
      and the 15:42 order (fixed by the 15:59 restart). Inventory's consumer hit a `GroupCoordinator` error in the
      same window but started; it was luck. Also found: the gateway rate limit is 100 requests / 15 min per IP, so
      polling through the gateway at 250 ms gets 429 after ~25 s. No restart policy in `docker-compose.yml`. Plan
      update proposed to RVicky172 before continuing.
- [x] **T002** — Measurement script in the scratchpad (plan Techniques):
      - sign in;
      - read stock;
      - place N orders and poll each every 250 ms in `order_db` with `psql` until it is final, with a 30 s cap
        (not through the gateway: its limit is 100 requests per 15 min, D-015);
      - read the payment (as owner) and the stock after;
      - print a table with time-to-final.

      Run it once against today's stack to record the "before" (expect: stuck at `INVENTORY_RESERVED`) · files:
      scratchpad only · test: recorded output
      **Result (2026-10-23):** scratchpad `010/measure.mjs <count> <qty> [productId]`; reads `cancel_reason` via
      `to_jsonb` so it runs before and after the migration. Before (Mouse `…29b`, 1 × 1): `INVENTORY_RESERVED`, not
      final after 30 s, payment 404, 0 payment rows; stock quantity 47 → 46, reserved 3 → 4 (held). First attempt
      got 429: my T001 polling had used up the gateway limit; restarting api-gateway clears its in-memory limiter
      (G6).

## Tests First

- [x] **T010** — Failing tests for the shared payload parsers: each accepts a complete payload and rejects a
      missing field with a `ValidationError` naming the event and field; `CancelReason` values · files:
      `packages/shared/src/events.test.ts` · test: fails first (parsers missing)
      **Result (2026-10-23):** 34 new tests failed first; 50/50 after T020. Covers each required field per event, empty
      items, item without productId, quantity 0, non-numeric and negative amount, wrong reason literal.
- [x] **T011** [P] — Failing tests for shared Kafka helpers, with a mocked producer, admin and consumer and an
      injected sleep:
      - `publishEvent`: envelope fields, given or generated `eventId`, `correlation-id`/`event-type` headers,
        key = aggregateId;
      - `ensureTopics`: creates the given topics with `waitForLeaders`; an already-exists result is fine;
      - `startSagaConsumer`: a subscribe failure → retried after 1 s, then 2 s (capped at 30 s), then `running`;
        a CRASH event with `restart: false` → the loop starts again; `status()` is `starting` until `run` succeeds;
        subscribes with `fromBeginning: true`.

      · files: `packages/shared/src/kafka.test.ts` · test: fails first
      **Result (2026-10-23):** 12 tests, all failed first; pass after T020. Seen failing: retry loop that gives up →
      3 fail; crash handler that ignores crashes → 1 fails; `fromBeginning: false` → 1 fails. Restored.
- [x] **T012** [P] — Failing tests for `nextTransitions`: every row of plan §4's table, including the two-step
      `PENDING` + `payment.completed`, the reasons, and "nothing" for late, duplicate and terminal cases · files:
      `packages/order-service/src/services/sagaTransitions.test.ts` · test: fails first
      **Result (2026-10-23):** 18 tests, failed first (module missing). Includes a sweep proving every proposed step is
      allowed by `canTransitionOrder`. Signature simplified to `nextTransitions(current, topic)` (topic string
      instead of a `{ topic }` object; same table).
- [x] **T013** [P] — Failing tests for the inventory saga handlers (mocked `db`/transaction, stock functions,
      `publishEvent`):
      - reserved payload = `{ orderId, userId, items, totalAmount }` and passes `parseInventoryReserved`;
      - rejected → `reason: 'OUT_OF_STOCK'`;
      - payment completed → finalize per item; failed → release per item;
      - an event already in `processed_events` → no stock change, no publish.

      · files: `packages/inventory-service/src/events/sagaHandlers.test.ts` · test: fails first
      **Result (2026-10-23):** 8 tests, failed first (module missing). Contract check: the published reserved/rejected
      payloads go through `parseInventoryReserved`/`parseInventoryRejected`.
- [x] **T014** [P] — Failing tests for payment:
      - `processPayment` with an injected draw: below the rate → COMPLETED, above → FAILED, amount stored;
      - `handleInventoryReserved`: pays `totalAmount`; completed payload `{ orderId, items, amount }` passes
        `parsePaymentCompleted`; failed adds `reason: 'PAYMENT_DECLINED'`;
      - the same incoming `eventId` twice → the same outcome `eventId`.

      · files: `packages/payment-service/src/services/paymentService.test.ts`,
      `packages/payment-service/src/events/sagaHandlers.test.ts` · test: fails first
      **Result (2026-10-23):** 5 handler tests failed first (module missing); 4 `processPayment` tests: 1 failed first,
      the others passed only by chance (real `Math.random` with rate 0.85), deterministic once the draw was
      injected. Contract checks run the published payloads through `parsePaymentCompleted`/`parsePaymentFailed`.
- [x] **T015** [P] — Failing tests for the order consumer handler (mocked `orderService`):
      - parses the payload;
      - applies `nextTransitions` steps in order, passing the reason with `CANCELLED`;
      - "nothing" → no update and an info log;
      - a bad payload → error logged, no throw.

      · files: `packages/order-service/src/events/consumer.test.ts` · test: fails first
      **Result (2026-10-23):** 7 tests, all failed first (`handleSagaEvent` missing). Also covers an event for an
      unknown order (warn, no throw).
- [x] **T016** [P] — Failing test for `cancelReasonLabel` (two codes → labels, anything else → "Cancelled") ·
      files: `packages/frontend/src/utils/storePresentation.test.ts` · test: fails first
      **Result (2026-10-23):** 5 cases, all failed first (`cancelReasonLabel` missing).

## Core

- [x] **T020** — Shared: payload types, parsers, `CancelReason`, `publishEvent`, `ensureTopics`, `startSagaConsumer`; type the order
      outbox payload; rebuild shared `dist` · files: `packages/shared/src/events.ts`, `packages/shared/src/kafka.ts`,
      `packages/order-service/src/services/orderService.ts` · test: T010, T011 pass
      **Result (2026-10-23):** shared 87/87, `tsc` clean, `dist` rebuilt and exports the new helpers; outbox payload
      typed `OrderCreatedData`. `npm run check` 13/13 (services not yet switched).
- [x] **T021** — Inventory: move the handlers to `sagaHandlers.ts`, forward the full reserved payload, add the
      rejection reason, read items from the payment payloads, use shared `publishEvent`; consumer started with
      `startSagaConsumer`; `/health` reports `consumer` · files:
      `packages/inventory-service/src/events/{sagaHandlers,consumer}.ts`, `packages/inventory-service/src/index.ts`
      · test: T013 passes; drop `totalAmount` from the reserved payload → contract test fails; restore (AC-11)
      **Result (2026-10-23):** inventory 8/8, `tsc` clean. Seen failing: `totalAmount` dropped → contract test fails;
      reserving only the first item → 2 fail. Restored. Producer now connects lazily on first `order.created` (so a
      Kafka outage at startup can't kill the service either). Generic `readOrLog` needed explicit payload types
      because services see shared untyped (backlog: shared `.d.ts`).
- [x] **T022** — Payment: injectable draw; `handleInventoryReserved` with typed payloads and a `uuidv5` outcome
      ID; consumer started with `startSagaConsumer`; `/health` reports `consumer` · files:
      `packages/payment-service/src/services/paymentService.ts`, `packages/payment-service/src/events/{sagaHandlers,consumer}.ts`,
      `packages/payment-service/src/index.ts`
      · test: T014 passes; outcome `eventId` back to random → the redelivery test fails; restore (AC-11)
      **Result (2026-10-23):** payment 24/24, `tsc` clean, gate 13/13. Seen failing: random outcome ID → redelivery
      test fails; amount 0 → charge test fails; completed payload without items → contract test fails. Restored.
      Outcome IDs are v5 UUIDs of the incoming event ID; producer connects lazily.
- [x] **T023** — Order: `nextTransitions`; `updateOrderStatus(…, reason?)`; `cancel_reason` migration
      (`hasColumn`); consumer started with `startSagaConsumer`; `/health` reports `consumer` · files:
      `packages/order-service/src/services/{sagaTransitions,orderService}.ts`,
      `packages/order-service/src/models/orderModel.ts`, `packages/order-service/src/events/consumer.ts`,
      `packages/order-service/src/index.ts` · test:
      T012, T015 pass; remove the `PENDING` + `payment.completed` row → T012 fails; remove the reason → fails;
      restore (AC-11)
      **Result (2026-10-23):** order-service 33/33, `tsc` clean. Seen failing: `PENDING` + `payment.completed` row
      removed → 2 fail; decline reason removed → 3 fail. Restored. `/health` now reports `consumer`; the
      `cancel_reason` migration (`hasColumn` + `alterTable`) runs at startup (checked live in T030). Test needed
      `as string[]` because services see `@ecommerce/shared` untyped (backlog).
- [x] **T024** [P] — Notification: shared payload types, reason in the failure message, consumer started with
      `startSagaConsumer`, `/health` reports `consumer` · files: `packages/notification-service/src/events/consumer.ts`,
      `packages/notification-service/src/services/notificationService.ts`, `packages/notification-service/src/index.ts` · test: `npm run check` passes
      (behaviour measured in T032)
      **Result (2026-10-23):** consumer rewritten on `startSagaConsumer` with the shared parsers; failure message
      now includes the reason; `/health` reports `consumer`. `tsc` clean, gate 13/13.
- [x] **T025** [P] — Storefront: `cancel_reason` on `Order`, `cancelReasonLabel`, the label under cancelled
      orders' status · files: `packages/frontend/src/types/store.ts`, `packages/frontend/src/utils/storePresentation.ts`,
      `packages/frontend/src/components/OrdersSection.tsx` · test: T016 passes; frontend typecheck passes
      **Result (2026-10-23):** frontend 18/18, `tsc` clean. The reason is shown in the order's second line ("1 items ·
      Payment declined") rather than under the status badge: the row is a fixed 3-column grid whose mobile layout
      places the badge explicitly, so this avoids a CSS change. Full suite: 15 files, 170 tests.

## Integration

- [x] **T030** — Dev data reset (plan §8):
      - by hand with `psql`: cancel the stuck orders in `order_db` (`cancel_reason` left null) and give their units
        back in `inventory_db`;
      - record the SQL and before/after counts.

      Then rebuild everything (`docker compose up -d --build --wait`), check every `/health`, and wait for
      `:4000/health` (learnings) · test: recorded output (AC-13 first half)
      **Result (2026-10-23):** 10 stuck orders (6 `PENDING`, 4 `INVENTORY_RESERVED`) held exactly what inventory had
      reserved: 4 × `…29b`, 20 × `…29c`. Reset by hand in two transactions:
      - `inventory_db`: `update stock_levels set quantity = quantity + N, reserved = reserved - N …` per product;
        all reserved = 0 after (`…29b` 50, `…29c` 30);
      - `order_db`: `update orders set status = 'CANCELLED', version = version + 1 … where status in ('PENDING',
        'INVENTORY_RESERVED')` → 10 rows.

      Rebuilt everything (`up -d --build --wait` exit 0): `/health` 200 on all 9 services and `GET /` 200 on :3000;
      "Added orders.cancel_reason" logged. The saga consumers showed `consumer: starting` for ~21 s (group rebalance
      waiting out the old members' sessions), then `running` on all four. KafkaJS logs `Topic creation errors` at
      ERROR when topics already exist; harmless (learnings).
- [x] **T031** — Repeat T001's reset scenario on the new code: recreate Kafka, restart the saga services, place an
      order straight away. Record:
      - any start retries in the logs;
      - every saga service's `/health` → `consumer: running`;
      - the order reaches a final status, not stuck at `PENDING`.

      Also stop Kafka for ~20 s while the services run, then start it: consumers must come back to `running` on
      their own · test: recorded output (§6 fix)
      **Result (2026-10-23):**
      - Reset (Kafka recreated, saga services restarted, order placed at once): order `3ace1dbc` reached a final
        status in 27.7 s (`CANCELLED`, `PAYMENT_DECLINED`: a 15% random decline at rate 0.85). It had one `FAILED`
        payment of 25.00 = total, and stock was back exactly (50/0). Before 010 the same scenario left T001's order
        `PENDING` forever.
      - Start retries: 0 this run (the T001 race did not recur; the retry path is covered by unit tests). All four
        consumers `running`.
      - Outages of 9 s and 45 s (Kafka stopped): KafkaJS reconnected by itself (connection timeouts, ENOTFOUND,
        ECONNREFUSED, then back); no CRASH, so no loop restart was needed. `/health` stayed `running` throughout.
        The status reflects the start loop, not live broker connectivity (noted in learnings).
      - Orders after the outages: `e407cda2` `CONFIRMED` in 22.5 s (consumers still rejoining), `142642db`
        `CONFIRMED` in 0.73 s; stock −1 each, reserved back to 0.
      - Not exercised live: a non-restarting crash (unit-tested in T011).
- [x] **T032** — Measurements with the T002 script:
      - `PAYMENT_SUCCESS_RATE=1` (edit `.env`, recreate payment-service): 10 orders;
      - `PAYMENT_SUCCESS_RATE=0`: 10 orders;
      - one order for more than the available stock;
      - restore `0.85` and recreate payment-service.

      Record each order's final status, time, `cancel_reason`, payment and stock deltas. Count notification log
      lines per order · test: recorded output (AC-1–AC-6, AC-10)
      **Result (2026-10-23):** rate set in `.env`, payment-service recreated and confirmed (`rate=…`,
      `consumer: running`) before each run; gateway restarted first to empty its limiter.
      - Rate 1, 10 × Mouse: **10/10 `CONFIRMED`, max 2.21 s** (min 0.74 s). Each had exactly 1 payment, `COMPLETED`
        25.00 = `total_amount`, read through the gateway as owner. Stock 48 → 38 (−10), reserved 0 → 0.
      - Rate 0, 10 × Mouse: **10/10 `CANCELLED` `PAYMENT_DECLINED`, max 2.21 s**. Each had exactly 1 payment,
        `FAILED` 25.00. Stock 38 → 38, reserved 0 → 0 (released exactly).
      - Out of stock (Laptop, 11 of 10): **`CANCELLED` `OUT_OF_STOCK` in 1.24 s**, payment 404 with 0 rows, stock
        unchanged (10/0).
      - API: `GET /orders/:id` and `GET /orders` return `cancel_reason` (`OUT_OF_STOCK`, `PAYMENT_DECLINED`; `null`
        when confirmed).
      - Notifications since the run started: exactly 1 success line for each of the 10 confirmed orders, exactly 1
        failure line for each of the 10 declined (e.g. "Payment for order d973e53c… failed (PAYMENT_DECLINED)"),
        0 for the out-of-stock order.
      - Rate restored to 0.85, payment-service recreated (`rate=0.85`, running).
- [x] **T033** — Replay: take one `inventory.reserved`, one `payment.completed` and one `payment.failed` message of
      finished orders (`kafka-console-consumer.sh --from-beginning`) and re-send each unchanged
      (`kafka-console-producer.sh`). Then check that payments, stock, status and notification lines did not change
      · test: recorded output (AC-7)
      **Result (2026-10-23):** dumped the topics (23 reserved / 12 completed / 11 failed messages) and re-sent,
      unchanged (same key, headers, value), `fb9464b0`'s `inventory.reserved` and `payment.completed` and
      `d973e53c`'s `payment.failed`. Snapshot before/after was identical: payments (1 each), statuses
      (`CONFIRMED` v3, `CANCELLED`/`PAYMENT_DECLINED` v3), stock (38/0), `processed_events` (57) and notification
      lines (1 each). Inventory and notification logged "already processed", order "changes nothing" ×3.
      **Bug found:** the resent `inventory.reserved` failed in payment with "current transaction is aborted".
      `processPayment` inserted the idempotency key, caught the unique violation and then queried in the same
      (now aborted) PostgreSQL transaction, so the "return stored result" path never worked (pre-existing). That
      was harmless here, but plan §3/D-014 rely on it to republish an outcome. Fixed with `insert … onConflict('key')
      .ignore().returning('key')`. 3 new tests (stored COMPLETED/FAILED returned without a new payment;
      IN_PROGRESS refused) use a fake that aborts the transaction like PostgreSQL. They failed with the original
      code and pass with the fix (payment 27/27). After rebuilding payment-service, the same replay logged "Payment
      successful" with no new payment row, republished `payment.completed` with the same v5 ID `00ab269e…`
      (3 copies on the topic), and inventory, notification and order all skipped it. Snapshot still identical.
- [x] **T034** — Storefront: with rate 1, place one order in the UI and record the time until the Orders page shows
      `CONFIRMED` (reload allowed). With rate 0, one order shows "Payment declined". Restore the rate · test:
      recorded observation (AC-6, AC-12)
      **Result (2026-10-23):** RVicky172 placed orders in the storefront (account `56e0d121…`):
      - Keyboard at 17:14:55 and 17:16:53 (rate 0.85): `CONFIRMED` 0.41 s after placing;
      - Monitor at 17:20:05 (rate 1): `CONFIRMED` in 1.99 s;
      - Mouse at 17:21:19 (rate 0): `CANCELLED` `PAYMENT_DECLINED` in 0.29 s.

      Times are `created_at` → `updated_at` in `order_db`. RVicky172 confirmed the Orders page showed `CONFIRMED`
      after a reload (the page does not refresh by itself), and, after a hard reload (Ctrl+Shift+R), "0 items ·
      Payment declined" on the cancelled order. A first "no" came from a tab still running the frontend code from
      before the 16:58 rebuild. "0 items" is pre-existing: `GET /orders` does not include items (backlog). Rate
      restored to 0.85.

## Verify

- [x] **T090** — Docs (AC-13):
      - baseline G3/G4 → closed by 010;
      - `specs/architecture.md`: the event contract table with the new payloads, and "payloads are defined in
        shared";
      - order, inventory and payment READMEs;
      - `memory/learnings.md`: Kafka-reset gotcha, reset SQL, forcing the payment rate.

      · test: review
      **Result (2026-10-23):**
      - baseline: G3/G4 rows → "closed 2026-10-23" (originals kept);
      - `specs/architecture.md`: the saga section now has the payload table plus rules (consumer start,
        idempotency, arrival order, cancel reason);
      - order, inventory and payment READMEs rewritten for the new flow; their stale "only `orderId`" caveats
        removed (search finds none);
      - learnings: Kafka-reset gotcha, reset SQL, forcing the payment rate (added in T030–T033).
- [x] **T091** — Every Definition-of-Done gate green (`specs/constitution.md`): `npm run check`, `npm run build`,
      every service `/health`; record the numbers
      **Result (2026-10-23):** `npm run check` 13/13; `npm run build` exit 0, no `*.test.*` in any `dist`;
      `npx vitest run` 3× → 173/173 each (no flakes). `/health` 200 on :4001–4008 and `GET /` 200 on :3000, all four
      saga consumers `running`. :4000 first answered **429**: the gateway's rate limiter is mounted before
      `/health`, and the T032 runs used up the quota (pre-existing; added to the backlog). It answered 200 after a
      gateway restart. `PAYMENT_SUCCESS_RATE` confirmed back at 0.85.
- [x] **T092** — Tick ACs in `spec.md` (Status `Implemented`), update `roadmap.md`/`roadmap.json`,
      `memory/progress.md`, `memory/MEMORY.md`
      **Result (2026-10-23):** AC-1–AC-13 ticked; spec Implemented; roadmap ✔️ (Phase 1: 1 of 3 done);
      progress and memory updated.

## AC coverage

| AC    | Tasks                                |
| ----- | ------------------------------------ |
| AC-1  | T002, T032                           |
| AC-2  | T014, T022, T032                     |
| AC-3  | T013, T021, T032                     |
| AC-4  | T013, T014, T021, T022, T032         |
| AC-5  | T013, T021, T032                     |
| AC-6  | T012, T016, T023, T025, T032, T034   |
| AC-7  | T012, T013, T014, T022, T033         |
| AC-8  | T012, T015, T023                     |
| AC-9  | T010, T013, T014, T020–T022          |
| AC-10 | T024, T032, T033                     |
| AC-11 | T010–T016, T021–T023                 |
| AC-12 | T034                                 |
| AC-13 | T030, T090                           |
