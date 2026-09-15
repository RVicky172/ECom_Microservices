# 🛒 E-Commerce Microservices Platform

A production-grade, event-driven e-commerce platform built with **Node.js microservices**, **Apache Kafka**, **Redis**, **PostgreSQL**, **MongoDB**, and a **React** frontend — all orchestrated locally with **Docker Compose**.

> **Purpose**: This is a learning/reference project that demonstrates real-world microservices patterns: Saga choreography, idempotency keys, outbox pattern, cache-aside, circuit breakers, atomic stock reservation, structured logging with correlation IDs, and more.

---

## 🏗️ Architecture

```
  Client Layer                  Edge Layer                 Service Layer

  ┌──────────────┐         ┌────────────────┐
  │ React + Vite │ HTTP    │  API Gateway   │
  │    :3000     ├────────►│ :4000          │
  └──────────────┘         │ JWT + rate     │
               │ limiting       │
               └───────┬────────┘
                    │ proxy
     ┌──────────────────────────┼──────────────────────────┐
     │                          │                          │
  ┌─────▼─────┐  ┌────────────┐  ┌▼───────────┐  ┌───────────▼──────┐
  │ Auth      │  │ Product    │  │ Cart       │  │ Order             │
  │ :4001     │  │ :4002      │  │ :4003      │  │ :4004             │
  └─────┬─────┘  └─────┬──────┘  └────┬───────┘  └───────────┬──────┘
     │              │              │                      │
  ┌─────▼─────┐  ┌─────▼──────┐  ┌────▼─────┐  ┌────────────▼──────┐
  │ Inventory │  │ Payment    │  │ Redis    │  │ Notification       │
  │ :4005     │  │ :4006      │  │ sessions │  │ :4007              │
  └─────┬─────┘  └─────┬──────┘  └──────────┘  └────────────┬──────┘
     │              │                                   │
     └──────────────┴──────────────┬────────────────────┘
                    │ events
               ┌───────▼────────┐
               │ Apache Kafka   │
               │ event backbone │
               └───────┬────────┘
                    │
    ┌──────────────────────────────┼──────────────────────────────┐
    │                              │                              │
  ┌────▼─────┐  ┌──────────────┐  ┌──▼─────────┐  ┌──────────────────┐
  │ Auth DB  │  │ Product DB   │  │ Order DB   │  │ Inventory/Payment│
  │ Postgres │  │ MongoDB      │  │ Postgres   │  │ PostgreSQL       │
  └──────────┘  └──────────────┘  └────────────┘  └──────────────────┘

  Checkout events: order.created -> inventory.reserved -> payment.completed
          inventory.rejected / payment.failed -> order.cancelled
```

Each service owns its data and communicates through the gateway for HTTP requests
and Kafka for asynchronous checkout events. Redis is shared by the cart service
and the product cache; PostgreSQL databases remain logically separated per service.

---

## 📦 Services

| Service | Port | Database | Description |
|---------|------|----------|-------------|
| **API Gateway** | 4000 | — | Reverse proxy, JWT validation, rate limiting, correlation IDs |
| **Auth Service** | 4001 | PostgreSQL | User registration, login, JWT issuance |
| **Product Service** | 4002 | MongoDB + Redis | Product catalog CRUD with cache-aside pattern |
| **Cart Service** | 4003 | Redis | Session-based shopping cart |
| **Order Service** | 4004 | PostgreSQL | Order lifecycle, state machine, outbox pattern |
| **Inventory Service** | 4005 | PostgreSQL | Stock management, atomic reservation |
| **Payment Service** | 4006 | PostgreSQL | Payment processing (simulated), idempotency keys |
| **Notification Service** | 4007 | — | Event consumer — logs email/SMS notifications |
| **Frontend** | 3000 | — | React + Vite SPA |

---

## 🛠️ Tech Stack

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20 LTS | Runtime for all services |
| TypeScript | 7.0.2 (root), 5.3.3 (workspace tooling) | Static typing and compilation |
| Express | 4.x | HTTP framework |
| KafkaJS | 2.x | Apache Kafka client (producer/consumer) |
| Knex.js | 3.x | SQL query builder + migrations (PostgreSQL) |
| Mongoose | 9.x | MongoDB ODM |
| ioredis | 5.x | Redis client |
| jsonwebtoken | 9.x | JWT sign/verify |
| bcryptjs | 2.x | Password hashing |
| Pino | 9.x | Structured JSON logging |
| Joi | 17.x | Request validation |
| opossum | 8.x | Circuit breaker |
| Axios | 1.x | HTTP client for inter-service calls |
| http-proxy-middleware | 3.x | API Gateway reverse proxy |
| express-rate-limit | 7.x | Rate limiting |
| uuid | 9.x | Correlation IDs, idempotency keys |

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18.3.1 | UI library |
| Vite | 5.4.1 | Build tool / dev server |
| TypeScript | 5.3.3 | Frontend type checking and build |
| React Router | 6.x | Client-side routing |
| Axios | 1.x | API calls |

### Infrastructure
| Technology | Version | Purpose |
|-----------|---------|---------|
| Docker | 24+ | Containerization |
| Docker Compose | 2.x | Local orchestration |
| Apache Kafka | 3.7 (KRaft) | Event streaming backbone (no Zookeeper) |
| PostgreSQL | 16 | Transactional databases |
| MongoDB | 7 | Product catalog database |
| Redis | 7 | Caching + cart sessions |

### Testing & Quality
| Technology | Purpose |
|-----------|---------|
| Jest | Unit & integration testing |
| Supertest | HTTP endpoint testing |
| ESLint | Linting |
| Prettier | Code formatting |

---

## 🚀 Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v24+)
- [Node.js](https://nodejs.org/) (v20 LTS) — only needed for local dev without Docker
- [Git](https://git-scm.com/)

### Run with Docker Compose (Recommended)

```bash
# Clone and enter the project
git clone <repository-url>
cd Microservices

# Create the local environment file
cp .env.example .env

# Install host dependencies (needed for seed/test/local development)
npm install

# Build and start the complete platform
docker compose up --build

# In a second terminal, seed products, inventory, and the development admin
docker compose exec order-service node /app/scripts/seed-data.js
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp .env.example .env`.

To stop the platform, press `Ctrl+C` or run `docker compose down`. Add `-v` only
when you intentionally want to delete the local database volumes.

**Services will be available at:**
- Frontend: http://localhost:3000
- API Gateway: http://localhost:4000
- Kafka UI: http://localhost:8081

### Seeded Development Account

The seed command creates this admin account if it does not already exist:

| Field | Value |
|-------|-------|
| Email | `admin@example.com` |
| Password | `admin` |
| Role | `admin` |

Use it with `POST /api/v1/auth/login` through the API Gateway. These are local development credentials only. Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env` before seeding to use different values, and never use the defaults outside a local environment.

The seed is safe to run more than once: it replaces the sample products and inventory, but does not overwrite an existing admin account or password.

### Run Infrastructure Only (for local Node.js dev)

```bash
# Install packages from the monorepo root
npm install

# Start only Kafka, Redis, PostgreSQL, MongoDB, and Kafka UI
docker compose -f docker-compose.infra.yml up -d

# Build all TypeScript services
npm run build --workspaces --if-present

# Start services in separate terminals
npm run dev:auth
npm run dev:product
npm run dev:cart
npm run dev:order
npm run dev:inventory
npm run dev:payment
npm run dev:notification
npm run dev:gateway
npm run dev:frontend
```

For local development, `.env` should use `localhost` for infrastructure hosts
(`POSTGRES_HOST`, `MONGO_URI`, `REDIS_HOST`, and `KAFKA_BROKERS`) because the
services run outside Docker. Use `docker compose down` to stop the infrastructure.

---

## 📡 API Reference

### Auth
```
POST /api/v1/auth/register   — Register a new user
POST /api/v1/auth/login      — Login, returns JWT
GET  /api/v1/auth/profile     — Get current user (requires JWT)
```

### Products
```
GET    /api/v1/products        — List all products
GET    /api/v1/products/:id    — Get product details
POST   /api/v1/products        — Create product (admin)
PUT    /api/v1/products/:id    — Update product (admin)
DELETE /api/v1/products/:id    — Delete product (admin)
```

### Cart
```
GET    /api/v1/cart             — Get current cart
POST   /api/v1/cart/items       — Add item to cart
PUT    /api/v1/cart/items/:id   — Update item quantity
DELETE /api/v1/cart/items/:id   — Remove item from cart
DELETE /api/v1/cart             — Clear cart
```

### Orders
```
POST   /api/v1/orders           — Place an order (from cart)
GET    /api/v1/orders           — List user's orders
GET    /api/v1/orders/:id       — Get order details
```

### Inventory
```
GET    /api/v1/inventory/:productId  — Check stock level
PUT    /api/v1/inventory/:productId  — Update stock (admin)
```

### Payments
```
GET    /api/v1/payments/:orderId     — Get payment status
```

---

## 🔄 Event Flow — Checkout Saga

```
1. Client → POST /api/v1/orders
2. Order Service creates order (PENDING) + writes outbox event
3. Outbox relay publishes "order.created" to Kafka
4. Inventory Service consumes → atomic stock reservation
   ├─ Success → publishes "inventory.reserved"
   └─ Failure → publishes "inventory.rejected" → Order → CANCELLED
5. Payment Service consumes "inventory.reserved" → processes payment
   ├─ Success → publishes "payment.completed" → Order → CONFIRMED
   └─ Failure → publishes "payment.failed" → Inventory releases → Order → CANCELLED
6. Notification Service consumes events → logs confirmation/failure messages
```

---

## 🗄️ Database Design

### Order DB (PostgreSQL)
- `orders` — id, user_id, status, total_amount, version (optimistic locking)
- `order_items` — id, order_id, product_id, product_name, price, quantity
- `outbox_events` — id, aggregate_type, event_type, payload, published_at

### Inventory DB (PostgreSQL)
- `stock_levels` — product_id (unique), quantity, reserved

### Payment DB (PostgreSQL)
- `payments` — id, order_id, amount, status, idempotency_key
- `idempotency_keys` — key (PK), status, response_code, response_body

### Auth DB (PostgreSQL)
- `users` — id, email, password_hash, name, role

### Product DB (MongoDB)
- `products` collection — name, description, price, category, image_url, stock_hint

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests for a specific service
npm test --workspace=packages/order-service

# Run with coverage
npm test -- --coverage
```

---

## 🔑 Key Patterns Demonstrated

| Pattern | Where | Section in Guide |
|---------|-------|-----------------|
| **API Gateway** | `api-gateway/` | §2.3, §10.1, §17.1 |
| **Saga (Choreography)** | Order→Inventory→Payment | §9.5 |
| **Outbox Pattern** | `order-service/events/` | §9.3 |
| **Idempotency Keys** | `payment-service/` | §11 |
| **Cache-Aside** | `product-service/` | §9.4 |
| **Atomic Stock Reservation** | `inventory-service/` | §3.4 |
| **Circuit Breaker** | `api-gateway/` | §10.3 |
| **Correlation IDs** | All services | §10.7 |
| **Structured Logging** | `shared/logger.js` | §15.2 |
| **State Machine** | `order-service/` | §3.3 |
| **Rate Limiting** | `api-gateway/` | §10.1, E.4 |
| **Database per Service** | All services | §6, §9 |

---

## 📁 Project Structure

```
Microservices/
├── packages/
│   ├── shared/              # Shared utilities (logger, events, errors)
│   ├── api-gateway/         # Reverse proxy + auth + rate limiting
│   ├── auth-service/        # User auth + JWT
│   ├── product-service/     # Catalog (MongoDB + Redis cache)
│   ├── cart-service/        # Shopping cart (Redis)
│   ├── order-service/       # Orders + state machine + outbox
│   ├── inventory-service/   # Stock + atomic reservation
│   ├── payment-service/     # Payments + idempotency
│   ├── notification-service/# Event consumer (email/SMS logs)
│   └── frontend/            # React SPA
├── scripts/                 # Database initialization and sample-data seed
├── docker-compose.yml       # Full stack
├── docker-compose.infra.yml # Infrastructure only
└── .env.example             # Environment template
```

---

## 📄 License

MIT — This is a learning/reference project.
