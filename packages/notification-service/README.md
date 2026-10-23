# Notification Service: reacting to business events

The Notification Service listens for order and payment events in Kafka and logs the email messages it would send. It listens on port `4007` by default for its health endpoint; it does not expose customer notification API routes or connect to an email provider.

Run it from the repository root with:

```sh
npm run dev:notification
```

The service needs Kafka, configured with `KAFKA_BROKERS`. It has no database.

## How it works

When the process starts, it creates a Kafka consumer in the `notification-service-group` group and subscribes to:

- `order.created`
- `payment.completed`
- `payment.failed`
- `order.shipped`

For each message, the consumer reads the event ID, event type, and event data. It logs the event with its correlation ID and calls the matching notification function for order creation or payment success/failure. The current service uses an in-memory set to skip duplicate event IDs while the process is alive.

The notification functions write text such as `[EMAIL SENT] ...` to the structured service log. This is a demonstration of event-driven notification handling; no actual email is delivered.

## Reliability limitations

The in-memory processed-event set is lost when the service restarts and is not shared by multiple instances. A production notification system would need persistent idempotency tracking and an email provider integration. Although `order.shipped` is subscribed to, the current consumer does not call a notification function for that topic.

## Where to read next

- `src/index.ts` starts the health endpoint and Kafka consumer.
- `src/events/consumer.ts` subscribes to topics and routes messages.
- `src/services/notificationService.ts` contains the current log-only notification implementations.
- `packages/shared/src/events.ts` is the central topic registry.
