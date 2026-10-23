# Shared package: common building blocks

`@ecommerce/shared` is a TypeScript workspace package used by backend services. It is not a running service and does not listen on a port. Its purpose is to keep common conventions—such as event names, error responses, logging, and JWT handling—in one place so the services do not each invent their own version.

Build it from the repository root with:

```sh
npm run build --workspace=packages/shared
```

## What it provides

| Module | What it is for |
| --- | --- |
| `src/events.ts` | Kafka topic names, event type names, order statuses, and legal transitions |
| `src/kafka.ts` | KafkaJS client, producer, and consumer setup |
| `src/jwt.ts` | Shared JWT signing and verification helpers and refresh-cookie name |
| `src/errors.ts` | Standard application errors and their HTTP status codes |
| `src/middleware/errorHandler.ts` | Express error-to-response middleware |
| `src/middleware/correlationId.ts` | Request correlation ID creation/forwarding |
| `src/middleware/internalAuth.ts` | `requireInternalToken`: accept only requests carrying `INTERNAL_SERVICE_TOKEN` (when set) |
| `src/logger.ts` | Structured Pino logger setup |
| `src/index.ts` | Public exports for the package |

## Why share these definitions?

An event producer and consumer must agree on the exact topic name. A common registry reduces spelling mismatches. Likewise, shared error classes allow the common error middleware to produce consistent HTTP responses, and a common JWT helper means the gateway and auth service use the same signing secret and token format.

The shared package centralizes mechanisms, not application policy. For example, it lists valid order-status transitions, but the Order Service still decides when to apply them. It provides JWT verification, but the gateway decides which routes require a token.

## Configuration notes

JWT signing and verification use `JWT_SECRET`. The code currently includes a development fallback if that variable is absent; production deployments should configure a strong secret rather than rely on the fallback. `INTERNAL_SERVICE_TOKEN`, when set, makes every HTTP service require the `x-internal-token` header that the gateway and assistant send; leave it unset for simple local development. `KAFKA_BROKERS` configures Kafka clients, and `LOG_LEVEL` configures the structured logger.

## Where to read next

- `src/events.ts` is the best starting point for understanding checkout choreography and order status transitions.
- `src/kafka.ts` shows how the services create Kafka clients.
- `src/jwt.ts` shows the shared token format.
- `src/errors.ts` and `src/middleware/errorHandler.ts` explain error handling.
