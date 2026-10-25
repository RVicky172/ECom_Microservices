/**
 * The catalog: MongoDB reads and writes, with single products cached in Redis (cache-aside). The service keeps
 * working from the database alone when Redis is down.
 */
import Redis from 'ioredis';
import Product, { IProduct } from '../models/productModel';
import { NotFoundError } from '@ecommerce/shared';

interface QueryParams {
  category?: string;
  search?: string;
  page?: string | number;
  limit?: string | number;
}

interface GetAllProductsResponse {
  products: IProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  lazyConnect: true,
});

redis.connect().catch(() => {
  console.warn('Redis not available — cache-aside disabled, falling back to DB only');
});

const CACHE_TTL = 300; // 5 minutes
const cacheKey = (id: string): string => `product:${id}`;
const cacheListKey = (): string => 'products:list';

/**
 * Cache-aside pattern (Section 9.4):
 * 1. Check Redis first
 * 2. On miss: read from MongoDB, populate cache with TTL
 * 3. On write: invalidate cache key explicitly
 */
export const getAllProducts = async (query: QueryParams = {}): Promise<GetAllProductsResponse> => {
  const { category, search, page = 1, limit = 20 } = query;
  const filter: any = { isActive: true };

  if (category) filter.category = category;
  if (search) filter.name = { $regex: search, $options: 'i' };

  const skip = ((typeof page === 'string' ? parseInt(page, 10) : page) - 1) * (typeof limit === 'string' ? parseInt(limit, 10) : limit);
  const [products, total] = await Promise.all([
    Product.find(filter)
      .skip(skip)
      .limit(typeof limit === 'string' ? parseInt(limit, 10) : limit)
      .sort({ createdAt: -1 }),
    Product.countDocuments(filter),
  ]);

  const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
  const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;

  return {
    products,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  };
};

/**
 * One product: from the cache, else from MongoDB (then cached).
 *
 * @throws NotFoundError for an unknown ID
 */
export const getProductById = async (id: string): Promise<IProduct> => {
  // Check cache first
  try {
    const cached = await redis.get(cacheKey(id));
    if (cached) return JSON.parse(cached);
  } catch {
    /* cache miss or redis down — fall through to DB */
  }

  const product = await Product.findById(id);
  if (!product) throw new NotFoundError('Product');

  // Populate cache
  try {
    await redis.set(cacheKey(id), JSON.stringify(product), 'EX', CACHE_TTL);
  } catch {
    /* redis down — continue without caching */
  }

  return product;
};

/** Creates a product. */
export const createProduct = async (data: Partial<IProduct>): Promise<IProduct> => {
  const product = await Product.create(data);
  return product;
};

/**
 * Updates a product and drops its cache entry.
 *
 * @throws NotFoundError for an unknown ID
 */
export const updateProduct = async (id: string, data: Partial<IProduct>): Promise<IProduct> => {
  const product = await Product.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!product) throw new NotFoundError('Product');

  // Invalidate cache on update (Section 9.4)
  try {
    await redis.del(cacheKey(id));
  } catch {
    /* ignore */
  }

  return product;
};

/**
 * Deactivates a product (soft delete) and drops its cache entry.
 *
 * @throws NotFoundError for an unknown ID
 */
export const deleteProduct = async (id: string): Promise<IProduct> => {
  const product = await Product.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!product) throw new NotFoundError('Product');

  try {
    await redis.del(cacheKey(id));
  } catch {
    /* ignore */
  }

  return product;
};
