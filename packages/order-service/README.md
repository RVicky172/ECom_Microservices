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
| `GET` | `/:id` | Look up an order by ID |

The gateway requires a valid access token for these routes and forwards the verified user ID. The create and list handlers use that ID. Note that the current `GET /:id` handler fetches by order ID without checking ownership; the gateway authenticates the caller, but the service does not currently authorize access to that individual order.

## Creating an order

1. The controller validates each item with Joi and obtains the user ID from the gateway-provided header.
2. The service calculates the total and generates an order ID.
3. In one PostgreSQL transaction, it writes the order, its item rows, and an unpublished `ORDER_CREATED` outbox event.
4. The controller returns the created order.

The order items copy product name and price at the time of purchase. This snapshot keeps an order's displayed details stable if the catalog changes later.

## Why an outbox?

Writing an order to PostgreSQL and publishing to Kafka are two separate operations. If the database write succeeds but Kafka is unavailable, a direct “write then publish” approach could lose the event. The transactional outbox records the event in the same database transaction as the order.

The relay polls unpublished outbox rows every two seconds, publishes supported event types to Kafka, then marks them published. The service also consumes inventory and payment outcomes and attempts legal state transitions using the shared order state machine. Updates use a version field for optimistic concurrency.

## Important checkout integration caveat

The intended choreography is order creation, stock reservation, payment, and then confirmation or cancellation. In the current code, the inventory service's `INVENTORY_RESERVED` event contains only `orderId`, while the payment consumer reads `totalAmount` and `items` from that event. Those fields are not currently forwarded in the reservation event, so payment processing does not receive the data it expects. Check and align the event payloads before treating checkout as a complete end-to-end flow.

## Where to read next

- `src/controllers/orderController.ts` validates HTTP requests and identifies the caller.
- `src/services/orderService.ts` writes orders and applies status changes.
- `src/models/orderModel.ts` configures PostgreSQL and creates tables.
- `src/events/producer.ts` relays outbox rows to Kafka.
- `src/events/consumer.ts` translates downstream events into order statuses.
- `packages/shared/src/events.ts` defines topics and legal order transitions.
