# mercato — E-Commerce Microservices Platform — Tech Stack

> Approved technologies. Adding or replacing anything here requires updating this file and logging the
> decision in `memory/decisions.md` (Constitution III).

**Last updated:** 2026-10-25 (005: every package on its latest major)

---

## Runtime

| Concern | Choice | Why |
| ------- | ------ | --- |
| Language | TypeScript on Node.js 26 (`node:26-alpine` images; D-009) | One language across services and frontend; latest release line |
| HTTP framework | Express 5 (D-037) | Simple, well known; shared middleware in `@ecommerce/shared`. An empty body is `undefined`: read it with `bodyOf` |
| Gateway proxy | http-proxy-middleware 4 (ESM, D-037) | Streams responses (needed for assistant SSE) |
| Relational data | PostgreSQL 16 via Knex 3 | Orders, inventory, payments and auth need transactions |
| Document data | MongoDB 7 via Mongoose 9.11 | Flexible product catalog |
| Cache / ephemeral state | Redis 7 via ioredis 6 | Carts, product cache, assistant conversations and limits |
| Messaging | Apache Kafka 3.7 via KafkaJS 2 | Saga choreography between order, inventory and payment |
| Auth | jsonwebtoken 9, bcryptjs 3 (D-036) | Short-lived access JWT; hashed passwords and refresh tokens. Hashes from bcryptjs 2 (`$2a$`) still verify |
| Validation | Joi 18 (services), Zod 4 (assistant) | Zod doubles as tool schemas for the LLM |
| Logging | Pino 10 | Structured JSON logs with correlation IDs |
| IDs | `node:crypto` (`randomUUID`; shared `uuidV5`, D-034) | No `uuid` package: v14 is ESM-only, and Node has what we need |
| LLM | @anthropic-ai/sdk 1.3 (Claude) or openai 7 (LM Studio / OpenAI-compatible) | Switchable via `ASSISTANT_PROVIDER` |
| Frontend | React 19, Vite 8, React Router 8 (`react-router`, D-038), Redux Toolkit 2 (RTK Query), Axios | SPA with cached server data |

## Tooling (dev only)

| Concern | Choice |
| ------- | ------ |
| Package manager | npm workspaces (`packages/*`) |
| Runtime | Node.js ≥ 26 |
| Typecheck | TypeScript 7 (D-033), `tsc --noEmit` per package via `npm run check` (`scripts/check.mjs`) |
| Dev servers | tsx (`tsx watch src/index.ts`, every service and the gateway), Vite (frontend) |
| Containers | Docker Compose (`docker-compose.yml`, `docker-compose.infra.yml`) |
| Unit tests | Vitest 5 — root dev dependency, one project per `packages/*` (feature 001, D-008) |
| Lint / format | JSDoc check and file-size check in `npm run check` (005; `scripts/check-docs.mjs`, `scripts/check-size.mjs`); rules in `specs/coding-standards.md`. ESLint and Prettier in the backlog |
| Dependency updates | Dependabot (`.github/dependabot.yml`): weekly npm and Docker PRs, minor/patch grouped; review checklist in `specs/workflow.md` |
| CI | none yet — GitHub Actions in the backlog (D-012) |

## Developer Tools

Isolated in `tools/` with their own `package.json`; never shipped with the store.

| Tool | Choice | Why |
| ---- | ------ | --- |
| Spec dashboard (004) | Next.js 16, React 19, react-markdown 10 + remark-gfm 4, Zod 4, Vitest 5, TypeScript 7 | Live local view of specs/ and memory/; Zod validates the tracking JSON; Vitest runs the parser, schema and consistency tests. On TypeScript 7 since 005: Next 16.4 type-checks with it (D-039; D-005's reason for 5.9 no longer holds). |

## Explicitly Not Used (and why)

| Rejected | Reason |
| -------- | ------ |
| ts-node | Can't load TypeScript 7 (its JS API is `unstable/*` only); `tsx` runs every dev server (D-033) |
| `uuid` | v14 is ESM-only; `node:crypto` covers v4 and our v5 helper (D-034) |
| `opossum`, `express-rate-limit` | Were installed but never used; removed in 005 (D-032). The gateway has its own rate limiter; a circuit breaker is in the backlog |
| `@types/ioredis`, `@types/uuid`, `@types/http-proxy-middleware`, `@types/bcryptjs` | Deprecated stubs; the libraries ship their own types (or were removed) |
