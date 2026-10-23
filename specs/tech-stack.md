# mercato — E-Commerce Microservices Platform — Tech Stack

> Approved technologies. Adding or replacing anything here requires updating this file and logging the
> decision in `memory/decisions.md` (Constitution III).

**Last updated:** 2026-10-23

---

## Runtime

| Concern | Choice | Why |
| ------- | ------ | --- |
| Language | TypeScript on Node.js 26 (`node:26-alpine` images; D-009) | One language across services and frontend; latest release line |
| HTTP framework | Express 4 | Simple, well known; shared middleware in `@ecommerce/shared` |
| Gateway proxy | http-proxy-middleware 3 | Streams responses (needed for assistant SSE) |
| Relational data | PostgreSQL 16 via Knex 3 | Orders, inventory, payments and auth need transactions |
| Document data | MongoDB 7 via Mongoose 9 | Flexible product catalog |
| Cache / ephemeral state | Redis 7 via ioredis 5 | Carts, product cache, assistant conversations and limits |
| Messaging | Apache Kafka 3.7 via KafkaJS 2 | Saga choreography between order, inventory and payment |
| Auth | jsonwebtoken 9, bcryptjs 2 | Short-lived access JWT; hashed passwords and refresh tokens |
| Validation | Joi 17 (services), Zod 4 (assistant) | Zod doubles as tool schemas for the LLM |
| Logging | Pino 9 | Structured JSON logs with correlation IDs |
| LLM | @anthropic-ai/sdk 1 (Claude) or openai 7 (LM Studio / OpenAI-compatible) | Switchable via `ASSISTANT_PROVIDER` |
| Frontend | React 18, Vite 5, React Router 6, Redux Toolkit 2 (RTK Query), Axios | SPA with cached server data |

## Tooling (dev only)

| Concern | Choice |
| ------- | ------ |
| Package manager | npm workspaces (`packages/*`) |
| Runtime | Node.js ≥ 26 |
| Typecheck | `tsc --noEmit` per package via `npm run check` (`scripts/check.mjs`) |
| Dev servers | ts-node (services), tsx (gateway), Vite (frontend) |
| Containers | Docker Compose (`docker-compose.yml`, `docker-compose.infra.yml`) |
| Unit tests | Vitest 5 — root dev dependency, one project per `packages/*` (feature 001, D-008) |
| Lint / format | none yet |
| CI | none yet — GitHub Actions in the backlog (D-012) |

## Developer Tools

Isolated in `tools/` with their own `package.json`; never shipped with the store.

| Tool | Choice | Why |
| ---- | ------ | --- |
| Spec dashboard (004) | Next.js 16, React 19, react-markdown 10 + remark-gfm 4, Zod 4, Vitest 5, TypeScript 5.9 | Live local view of specs/ and memory/; Zod validates the tracking JSON; Vitest runs the parser, schema and consistency tests. TypeScript stays on 5.9 there because Next's type checking uses the TypeScript JS API (D-005). |

## Explicitly Not Used (and why)

| Rejected | Reason |
| -------- | ------ |
