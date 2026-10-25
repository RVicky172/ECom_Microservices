# Coding Standards

How code in this repository is shaped: the design patterns it already uses, and the clean-code,
distributed-system and documentation rules for new and changed code. Referenced from `constitution.md` (Quality Gates), `CLAUDE.md` and Stage 4 of `workflow.md`.

Every example is a `file:line` in this repository. Where the repo also has a counter-example, it is named, so you
know what to fix when you touch that code. The rules apply to new and changed code; nobody rewrites old code just
to follow them.

## Design patterns

### Layered service: route → controller → service → data access

Each service has the same four layers, and each layer calls only the one below it.

- **Route:** maps a method and path to a handler. `packages/order-service/src/routes/orderRoutes.ts:7`
- **Controller:** HTTP only. It validates the request, reads the caller's identity, calls one service function,
  and answers. `packages/order-service/src/controllers/orderController.ts:33` validates the body with Joi and
  hands the values to `orderService.createOrder` (line 47).
- **Service:** the business rules, with no `req` or `res`.
  `packages/order-service/src/services/orderService.ts:47` writes the order, its items and the outbox event in
  one transaction (line 60).
- **Data access:** the knex or mongoose connection and schema in `models/`.
  `packages/order-service/src/models/orderModel.ts`

A service never imports Express, and a controller never runs a query.

### Adapter and strategy: assistant model providers

`AssistantProvider` (`packages/assistant-service/src/agent/providers/types.ts:36`) is the strategy interface:
"run one turn with these tools". Two adapters implement it over different model APIs:

- `anthropicProvider`: `packages/assistant-service/src/agent/providers/anthropic.ts:138`;
- `openaiCompatibleProvider`: `packages/assistant-service/src/agent/providers/openaiCompatible.ts:237`.

`runAgent.ts` picks one at startup from `ASSISTANT_PROVIDER` (`packages/assistant-service/src/agent/runAgent.ts:17`
and line 24). Tools are written once against the provider-neutral `AssistantTool`
(`packages/assistant-service/src/agent/toolTypes.ts:22`). Each adapter converts them to its own API, e.g.
`betaZodTool` in `anthropic.ts:26`. To add a model API, write a new adapter; don't add `if (provider === …)`
branches elsewhere.

### Observer: saga event handlers

`startSagaConsumer` (`packages/shared/src/kafka.ts`) owns subscribing, retrying and reading messages. Each service
registers its reaction as an `onMessage` callback (`packages/shared/src/kafka.ts:114`, called at line 155):

- notification: `packages/notification-service/src/events/consumer.ts:67`;
- inventory: `packages/inventory-service/src/events/consumer.ts:26`.

Services subscribe to topics and never call each other for saga steps, so a new reaction to an event is a new
handler, not a change to the producer.

### Factory functions

The repo builds configured objects with plain functions, not classes or a DI container:

- `createKafkaClient` and `createProducer`: `packages/shared/src/kafka.ts:15` and `:33`;
- `createLogger`: `packages/shared/src/logger.ts:11`;
- assistant tools are built per request, bound to the caller: `buildHandoffTool`
  (`packages/assistant-service/src/agent/handoffTool.ts:22`), with `defineTool`
  (`packages/assistant-service/src/agent/toolTypes.ts:33`) for type inference.

Prefer a factory function that takes its settings as parameters. Read `process.env` in the factory's defaults or in
`config.ts`, not deep inside the logic.

### Saga (choreography) and outbox

Checkout is a choreographed saga: order → inventory → payment → order, coordinated only by Kafka events whose
payloads live in `packages/shared/src/events.ts`.

- **Outbox:** the order and its `order.created` event are written in one transaction
  (`packages/order-service/src/services/orderService.ts:92`). A relay publishes them afterwards
  (`packages/order-service/src/events/producer.ts:13`), so a crash can't lose the event or publish it without
  the order.
- **Idempotent handlers:** each handler skips an event ID it has already processed
  (`packages/inventory-service/src/events/sagaHandlers.ts:29`, used at line 53). Payment derives its outcome event
  ID from the incoming one with `uuidV5`, so a redelivery republishes the same event
  (`packages/payment-service/src/events/sagaHandlers.ts:38`).
- **State machine as the gate:** what an event means for an order is a pure function
  (`packages/order-service/src/services/sagaTransitions.ts:20`). Every change still goes through
  `updateOrderStatus` and `canTransitionOrder` (`packages/shared/src/events.ts:59`).

### Dependencies injected through parameters

Code with time, randomness or I/O in its core takes it as an optional parameter with the real default, so tests
pass a fake and no mocking library is needed:

- `startSagaConsumer`'s `createKafka` and `sleep`: `packages/shared/src/kafka.ts:116` and `:118`;
- `processPayment`'s `draw`: `packages/payment-service/src/services/paymentService.ts:25` (default `Math.random`).

## Clean-code rules

### 1. Pure core, thin I/O shell

Put decisions in pure functions; keep the code that talks to Kafka, HTTP or a database thin around them.

- **Example:** `nextTransitions` (`packages/order-service/src/services/sagaTransitions.ts:20`) only decides. The
  consumer loads the order, calls it (`packages/order-service/src/events/consumer.ts:63`) and applies each step
  (line 70). The decision is tested without Kafka or a database.
- **Counter-example:** `rateLimiter` keeps its counts in a module-level map
  (`packages/api-gateway/src/middleware/rateLimiter.ts:14`) and decides inside the middleware (line 27), so the
  window logic can only be tested through Express.

### 2. Small, flat functions with one job

A function does one thing. Keep nesting (loops, conditionals, callbacks) to **at most 3 levels** inside a
function; return early with guard clauses instead of wrapping the happy path in `if`s.

- **Example:** `requireUserId` (`packages/shared/src/identity.ts:15`) does one thing: return the caller's ID or
  throw 401. `requireInternalToken` returns early for the open cases first
  (`packages/shared/src/middleware/internalAuth.ts:32`), so the check that matters isn't nested.
- **Counter-example:** `getAllProducts` parses `page` and `limit` inline, three times
  (`packages/product-service/src/services/productService.ts:53`). Parse once into named numbers, or in a helper.
  The crash handler inside `startSagaConsumer`'s retry loop sits 4 levels deep (loop → `try` → callback → `if`;
  `packages/shared/src/kafka.ts:173`). A named `restartOnCrash` function would flatten it.

### 3. Names that say intent

A name tells the reader what something holds or does, without reading its body. Match the conventions this repo
already uses:

| What | Convention | Repo example | Avoid |
| --- | --- | --- | --- |
| Variables, properties | camelCase noun that names the content | `outcomeEventId`, `cartItem` | `data`, `temp`, `flag`, `cnt` |
| Functions | camelCase verb + noun | `createOrder`, `releaseStock`, `parseOrderCreated` | `process`, `handle`, `doStuff` |
| Booleans and predicates | `is` / `has` / `can` / `should` | `isUuid`, `canTransitionOrder`, `isConfigured` | `valid`, `check` |
| Constants | UPPER_SNAKE_CASE with the unit | `TIMEOUT_MS`, `MAX_RETRY_DELAY_MS` | `CART_TTL` (unit only in a comment) |
| Enums | PascalCase name, UPPER_SNAKE_CASE members | `OrderStatus.CONFIRMED`, `KafkaTopics.ORDER_CREATED` | |
| Classes, interfaces, types | PascalCase noun, no `I` prefix | `SagaEnvelope`, `RequestContext`, `NotFoundError` | `IProduct` |
| Packages and folders | kebab-case | `order-service`, `spec-dashboard` | |
| Source files | camelCase, named after their main export; React components PascalCase | `orderService.ts`, `CartPanel.tsx` | `Order_Service.TS` |

Abbreviations are fine only when universal (`id`, `url`, `db`, `ctx`, `trx`).

- **Example:** `canTransitionOrder(from, to)` (`packages/shared/src/events.ts:59`), `alreadyProcessed(eventId)`
  (`packages/inventory-service/src/events/sagaHandlers.ts:29`) and `isOrderOwnedBy`
  (`packages/payment-service/src/clients/orderClient.ts:15`) read as the question they answer.
- **Counter-examples:**
  - `ipMap` and `record` (`packages/api-gateway/src/middleware/rateLimiter.ts:14`, `:27`) say what they are,
    not what they hold; `requestCountsByIp` and `window` would say more.
  - `const valid = await bcrypt.compare(…)` (`packages/auth-service/src/services/authService.ts:92`) →
    `isPasswordCorrect`.
  - `reader` (`packages/shared/src/events.ts:131`) is a function named like a noun → `createFieldReader`.
  - `IProduct` (`packages/product-service/src/models/productModel.ts:8`) uses the `I` prefix → `ProductDocument`.

### 4. No `any` in new code

Use the real type, `unknown` with a check, or a narrow interface.

- **Example:** event payloads arrive as `unknown` and are validated into typed data by the shared parsers
  (`parseOrderCreated`, `packages/shared/src/events.ts`). `bodyOf` returns `unknown`
  (`packages/shared/src/request.ts:11`).
- **Counter-example:** `let producer: any` (`packages/order-service/src/events/producer.ts:5`) and `trx: any`
  (`packages/inventory-service/src/services/inventoryService.ts:44`); `Producer` from kafkajs and `Knex.Transaction`
  fit.

### 5. Errors are the shared `AppError`s

Throw `NotFoundError`, `ValidationError`, `ConflictError` or `UnauthorizedError` from `@ecommerce/shared` and let
the error handler answer. Don't build error responses by hand.

- **Example:** `if (!stock) throw new NotFoundError('Stock')`
  (`packages/inventory-service/src/services/inventoryService.ts:19`).
- **Counter-example:** `getProfile` answers `res.status(401).json(...)` itself
  (`packages/auth-service/src/controllers/authController.ts:128`), where `requireUserId` would throw the same 401
  through the handler. (Controllers' Joi 400s are written inline the same way today, and are pinned by tests;
  change them together if you change them.)

### 6. No magic numbers

Give a number a named constant whose name carries the unit (`_MS`, `_SECONDS`, `_BYTES`).

- **Example:** `MAX_RETRY_DELAY_MS = 30_000` (`packages/shared/src/kafka.ts:129`), `TIMEOUT_MS = 3000`
  (`packages/payment-service/src/clients/orderClient.ts:4`), `ASSISTANT_TIMEOUT_MS`
  (`packages/api-gateway/src/proxy.ts:22`).
- **Counter-examples:** the turn lock's `'EX', 360`
  (`packages/assistant-service/src/store/conversationStore.ts:57`) and `sessionTimeout: 30000`
  (`packages/shared/src/kafka.ts:53`) have no name. `CART_TTL = 86400 * 7; // 7 days`
  (`packages/cart-service/src/services/cartService.ts:24`) and `CACHE_TTL = 300`
  (`packages/product-service/src/services/productService.ts:36`) hide the unit → `CART_TTL_SECONDS`.

## Structure

### 7. Small files

Aim for **100–200 code lines** per file (comments and blank lines don't count). **300 is the hard limit**: a file
that grows past it is split along its responsibilities before more is added. Tests may be longer.

**Enforced by `npm run check`** (`scripts/check-size.mjs`, rule in `scripts/lib/sizeCheck.mjs`): a file over 300
code lines fails the check; one over 200 is listed as a warning.

- **Measured 2026-10-25:** all 113 source files are within 200 code lines (101 are within 100, 12 between 101 and
  200, none above), so the limit holds today. The largest is
  `packages/assistant-service/src/agent/providers/openaiCompatible.ts`.
- **When splitting:** move a cohesive group out (a parser, a mapper, one provider's message conversion) into its
  own file next to it, not into a generic `utils.ts`.

### 8. One responsibility per file

A file holds one thing: one service's operations, one controller's handlers, one adapter, one component. The
supporting types sit next to what uses them. A file may export several functions when they are the same
responsibility (the handlers of one router; the operations of one service).

- **Example:** each service's `orderController.ts` / `orderService.ts` / `orderModel.ts` / `orderRoutes.ts` split
  (`packages/order-service/src/`); one provider per file in `packages/assistant-service/src/agent/providers/`.
- **Deliberate exception:** `packages/shared/src/events.ts` keeps every saga topic, payload and parser together,
  because it is the one contract producers and consumers share (Constitution V). Contract modules like it, and
  `index.ts` barrels, are the only files that collect many unrelated exports.
- **Counter-example:** `packages/frontend/src/api/client.ts` exports 14 things: the Axios clients, the token
  and sign-out state, and the refresh logic. They are three responsibilities and would read better as three files.

## Comments

### 9. Comments say why, not what

- **Example:** "Parse bodies only after proxy routes have forwarded them."
  (`packages/api-gateway/src/index.ts:30`) explains an ordering that looks wrong. `bodyOf`'s doc says why it
  exists (Express 5 and Joi; `packages/shared/src/request.ts:7`).
- **Counter-example:** `// Health check endpoint` (`packages/api-gateway/src/index.ts:33`) and
  `// Check for existing user` (`packages/auth-service/src/services/authService.ts:66`) repeat the next line.

## Distributed-system rules

The services are deployed and fail independently, and talk through HTTP and Kafka. These rules keep that
debuggable and safe to change.

### 10. Carry the correlation ID across every hop, and log with it

Every request gets one ID. Each HTTP call and Kafka message passes it on, and every log line carries it, so you
can follow one shopper's action through every service's logs (filter on `correlationId`).

- **Example:** the chain is unbroken from the browser to the consumers:
  - set or reused on entry: `correlationId` middleware (`packages/shared/src/middleware/correlationId.ts:21`);
  - bound to the request's logger: `req.log = logger.child({ correlationId })`
    (`packages/auth-service/src/index.ts:25`; the same in every service);
  - forwarded by the gateway (`packages/api-gateway/src/proxy.ts:46`) and by the assistant's service calls
    (`packages/assistant-service/src/clients/serviceClient.ts:39`);
  - put on each Kafka message as the `correlation-id` header (`packages/shared/src/kafka.ts:82`);
  - read back for each consumed message (`packages/shared/src/kafka.ts:152`) and passed to the handler.
- **Counter-examples:**
  - the outbox relay sends `order.created` with `'correlation-id': event.aggregate_id`, the order ID
    (`packages/order-service/src/events/producer.ts:48`), so the checkout request's ID ends at the outbox. A fix
    stores the request's correlation ID on the outbox row.
  - the migrations log with `console.log('Created users table')`
    (`packages/auth-service/src/models/userModel.ts:41`): plain text, outside the JSON log stream. Use the
    service's pino logger.

Distributed tracing with OpenTelemetry is planned for later (backlog). Until then, correlation IDs and structured
logs are the tracing.

### 11. Check configuration at startup and fail fast

A setting with a safe local default (a host, a port, a pool size) may fall back to it. A setting without one (a
secret, a provider name, an API key in production) is validated when the service starts, and a bad or missing
value stops the process with an error naming the variable, instead of failing on the first request or running
with an unsafe value. Read settings in one place (`config.ts`, or the factory's defaults) and validate them there
with the schema library the package already has (Joi in the services, zod in the assistant).

- **Example:** an unknown `ASSISTANT_PROVIDER` throws at startup with the allowed values
  (`packages/assistant-service/src/agent/runAgent.ts:26`).
- **Counter-example:** `JWT_SECRET` falls back to a hard-coded string (`packages/shared/src/jwt.ts:7`). A
  deployment that forgets the variable runs with a guessable secret instead of refusing to start.

### 12. Every outbound call has a timeout; retry only what is transient

- **Timeouts:** each HTTP call, database query, Redis command and Kafka request has an explicit, named timeout,
  so a slow dependency fails the request instead of hanging it.
- **Retries:** retry only transient failures (connection refused, timeout), with exponential backoff and a cap.
  Never retry a 4xx or a validation error. Retried writes must be idempotent.
- **Circuit breakers:** not used today (feature 005 removed the unused `opossum`). A breaker for the gateway's
  proxies is in the backlog; add one there, not ad hoc in a service.

- **Examples:** `fetch(…, { signal: AbortSignal.timeout(TIMEOUT_MS) })`
  (`packages/payment-service/src/clients/orderClient.ts:25`) and the assistant's
  `AbortSignal.timeout(config.serviceTimeoutMs)` (`packages/assistant-service/src/clients/serviceClient.ts:47`).
  Backoff: `retryDelay` doubles from 1 s and stops at 30 s (`packages/shared/src/kafka.ts:130`).
- **Counter-examples:** the gateway sets a proxy timeout only for the assistant
  (`packages/api-gateway/src/proxy.ts:39`); the cart proxy (`packages/api-gateway/src/proxy.ts:86`) and the other
  services' proxies have none. The cart's Redis client (`packages/cart-service/src/services/cartService.ts:19`)
  sets no command timeout.

### 13. A bad message must not stop the consumer

A saga handler deals with one message. `startSagaConsumer` catches what a handler throws, logs it with the topic
and correlation ID, and moves on (`packages/shared/src/kafka.ts:156`). An unparseable or invalid payload is
rejected by the shared parser with a `ValidationError` naming the field. So a poison message never blocks a
partition, and the handler code doesn't need its own try/catch for that.

- **Example:** `handleNotificationEvent` parses with the shared parsers and logs a payload it can't read, with
  IDs only (`packages/notification-service/src/events/consumer.ts`).
- **Target, not built yet:** a message that still fails after a few retries goes to a **dead-letter topic**
  (`<topic>.dlq`) with the error, instead of only to the logs (backlog). Today there is no dead-letter topic and
  no retry for a temporary failure, so that saga step is lost and the order stays in its current status. Until
  the dead-letter topic exists, a handler that can fail temporarily must leave its work undone and stay
  idempotent, so the step can be finished by replaying the topic (resetting the consumer group's offset) or by
  hand.

### 14. Evolve event payloads additively; version breaking changes

Producers and consumers deploy separately, so a payload change must work with the old and the new code at once.

- Add new fields as **optional**, and make consumers cope when they are missing.
- Don't rename or remove a field, or make an optional field required, until every consumer has been changed and
  redeployed. Then remove it in a second change.
- A new value in a closed set (a new cancel reason, a new event type) is **not** additive: old consumers reject
  it. Deploy the consumers first.
- A change that can't be additive gets a **new versioned topic** (`order.created.v2`) and a new parser.
  The producer publishes both until every consumer has moved, then the old one is retired.
- Change the producer, every consumer and `packages/shared/src/events.ts` together (Constitution V).

- **Example:** `SagaItem`'s `productName` and `price` are optional (`packages/shared/src/events.ts:79`), and the
  parsers return only the fields they know, so an old consumer ignores a new field. No breaking change has been
  needed yet, so no topic has a version suffix.
- **Counter-example (the closed-set case):** `parseInventoryRejected` accepts only `reason: 'OUT_OF_STOCK'`
  (`packages/shared/src/events.ts:191`). Adding a second reason in the producer first would make order-service
  drop those events.

### 15. Contract-test every event

Each event has a shared parser, and each parser has a test of the contract: a complete payload passes, and each
required field missing or wrong is rejected (`packages/shared/src/events.test.ts:84`, one case per event). A
payload change updates that test in the same change, so a mismatch fails `npm run check` instead of a
checkout in production. A consumer's own test feeds it payloads in the same shape
(`packages/notification-service/src/events/consumer.test.ts`).

## Documentation

### 16. JSDoc on every file and export

Enforced by `npm run check` (`scripts/check-docs.mjs`, rule in `scripts/lib/docCheck.mjs`):

- every non-test `.ts`/`.tsx` file under `packages/*/src` starts with a `/** … */` header saying what the file is
  for;
- every exported function, class, constant, interface, type and enum has a `/** … */` block right above it (no
  blank line or decorator in between, and not the file header).

**Content:** say what the item is for, and why when that isn't obvious. Add `@param` or `@returns` only when the
name and type don't already say it; add `@throws` for the `AppError`s a service function throws.

- **Example:** `RequestContext` (`packages/assistant-service/src/context.ts:9`) says who it is for and why the
  model can't change it.
- **Counter-example** (made up; the repo has none since T081): `/** Gets the cart. */` above `getCart` repeats
  the name. Say what the caller needs to know instead: "`GET /`: the user's cart, empty if they have none."
  (`packages/cart-service/src/controllers/cartController.ts:20`).
