# Payment Service: simulated payment processing

The Payment Service stores payment results and participates in the checkout event flow. It listens on port `4006` by default, uses PostgreSQL (the `payment_db` database by default), and consumes Kafka events.

Run it from the repository root with:

```sh
npm run dev:payment
```

The service needs PostgreSQL and Kafka. Connection settings include `POSTGRES_DB_PAYMENT` and `KAFKA_BROKERS`.

## HTTP endpoint

The service exposes `GET /api/v1/payments/:orderId`, which returns a payment record for an order. The gateway requires an access token on this route. However, the payment controller queries by order ID and does not check that the order belongs to the authenticated user. Authentication at the gateway does not replace this resource-level authorization check.

## Event-driven payment flow

At startup, the service subscribes to `inventory.reserved`. For each event it uses the event ID as an idempotency key, calls `processPayment`, and publishes either `payment.completed` or `payment.failed`. The Inventory Service and Order Service consume those outcome events.

Payment processing is simulated, not connected to a real card processor. A random draw determines success. `PAYMENT_SUCCESS_RATE` configures the probability, defaulting to `0.85`. The database stores payment status and a simulated transaction ID on success.

## Idempotency

An idempotency key prevents the same logical payment from being processed twice when an event is retried. A database table records whether a key is `IN_PROGRESS`, `COMPLETED`, or `FAILED`, and stores the prior response for completed attempts. Repeated attempts can return the recorded result instead of processing again.

## Current checkout payload limitation

The payment consumer expects `orderId`, `totalAmount`, and `items` in the `inventory.reserved` event. The Inventory Service currently publishes only `orderId`, so the amount and item data required for this handler are missing. Align the producer and consumer payloads before relying on the full checkout flow. See the [Order Service guide](../order-service/README.md).

## Where to read next

- `src/events/consumer.ts` starts payment processing after stock reservation.
- `src/services/paymentService.ts` implements simulated processing and idempotency.
- `src/models/paymentModel.ts` creates payment and idempotency tables.
- `src/routes/paymentRoutes.ts` defines the HTTP lookup endpoint.
