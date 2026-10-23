# Order Service: order records and checkout events

The Order Service creates and reads orders, stores the order lifecycle, and publishes checkout events for the other services. It listens on port `4004` by default and uses PostgreSQL (the `order_db` database by default).

Run it from the repository root with:

```sh
npm run dev:order
```

The service needs PostgreSQL and Kafka. PostgreSQL settings use `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB_ORDER`; Kafka uses `KAFKA_BROKERS`. Startup creates the order, order-item, and outbox tables if absent, then starts its Kafka consumer and outbox relay.

## Endpoints

Routes are mounted below `/api/v1/orders`:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/` | Create an order from a non-empty list of items |
| `GET` | `/` | List the current user's orders with pagination |
| `GET` | `/:id` | One of the current user's orders, with its items |

The gateway requires a valid access token for these routes and forwards the verified user ID in `x-user-id`. Every handler reads it with `requireUserId` from `@ecommerce/shared`; a request without it gets 401.

`GET /:id` returns an order only to its owner (`getOrderForUser`). A malformed ID, an order that does not exist and someone else's order all get the same `404 Order not found`, so a caller cannot probe which IDs exist (feature 002). The payment service relies on this: it calls `GET /:id` as the user to decide whether a payment may be shown. `getOrderById` (no owner check) is for internal callers such as the saga only.

## Creating an order

1. The controller validates each item with Joi and obtains the user ID from the gateway-provided header.
2. The service calculates the total and generates an order ID.
3. In one PostgreSQL transaction, it writes the order, its item rows, and an unpublished `ORDER_CREATED` outbox event.
4. The controller returns the created order.

The order items copy product name and price at the time of purchase. This snapshot keeps an order's displayed details stable if the catalog changes later.

## Why an outbox?

Writing an order to PostgreSQL and publishing to Kafka are two separate operations. If the database write succeeds but Kafka is unavailable, a direct “write then publish” approach could lose the event. The transactional outbox records the event in the same database transaction as the order.

The relay polls unpublished outbox rows every two seconds, publishes supported event types to Kafka, then marks them published. Updates use a version field for optimistic concurrency.

## How saga events change an order

The consumer (`src/events/consumer.ts`) reads `inventory.reserved`, `inventory.rejected`, `payment.completed` and `payment.failed` with the shared parsers. It asks `nextTransitions(currentStatus, topic)` (`src/services/sagaTransitions.ts`) which status steps apply, and runs each one through `updateOrderStatus`, so the shared state machine stays the only gate:

- `inventory.reserved` on `PENDING` → `INVENTORY_RESERVED`;
- `payment.completed` → `CONFIRMED`. If the payment event arrives while the order is still `PENDING`, it steps through `INVENTORY_RESERVED` first;
- `inventory.rejected` → `CANCELLED` with `cancel_reason = OUT_OF_STOCK`; `payment.failed` → `CANCELLED` with `PAYMENT_DECLINED`;
- anything else (a duplicate, a late event, a finished order) changes nothing and is logged at info level.

`cancel_reason` is a nullable column added at startup when missing, and `GET /:id` and `GET /` return it. The consumer starts through shared `startSagaConsumer`, which retries until Kafka is ready; `/health` shows `consumer: starting | running` (feature 010).

## Where to read next

- `src/controllers/orderController.ts` validates HTTP requests and identifies the caller.
- `src/services/orderService.ts` writes orders and applies status changes.
- `src/models/orderModel.ts` configures PostgreSQL and creates tables.
- `src/events/producer.ts` relays outbox rows to Kafka.
- `src/events/consumer.ts` translates downstream events into order statuses.
- `packages/shared/src/events.ts` defines topics and legal order transitions.
