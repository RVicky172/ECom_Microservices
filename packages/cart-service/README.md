# Cart Service: a user's active basket

The Cart Service stores shopping carts in Redis. It listens on port `4003` by default. Each cart is keyed by user ID, so the gateway's verified identity determines which cart a request accesses.

Run it from the repository root with:

```sh
npm run dev:cart
```

Redis connection settings use `REDIS_HOST` and `REDIS_PORT`, defaulting to `localhost:6379`.

## Endpoints

Routes are mounted below `/api/v1/cart`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Read the current user's cart |
| `POST` | `/items` | Add an item or increase its quantity |
| `PUT` | `/items/:id` | Change an item's quantity; zero removes it |
| `DELETE` | `/items/:id` | Remove an item |
| `DELETE` | `/` | Clear the cart |

## How cart storage works

The gateway requires an access token for cart routes. It verifies the token and forwards the user ID in `x-user-id`. The cart controller uses that ID when calling the service layer; clients do not choose another user's Redis key.

The service stores each item as JSON in a Redis hash named `cart:<userId>`, with the product ID as the hash field. Adding an existing product increases its quantity. Every add refreshes the cart's seven-day TTL. Cart reads compute the item count and total from the stored items.

Joi validates item additions and quantity changes. A quantity of zero in an update removes the item; a negative quantity is rejected. Attempts to update or remove a missing item return a not-found error.

## Design trade-offs and current limits

Redis suits a frequently updated cart because reads and writes are fast, and the key can expire automatically. The cart is temporary checkout state, not the permanent order record; orders are saved by the Order Service.

The current add-item endpoint accepts a product name and price from the request, and the service stores those values. It does not look up or verify the current product price with Product Service. Treat the browser-provided price as untrusted if this application is extended to real payments; the server should derive checkout pricing from trusted product data.

## Where to read next

- `src/routes/cartRoutes.ts` lists the endpoints.
- `src/controllers/cartController.ts` validates inputs and reads the user ID.
- `src/services/cartService.ts` contains Redis key, expiry, and item behavior.

Checkout begins in the frontend and creates an order through the Order Service; see the [frontend guide](../frontend/README.md) and [Order Service guide](../order-service/README.md).
