# mercato — E-Commerce Microservices Platform — Architecture

> How the code is organised and the contracts between its parts. Read before touching shared code or adding a
> module. Each feature's verify step updates this file with what it established.

**Last updated:** 2026-10-23

Point-in-time record of every service, route, event and known gap at the start of SDD (commit `e9685bf`):
[`features/000-baseline/baseline.md`](features/000-baseline/baseline.md).

## Directory Layout

```
Microservices/
├── packages/
│   ├── shared/               # events/topics, errors, JWT, Kafka, logger, Express middleware, bodyOf, uuidV5
│   ├── api-gateway/          # :4000 the only public API: CORS, CSRF, rate limit, JWT, reverse proxy
│   ├── auth-service/         # :4001 users, login, access JWT + rotating refresh cookie (PostgreSQL)
│   ├── product-service/      # :4002 catalog (MongoDB) with Redis cache-aside
│   ├── cart-service/         # :4003 carts (Redis)
│   ├── order-service/        # :4004 orders, state machine, outbox → Kafka (PostgreSQL)
│   ├── inventory-service/    # :4005 stock and atomic reservation (PostgreSQL, Kafka)
│   ├── payment-service/      # :4006 simulated payments, idempotency keys (PostgreSQL, Kafka)
│   ├── notification-service/ # Kafka consumer, logs notifications
│   ├── assistant-service/    # :4008 AI shopping assistant: Claude or LM Studio, read-only tools (Redis)
│   └── frontend/             # :3000 React + Vite SPA (React Router, Redux Toolkit Query)
├── docs/                     # design documents (ai-shopping-assistant.md)
├── tools/spec-dashboard/     # :3100 local Next.js dashboard for specs/ and memory/ (own package, not a workspace)
├── scripts/                  # DB init, seed data, check.mjs (fast gate: typecheck, unit tests, JSDoc and size checks)
├── vitest.config.mts         # unit tests: one Vitest project per packages/* directory
├── specs/ · memory/          # spec-driven workflow and project memory; specs/*.json = tracking state
├── .github/dependabot.yml    # weekly npm (root, dashboard) and Docker update PRs (005)
├── docker-compose.yml        # full stack · docker-compose.infra.yml: infrastructure only
└── .env.example              # every environment variable, documented
```

## Main Modules and Contracts

### Request path

Browser → **API gateway** (`/api/v1/*`) → service. The gateway verifies the Bearer access JWT on protected routes,
strips any client-sent `x-user-*` headers, and forwards `x-user-id`, `x-user-email`, `x-user-role`,
`x-correlation-id` and (when configured) `x-internal-token`. Services trust identity only from these headers;
`requireInternalToken` (shared) rejects requests without the token when `INTERNAL_SERVICE_TOKEN` is set.

| Route prefix | Service | Auth at gateway |
| --- | --- | --- |
| `/api/v1/auth` | auth | public, except `/profile` |
| `/api/v1/products` | product | none (writes are not yet protected — backlog) |
| `/api/v1/cart`, `/orders`, `/payments` | cart, order, payment | Bearer JWT |
| `/api/v1/assistant` | assistant | Bearer JWT; streams Server-Sent Events |

Inventory has no gateway route; it is reached internally and through Kafka.

The gateway has **no circuit breaker** (005 removed the unused `opossum`; backlog). A stopped service answers
502 from the proxy's error handler, and only the assistant route sets a proxy timeout (`ASSISTANT_TIMEOUT_MS`).

### Checkout saga (Kafka, choreography)

`order.created` (via the order outbox) → inventory reserves → `inventory.reserved` | `inventory.rejected` →
payment → `payment.completed` | `payment.failed` → order `CONFIRMED` | `CANCELLED`; notification consumes events.
Topic names, event types **and payloads** live in `packages/shared/src/events.ts`. Producers build the payload
types and consumers read them through the shared parsers (`parseInventoryReserved`, …), so a missing field fails
loudly (feature 010; G3/G4 closed).

| Topic | Producer | Consumers | `data` |
| ----- | -------- | --------- | ------ |
| `order.created` | order (outbox) | inventory, notification | `orderId, userId, items[{productId, productName, price, quantity}], totalAmount` |
| `inventory.reserved` | inventory | order, payment | `orderId, userId, items, totalAmount` |
| `inventory.rejected` | inventory | order | `orderId, reason: 'OUT_OF_STOCK'` |
| `payment.completed` | payment | order, inventory, notification | `orderId, items, amount` |
| `payment.failed` | payment | order, inventory, notification | `orderId, items, amount, reason: 'PAYMENT_DECLINED'` |
| `assistant.handoff_requested` | assistant | notification | `reference, userId, conversationId, reason: 'customer_request' \| 'policy_not_covered' \| 'order_problem' \| 'other', summary (≤ 500 chars), requestedAt` (feature 011; not part of the saga, keyed by the reference) |

Rules:

- **Consumer start:** every saga consumer starts through shared `startSagaConsumer`. It ensures the topics exist,
  subscribes with `fromBeginning: true` and retries with backoff (1 s up to 30 s) instead of giving up. A service
  never runs without its consumer. `/health` reports `consumer: starting | running`.
- **Idempotency:** a duplicate event changes nothing:
  - inventory keeps `processed_events`;
  - payment keeps idempotency keys (`insert … on conflict do nothing`), and its outcome events reuse a v5 UUID
    derived from the incoming event ID;
  - order applies `nextTransitions(status, topic)`, which ignores late or duplicate events;
  - notification dedupes in memory.
- **Arrival order:** a payment event can reach order before `inventory.reserved`. The order then steps
  `PENDING → INVENTORY_RESERVED → CONFIRMED`.
- **Cancel reason:** cancelled orders store `cancel_reason` (`OUT_OF_STOCK` | `PAYMENT_DECLINED`), returned by the
  order API and shown in the storefront.

### Assistant

`assistant-service` runs a tool loop with the provider chosen by `ASSISTANT_PROVIDER` (`anthropic` |
`openai-compatible`). Tools (`src/agent/tools.ts`) are read-only wrappers over other services' HTTP APIs, bound to
the caller's user ID; cart changes are only proposed and confirmed by the user in the UI. Design:
`docs/ai-shopping-assistant.md`.

### Spec tracking and dashboard (004)

`specs/roadmap.json` and each `specs/features/NNN-name/feature.json` hold the tracking state (schemas:
`tools/spec-dashboard/lib/schema.ts`); the Markdown keeps the prose. `tools/spec-dashboard/lib/consistency.ts`
keeps them in agreement and runs as part of the root `npm run check`. The dashboard reads these files (and
`memory/*.md`) on each request, watches them for changes and pushes updates to open pages over Server-Sent
Events. It is read-only, binds to `127.0.0.1:3100`, and has its own dependencies outside the workspaces.

### Frontend

`App` → `RouterProvider`; `RequireAuth` guards `StoreLayout` routes (`/catalog`, `/cart`, `/orders`). Components
read data through RTK Query hooks in `src/api/storeApi.ts`; mutations invalidate tags. Session: `hooks/useSession.ts`.
Details: `packages/frontend/README.md`.

## Conventions

- **Service layout:** `src/index.ts` (Express app, `/health`), `routes/`, `controllers/` (validate input, read
  identity headers), `services/` (business logic), `models/` (data access), `events/` (Kafka). New services copy
  this layout, a `Dockerfile`, a compose entry with a health check, and a `README.md` learning guide.
- **Errors:** throw `AppError` subclasses from `@ecommerce/shared` (`NotFoundError`, `ValidationError`, …); the
  shared `errorHandler` turns them into `{ error: { code, message }, correlationId }`.
- **Validation:** Joi in existing services; Zod in the assistant service. On Express 5 a request without a body has
  `req.body === undefined`, which Joi accepts, so validate `bodyOf(req)` from `@ecommerce/shared` (`{}` when
  absent), never `req.body` directly (005).
- **Configuration:** environment variables with safe local defaults; every variable is listed in `.env.example`.
- **Logging:** `createLogger(<service>)` (Pino JSON) with `correlationId` on every request log; never log
  secrets, tokens or full chat text.
- **Identity:** read the user ID only from `x-user-id`, with `requireUserId(req)` from `@ecommerce/shared` (401
  when absent). Any read of a user-owned record by ID checks ownership and answers a non-owner with the same 404
  as a missing record. Malformed UUIDs also get 404 (`isUuid`), never a database error.
- **Ownership across services:** a service that needs to know who owns another service's record asks the owner
  over HTTP as the user (forwarded `x-user-id`, `x-correlation-id`, `x-internal-token`). Example: payment calls
  order `GET /orders/:id` before showing a payment (002).
- **Docs:** each package has a `README.md` learning guide; update it when routes, env vars or behaviour change.
- **TypeScript:** follow `specs/coding-standards.md`: a header on every file and JSDoc on every export, files
  within 300 code lines (both checked by `npm run check`), and match the surrounding code's style.
- **Tests:** unit tests live next to the code as `src/**/*.test.ts` (`specs/testing-strategy.md`). Each `tsc`-built
  package has `tsconfig.json` (typecheck, tests included) and `tsconfig.build.json` (build, tests excluded); its
  `build` script uses the latter. The root `.dockerignore` keeps `*.test.ts` out of images.
- **Order state machine:** check transitions with `canTransitionOrder(from, to)` from `@ecommerce/shared`, never by
  reading `VALID_ORDER_TRANSITIONS` inline.
- **IDs:** random IDs with `crypto.randomUUID()`; name-based (v5) IDs with `uuidV5` from `@ecommerce/shared`, e.g.
  payment's outcome event IDs (D-034). There is no `uuid` package.
- **Fast gate:** `npm run check` (`scripts/check.mjs`) runs the typechecks, the unit tests, the JSDoc check
  (`scripts/check-docs.mjs`), the file-size check (`scripts/check-size.mjs`) and the dashboard's tracking
  consistency, 15 checks in all (005).
- **Runtime:** Node 26 everywhere (`node:26-alpine` images, root `engines` `>=26.0.0`; D-009); TypeScript 7,
  dev servers on `tsx` (D-033).
