# Inventory Service: stock and reservations

The Inventory Service owns stock quantities and reservations. It listens on port `4005` by default and stores data in PostgreSQL (the `inventory_db` database by default). It also consumes checkout events from Kafka.

Run it from the repository root with:

```sh
npm run dev:inventory
```

The service needs PostgreSQL and Kafka. Database settings use the `POSTGRES_*` variables documented in the repository configuration, including `POSTGRES_DB_INVENTORY`; Kafka uses `KAFKA_BROKERS`.

## HTTP endpoints

The service mounts routes below `/api/v1/inventory`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/:productId` | Read stock and reserved quantity |
| `PUT` | `/:productId` | Set the available quantity |

The set-stock body must contain a non-negative integer `quantity`. The service's inventory routes are not currently mounted by the API gateway, so these endpoints are not available through the frontend's normal gateway URL.

## Reservation lifecycle

The service subscribes to `order.created`, `payment.completed`, and `payment.failed`:

- On `order.created`, it tries to reserve each item's quantity inside a PostgreSQL transaction. A conditional update ensures that stock cannot be reserved when available quantity is too low.
- If all items are reserved, it publishes `inventory.reserved` carrying `orderId, userId, items, totalAmount`: what payment needs. If a reservation fails, the transaction rolls back and it publishes `inventory.rejected` with `reason: 'OUT_OF_STOCK'`.
- On `payment.completed`, it decreases the reserved amount of each item in the event to finalize the sale.
- On `payment.failed`, it restores each item's reserved units to available stock.

`processed_events` records event IDs so a duplicate Kafka message can be skipped. Atomic quantity updates and event tracking help the service remain consistent when events are retried.

## Keep event payloads in sync

Services communicate through the topic and payload definitions in `packages/shared/src/events.ts`, not through a direct function call. The handlers (`src/events/sagaHandlers.ts`) build the shared payload types and read incoming events with the shared parsers, and their unit tests check that each published payload passes the consumer's parser. Change a payload only together with its producer, every consumer and the shared definition (Constitution V).

## Where to read next

- `src/routes/inventoryRoutes.ts` and `src/controllers/inventoryController.ts` define the HTTP interface.
- `src/services/inventoryService.ts` contains stock and reservation updates.
- `src/models/inventoryModel.ts` defines stock and processed-event tables.
- `src/events/sagaHandlers.ts` applies Kafka events and publishes reservation results; `src/events/consumer.ts` starts the consumer (`startSagaConsumer`, retries until Kafka is ready).
