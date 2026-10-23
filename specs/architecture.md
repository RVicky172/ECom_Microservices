# mercato — E-Commerce Microservices Platform — Architecture

> How the code is organised and the contracts between its parts. Read before touching shared code or adding a
> module. Each feature's verify step updates this file with what it established.

**Last updated:** 2026-10-23

## Directory Layout

```
Microservices/
├── packages/
│   ├── shared/               # events/topics, errors, JWT, Kafka, logger, Express middleware
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
├── scripts/                  # DB init, seed data, check.mjs (fast gate)
├── specs/ · memory/          # spec-driven workflow and project memory; specs/*.json = tracking state
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

### Checkout saga (Kafka, choreography)

`order.created` (via the order outbox) → inventory reserves → `inventory.reserved` | `inventory.rejected` →
payment → `payment.completed` | `payment.failed` → order `CONFIRMED` | `CANCELLED`; notification consumes events.
Topic and event names: `packages/shared/src/events.ts`. Known gap: the `inventory.reserved` payload lacks the
amount/items the payment consumer expects (roadmap 010).

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
- **Validation:** Joi in existing services; Zod in the assistant service.
- **Configuration:** environment variables with safe local defaults; every variable is listed in `.env.example`.
- **Logging:** `createLogger(<service>)` (Pino JSON) with `correlationId` on every request log; never log
  secrets, tokens or full chat text.
- **Identity:** read the user ID only from `x-user-id`; any read of a user-owned record by ID checks ownership.
- **Docs:** each package has a `README.md` learning guide; update it when routes, env vars or behaviour change.
- **TypeScript:** JSDoc on exported functions and components; match the surrounding code's style.
