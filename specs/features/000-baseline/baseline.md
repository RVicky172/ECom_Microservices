# 000 — Baseline (point-in-time record)

**Describes:** commit `e9685bf` on `main` · **Written:** 2026-10-23 · **Spec:** `./spec.md`

What the platform is and does before any spec-driven feature changes it. This file is not kept up to date; the
living overview is `specs/architecture.md`. Later features diff against this record.

## Services

Source: `docker-compose.yml`, `packages/*/src/index.ts`, `packages/*/src/models/*`,
`cart-service/src/services/cartService.ts`, `product-service/src/services/productService.ts`,
`assistant-service/src/store/*`, `packages/*/src/events/*`.

| Package | Port | Data store | Kafka | Responsibility |
| ------- | ---- | ---------- | ----- | -------------- |
| `api-gateway` | 4000 | none (rate-limit counters in process memory) | — | Only public API: CORS, CSRF, rate limit, Bearer JWT check, reverse proxy, adds identity + internal-token headers |
| `auth-service` | 4001 | PostgreSQL `auth_db` | — | Register, login, access JWT, rotating refresh cookie, profile |
| `product-service` | 4002 | MongoDB `product_db`; Redis `product:{id}`, `products:list` (cache-aside) | — | Product catalog CRUD |
| `cart-service` | 4003 | Redis `cart:{userId}` | — | Per-user cart |
| `order-service` | 4004 | PostgreSQL `order_db` (`orders`, `order_items`, `outbox_events`) | produces `order.created` (outbox relay, 2 s poll); consumes `inventory.*`, `payment.*` | Orders, state machine, transactional outbox |
| `inventory-service` | 4005 | PostgreSQL `inventory_db` (incl. `processed_events`) | consumes `order.created`, `payment.*`; produces `inventory.*` | Stock levels, atomic reservation, release and finalize |
| `payment-service` | 4006 | PostgreSQL `payment_db` (incl. `idempotency_keys`) | consumes `inventory.reserved`; produces `payment.*` | Simulated payments (random success rate), idempotency keys |
| `notification-service` | 4007 | none (processed event IDs in process memory) | consumes `order.created`, `payment.*`, `order.shipped` | Logs notification "emails" |
| `assistant-service` | 4008 | Redis `assistant:conv:*`, `assistant:lock:*`, `assistant:rate:*` | — | AI shopping assistant: model tool loop, SSE replies |
| `frontend` | 3000 | none (browser) | — | React + Vite SPA |
| `shared` | — | — | defines topics and event types | Library: events, errors, JWT, Kafka client, logger, middleware |

No service opens another service's database or Redis keys (constitution §V holds). Cross-service reads go over
HTTP: the assistant calls product, cart, order, inventory and payment APIs.

## API routes

Source: `api-gateway/src/proxy.ts`, `api-gateway/src/middleware/auth.ts`, `packages/*/src/routes/*.ts`,
`packages/*/src/index.ts`. Auth: **public** = no token; **user** = gateway requires a valid Bearer JWT and
forwards `x-user-*`; **internal** = no gateway route, reachable only from inside the network (and from the host
through published ports). `/health` (9 backend services) is open on every service and not listed here.

| Method | Path | Service | Auth | Purpose |
| ------ | ---- | ------- | ---- | ------- |
| POST | `/api/v1/auth/register` | auth | public | Create account |
| POST | `/api/v1/auth/login` | auth | public | Issue access JWT + refresh cookie |
| POST | `/api/v1/auth/refresh` | auth | public (refresh cookie) | Rotate refresh token, new access JWT |
| POST | `/api/v1/auth/logout` | auth | public (refresh cookie) | Revoke refresh token |
| GET | `/api/v1/auth/profile` | auth | user | Current user's profile |
| GET | `/api/v1/products` | product | public | List / search products |
| GET | `/api/v1/products/:id` | product | public | One product |
| POST | `/api/v1/products` | product | **public** | Create product (gap G5) |
| PUT | `/api/v1/products/:id` | product | **public** | Update product (gap G5) |
| DELETE | `/api/v1/products/:id` | product | **public** | Delete product (gap G5) |
| GET | `/api/v1/cart` | cart | user | Own cart |
| POST | `/api/v1/cart/items` | cart | user | Add item (client sends price, gap G7) |
| PUT | `/api/v1/cart/items/:id` | cart | user | Change quantity |
| DELETE | `/api/v1/cart/items/:id` | cart | user | Remove item |
| DELETE | `/api/v1/cart` | cart | user | Clear cart |
| POST | `/api/v1/orders` | order | user | Create order (client sends prices, gap G8) |
| GET | `/api/v1/orders` | order | user | Own orders |
| GET | `/api/v1/orders/:id` | order | user | Any order by ID, no owner check (gap G1; closed by 002, 2026-10-23) |
| GET | `/api/v1/payments/:orderId` | payment | user | Any payment by order ID, no owner check (gap G2; closed by 002, 2026-10-23) |
| POST | `/api/v1/assistant/chat` | assistant | user | Send a message; reply streams as SSE (5 min proxy timeout) |
| GET | `/api/v1/assistant/conversations/:id` | assistant | user | Own conversation history |
| DELETE | `/api/v1/assistant/conversations/:id` | assistant | user | Delete own conversation |
| GET | `/api/v1/inventory/:productId` | inventory | internal | Stock level (used by the assistant) |
| PUT | `/api/v1/inventory/:productId` | inventory | internal | Set stock |

24 rows = 24 `router.<verb>` registrations (T005).

## Frontend pages

Source: `frontend/src/routes/router.tsx`, `paths.ts`, `RequireAuth.tsx`.

| Path | Page | Login required |
| ---- | ---- | -------------- |
| `/login` | `LoginPage` | no |
| `/` | redirect → `/catalog` | yes |
| `/catalog` | `CatalogPage` | yes |
| `/cart` | `CartPage` | yes |
| `/orders` | `OrdersPage` | yes |
| `*` | redirect → `/catalog` | — |

Logged-in pages render inside `StoreLayout` (sidebar + header); the assistant is a launcher + side panel there
(`components/assistant/*`), not a route.

## Kafka events

Source: `shared/src/events.ts`; producers `order-service/src/services/orderService.ts:76`,
`order-service/src/events/producer.ts`, `inventory-service/src/events/consumer.ts:96,110`,
`payment-service/src/events/consumer.ts:33,42`; consumers in `*/src/events/consumer.ts`. Every message is
`{ eventId, eventType, aggregateId, data, timestamp }` with headers `correlation-id`, `event-type`; the table
lists `data`.

| Topic | Producer | Consumers | `data` sent | Fields read | Match? |
| ----- | -------- | --------- | ----------- | ----------- | ------ |
| `order.created` | order (outbox, `orderService.ts:76`) | inventory, notification | `orderId, userId, items[{productId, productName, price, quantity}], totalAmount` | inventory: `orderId, items[].productId, quantity` | ✅ |
| `inventory.reserved` | inventory (`consumer.ts:96`) | order, payment | `orderId` | order: `orderId`; payment: `orderId, totalAmount, items` | ❌ G3 |
| `inventory.rejected` | inventory (`consumer.ts:110`) | order | `orderId, reason` | `orderId` | ✅ |
| `payment.completed` | payment (`consumer.ts:33`) | order, inventory, notification | `orderId, items` (items forwarded from `inventory.reserved`, so `undefined`) | order: `orderId`; inventory: `items[]` | ❌ G4 |
| `payment.failed` | payment (`consumer.ts:42`) | order, inventory, notification | `orderId, items, reason` (`items` undefined) | order: `orderId`; inventory: `items[]` | ❌ G4 |
| `order.shipped` | none (relay maps `ORDER_SHIPPED`, but nothing writes it) | notification (subscribed, no handler) | — | — | ⚠️ G9 |

Unused event types: `ORDER_CONFIRMED` and `ORDER_CANCELLED` are defined but never sent. Idempotency: inventory
(`processed_events` table) and payment (`idempotency_keys`) are durable; notification keeps seen IDs in memory;
order has none and relies on state-machine checks (G10).

(G3 and G4 closed by 010 on 2026-10-23; the rows above are the original record.) Effect at the time: payment inserts `amount = undefined` into a `NOT NULL` column, the error is logged and no payment
event is sent, so orders stop at `INVENTORY_RESERVED` (G3).

## Pre-SDD work

### Frontend

Source: `frontend/src/routes/*`, `hooks/useSession.ts`, `api/storeApi.ts`, `api/assistantApi.ts`.
React Router data router (pages above), `RequireAuth` guard with return-to redirect, RTK Query for store data,
session from the access JWT with refresh-cookie rotation, and an assistant panel that reads SSE events.

### Assistant service

Source: `assistant-service/src/agent/tools.ts`, `clients/storeClients.ts`, `config.ts`, `agent/runAgent.ts`,
`agent/providers/*`, `.env.example`.

| Tool | Reads | Calls | Kind |
| ---- | ----- | ----- | ---- |
| `search_products` | catalog, filtered in memory | product `GET /products?limit=200` | read |
| `get_product` | one product | product `GET /products/:id` | read |
| `check_stock` | availability bucket | inventory `GET /inventory/:productId` | read |
| `get_cart` | caller's cart | cart `GET /cart` | read |
| `list_orders` | caller's 10 newest orders | order `GET /orders` | read |
| `get_order` | one order (full ID or prefix) + payment, `user_id` checked in the tool | order `GET /orders` (prefix match), `GET /orders/:id`; payment `GET /payments/:orderId` | read |
| `propose_add_to_cart` | — | product `GET /products/:id`; emits a `proposal` event the user confirms in the UI | proposal |

Providers, chosen by `ASSISTANT_PROVIDER` (default `anthropic`; an unknown value fails at start-up):

- `anthropic` — Claude via `@anthropic-ai/sdk`; `ANTHROPIC_API_KEY`, `ASSISTANT_EFFORT`, model default
  `claude-opus-5-5` (`ASSISTANT_MODEL` overrides).
- `openai-compatible` — e.g. LM Studio via `openai`; `ASSISTANT_OPENAI_BASE_URL`, `ASSISTANT_OPENAI_API_KEY`,
  `ASSISTANT_TEMPERATURE`, `ASSISTANT_OPENAI_TIMEOUT_MS`; model = the loaded one unless `ASSISTANT_MODEL` is set.

Shared limits: `ASSISTANT_MAX_ITERATIONS` (8), `ASSISTANT_USER_MSGS_PER_HOUR` (30, Redis counter).

### Internal service token

Source: `shared/src/middleware/internalAuth.ts`, `api-gateway/src/proxy.ts`, `assistant-service/src/clients/serviceClient.ts`.

- Header `x-internal-token`. The gateway strips any client-sent value and, when `INTERNAL_SERVICE_TOKEN` is
  set, adds it to every proxied request; the assistant adds it to its service calls.
- `requireInternalToken` runs on auth, product, cart, order, inventory, payment and assistant (not
  notification, which has only `/health`).
- **Unset** (the `.env.example` default): every request is accepted. **Set**: requests without a matching token
  (constant-time compare) get 401 "Internal service token required". `/health` is always open.
- This environment: `.env` sets the token. Measured 2026-10-23: direct `GET :4004/api/v1/orders` with a forged
  `x-user-id` → 401; direct `PUT :4005/api/v1/inventory/x` → 401; gateway `GET /api/v1/orders` without JWT → 401.

## Known gaps

Source: the sections above. Owner is a roadmap feature or a backlog item in `specs/roadmap.md`.

| # | Gap | Evidence | Impact | Owner |
| - | --- | -------- | ------ | ----- |
| G1 | `GET /orders/:id` has no owner check | `order-service/src/routes/orderRoutes.ts:8` | Any user reads any order | 002 — **closed 2026-10-23**: non-owners get 404 |
| G2 | `GET /payments/:orderId` has no owner check | `payment-service/src/routes/paymentRoutes.ts:6` | Any user reads any payment | 002 — **closed 2026-10-23**: ownership checked via the order service |
| G3 | `inventory.reserved` sends only `orderId`; payment needs `totalAmount`, `items` | `inventory-service/src/events/consumer.ts:100`, `payment-service/src/events/consumer.ts:21` | Checkout stops at `INVENTORY_RESERVED` | 010 — **closed 2026-10-23**: full payload |
| G4 | `payment.*` carry `items: undefined`; inventory finalize/release loops over them | `payment-service/src/events/consumer.ts:37,46`, `inventory-service/src/events/consumer.ts:125,142` | Stock never finalized or released (hidden by G3) | 010 — **closed 2026-10-23**: items carried |
| G5 | Product writes are public; `PUT` body is not validated | `api-gateway/src/proxy.ts`, `product-service/src/controllers/productController.ts:48` | Anyone can change the catalog | backlog |
| G6 | Rate limiter is per process, in memory | `api-gateway/src/middleware/rateLimiter.ts:13` | Limits reset on restart, not shared | backlog |
| G7 | Cart trusts the client's price | `cart-service/src/controllers/cartController.ts:8` | Client sets its own price | backlog |
| G8 | Order total is computed from client-sent prices | `order-service/src/controllers/orderController.ts:18`, `services/orderService.ts:51` | Client sets what it pays | backlog |
| G9 | `order.shipped` has no producer and no handler | `order-service/src/events/producer.ts:76`, `notification-service/src/events/consumer.ts:16` | Shipping never notified | backlog |
| G10 | Order consumer has no idempotency; notification's is in memory | `order-service/src/events/consumer.ts`, `notification-service/src/events/consumer.ts` | Replays rely on state checks; duplicate notifications after restart | backlog |
| G11 | `.env.example` ships `INTERNAL_SERVICE_TOKEN` empty while service ports are published on the host | `.env.example:58`, `docker-compose.yml` ports 4001–4008 | A fresh clone runs unprotected (anyone reaching a port can send `x-user-id`). Not the case here: `.env` sets the token and direct calls get 401 (measured 2026-10-23) | backlog |
| G12 | Assistant not yet checked on a live model | `memory/MEMORY.md` | Behaviour on a real model unproven | 012 |

## Health measurement

Source: `docker compose down` (volumes kept), then `docker compose up -d --build --wait` (exit 0), then `curl`
per service. Measured 2026-10-23T15:31:47Z on commit `e9685bf` (working tree had only spec/memory changes).

| Service | URL | HTTP status | Result |
| ------- | --- | ----------- | ------ |
| api-gateway | `http://localhost:4000/health` | 200 | ✅ |
| auth-service | `http://localhost:4001/health` | 200 | ✅ |
| product-service | `http://localhost:4002/health` | 200 | ✅ |
| cart-service | `http://localhost:4003/health` | 200 | ✅ |
| order-service | `http://localhost:4004/health` | 200 | ✅ |
| inventory-service | `http://localhost:4005/health` | 200 | ✅ |
| payment-service | `http://localhost:4006/health` | 200 | ✅ |
| notification-service | `http://localhost:4007/health` | 200 | ✅ |
| assistant-service | `http://localhost:4008/health` | 200 (`provider: openai-compatible`) | ✅ |
| frontend | `http://localhost:3000/` | 200 | ✅ (D-006: no `/health`) |

`api-gateway`, `notification-service` and `frontend` have no compose health check, so `docker compose ps` shows
them as running, not healthy. The checks above do not call a model.
