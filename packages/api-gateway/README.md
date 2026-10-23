# API Gateway: the application's front door

The API gateway is the HTTP entry point between the browser and backend services. It listens on port `4000` by default. Instead of teaching the frontend every service address, the gateway gives it one base URL and routes requests to the service that owns each feature.

Run it from the repository root with:

```sh
npm run dev:gateway
```

The gateway depends on the backend services it proxies and on the shared package. In local development, configure `FRONTEND_ORIGINS` if the frontend does not run at `http://localhost:3000`.

## Follow the request

1. The browser sends an HTTP request to the gateway, usually under `/api/v1/...`.
2. CORS, correlation-ID middleware, CSRF origin checks, and the in-memory rate limiter run.
3. The matching route may verify the request's bearer access token.
4. A reverse proxy forwards the request to the target microservice.
5. The gateway returns the service's response to the browser. If the proxy cannot reach its target, it returns `502 Bad Gateway`.

The proxy targets are configurable with `AUTH_SERVICE_URL`, `PRODUCT_SERVICE_URL`, `CART_SERVICE_URL`, `ORDER_SERVICE_URL`, `INVENTORY_SERVICE_URL`, and `PAYMENT_SERVICE_URL`, and `ASSISTANT_SERVICE_URL`. Defaults target ports `4001` through `4006` and `4008` respectively.

## Routes and access checks

| Browser route | Target service | Gateway access check |
| --- | --- | --- |
| `/api/v1/auth/*` | Auth, port `4001` | Public at the gateway, except `/profile` |
| `/api/v1/auth/profile` | Auth, port `4001` | Requires a valid bearer access token |
| `/api/v1/products/*` | Product, port `4002` | No token check in the current proxy setup |
| `/api/v1/cart/*` | Cart, port `4003` | Requires a valid bearer access token |
| `/api/v1/orders/*` | Order, port `4004` | Requires a valid bearer access token |
| `/api/v1/payments/*` | Payment, port `4006` | Requires a valid bearer access token |
| `/api/v1/assistant/*` | Assistant, port `4008` | Requires a valid bearer access token; 120-second proxy timeout for streamed replies |

Although the inventory service listens on port `4005`, the current gateway proxy setup does not mount an inventory route. Notification is a Kafka consumer and has no HTTP proxy route here.

## Authentication, in plain language

`middleware/auth.ts` reads the `Authorization` header and accepts a token only when it starts with `Bearer `. It verifies the JWT's signature and expiry using the shared package. For a valid token, it attaches the decoded user identity to the Express request.

When forwarding an authenticated request, `proxy.ts` adds the verified identity as `x-user-id`, `x-user-email`, and `x-user-role` headers. Any of these headers sent by the client are removed first, so they always come from the verified token. Downstream services use these headers to identify a caller. The gateway currently enforces that a user is signed in on cart, order, payment, and profile routes, but does not apply role-based authorization. Product write operations also pass through without the gateway's authentication middleware, so do not assume they are protected by the frontend.

## Request protections

- **CORS:** permits configured frontend origins and credentials.
- **CSRF origin check:** for methods other than `GET`, `HEAD`, and `OPTIONS`, the request must include an allowed `Origin`.
- **Rate limiting:** the current in-memory limiter defaults to 100 requests per IP per 15 minutes. `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS` change those values. Because the map is in process memory, limits are not shared across gateway instances.
- **Internal service token:** when `INTERNAL_SERVICE_TOKEN` is set, the gateway adds it as `x-internal-token` on every proxied request (replacing any client value), and services reject requests without it. This stops callers who can reach a service port directly from spoofing `x-user-id`.
- **Correlation IDs:** a request ID is forwarded to services and included in logs so related activity can be traced.

## Where to read next

- `src/index.ts` wires middleware and starts the HTTP server.
- `src/proxy.ts` maps routes to services and forwards verified identity.
- `src/middleware/auth.ts` verifies bearer JWTs.
- `src/middleware/csrfProtection.ts` checks request origins for write methods.
- `src/middleware/rateLimiter.ts` implements the current per-process limit.

The gateway is not a replacement for service-level authorization. Avoid trusting identity headers from arbitrary callers: in this architecture, downstream services should only be reachable through a trusted gateway or independently verify the caller.
