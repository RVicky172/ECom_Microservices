# Product Service: the catalog

The Product Service owns catalog product records. It listens on port `4002` by default, stores products in MongoDB, and can use Redis to cache individual product lookups.

Run it from the repository root with:

```sh
npm run dev:product
```

Set `MONGO_URI` to select the MongoDB connection. The default is `mongodb://localhost:27017/product_db`. Redis uses `REDIS_HOST` and `REDIS_PORT`, defaulting to `localhost:6379`. If Redis is unavailable, startup continues and product reads use MongoDB.

## Endpoints

Routes are mounted below `/api/v1/products`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | List active products; accepts category, search, page, and limit filters |
| `GET` | `/:id` | Get one product by MongoDB ID |
| `POST` | `/` | Create a product after Joi validation |
| `PUT` | `/:id` | Update a product |
| `DELETE` | `/:id` | Soft-delete a product by setting it inactive |

## How a product request works

The Express router selects a controller. Controllers handle HTTP concerns, such as reading parameters, validating new product data, choosing a status code, and passing errors to shared middleware. The service layer contains the database operations, while the Mongoose model defines fields such as name, description, price, category, image URL, stock hint, active state, and timestamps.

List requests return active products and pagination information. A single product lookup checks Redis first; on a cache miss, it reads MongoDB and caches the result for five minutes. Updating or soft-deleting a product removes that individual product's cache entry.

## Current limitations to know about

- The list operation currently reads MongoDB directly; the list cache key helper is not used by the list query.
- Joi validation is applied to product creation, but the update controller passes the request body directly to Mongoose.
- The gateway currently proxies product routes without authentication, and the product router has no route-level access checks. Create, update, and delete operations are therefore not protected by the current application authorization flow. Do not expose these write routes publicly without adding server-side authorization.
- `stockHint` is a product field for display; inventory reservation is managed separately by the Inventory Service.

## Where to read next

- `src/routes/productRoutes.ts` maps URLs to controllers.
- `src/controllers/productController.ts` handles HTTP input and output.
- `src/services/productService.ts` implements MongoDB reads/writes and individual-product cache-aside behavior.
- `src/models/productModel.ts` defines the MongoDB schema.
