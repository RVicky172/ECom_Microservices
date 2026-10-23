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
- If all items are reserved, it publishes `inventory.reserved`. If a reservation fails, the transaction rolls back and it publishes `inventory.rejected`.
- On `payment.completed`, it decreases the reserved amount to finalize the sale.
- On `payment.failed`, it restores the reserved units to available stock.

`processed_events` records event IDs so a duplicate Kafka message can be skipped. Atomic quantity updates and event tracking help the service remain consistent when events are retried.

## Keep event payloads in sync

Services communicate through the topic and payload definitions in code, not through a direct function call. The current reservation event includes only the order ID, although the Payment Service currently expects the amount and items too. See the [Order Service guide](../order-service/README.md) for this checkout integration limitation.

## Where to read next

- `src/routes/inventoryRoutes.ts` and `src/controllers/inventoryController.ts` define the HTTP interface.
- `src/services/inventoryService.ts` contains stock and reservation updates.
- `src/models/inventoryModel.ts` defines stock and processed-event tables.
- `src/events/consumer.ts` applies Kafka events and publishes reservation results.
