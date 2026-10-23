# Payment Service: simulated payment processing

The Payment Service stores payment results and participates in the checkout event flow. It listens on port `4006` by default, uses PostgreSQL (the `payment_db` database by default), and consumes Kafka events.

Run it from the repository root with:

```sh
npm run dev:payment
```

The service needs PostgreSQL and Kafka. Connection settings include `POSTGRES_DB_PAYMENT` and `KAFKA_BROKERS`.

## HTTP endpoint

The service exposes `GET /api/v1/payments/:orderId`, which returns the payment for one of the current user's orders. The gateway requires an access token and forwards the user ID in `x-user-id`; without it the service answers 401.

Payments do not record who owns them, so before reading one the service asks the Order Service, which owns order data: `clients/orderClient.ts` calls `GET {ORDER_SERVICE_URL}/api/v1/orders/:orderId` as the user, forwarding `x-user-id`, `x-correlation-id` and `x-internal-token`. A 200 means the order is the caller's; a 404 means it is missing or someone else's, and the payment endpoint then answers `404 Payment not found`, exactly as for an order without a payment. Any other outcome (order service down, timeout after 3 s) is a 502, shown as "Internal server error", never a 404. Malformed IDs get 404 without any lookup (feature 002).

A non-owner's request skips the payment query, a sub-millisecond timing difference that is accepted for this project.

## Event-driven payment flow

At startup, the service subscribes to `inventory.reserved` (through shared `startSagaConsumer`, which retries until Kafka is ready). For each event it charges the order's `totalAmount`, using `evt_<eventId>` as the idempotency key, then publishes:

- `payment.completed` with `orderId, items, amount`, or
- `payment.failed` with the same fields plus `reason: 'PAYMENT_DECLINED'`.

The items let inventory finalize or release the stock. The Inventory, Order and Notification services consume these outcome events. Each outcome's event ID is a v5 UUID of the incoming event ID, so a redelivered `inventory.reserved` republishes the same event and downstream services skip it (`src/events/sagaHandlers.ts`).

Payment processing is simulated, not connected to a real card processor. A random draw determines success. `PAYMENT_SUCCESS_RATE` configures the probability, defaulting to `0.85`. Set it to `1` or `0` in `.env` and recreate the container to force outcomes for testing; unit tests inject the draw instead. The database stores payment status and a simulated transaction ID on success.

## Idempotency

An idempotency key prevents the same logical payment from being processed twice when an event is retried. A database table records whether a key is `IN_PROGRESS`, `COMPLETED`, or `FAILED`, and stores the prior response for completed attempts. Repeated attempts return the recorded result instead of processing again. The key is claimed with `insert … on conflict do nothing`: a plain insert's unique violation would abort the PostgreSQL transaction, so the stored result could not be read back (fixed in feature 010).

## Where to read next

- `src/events/sagaHandlers.ts` charges and publishes the outcome; `src/events/consumer.ts` starts the consumer.
- `src/services/paymentService.ts` implements simulated processing and idempotency.
- `src/models/paymentModel.ts` creates payment and idempotency tables.
- `src/routes/paymentRoutes.ts` defines the HTTP lookup endpoint.
