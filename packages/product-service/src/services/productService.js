const Redis = require('ioredis');
const Product = require('../models/productModel');
const { NotFoundError } = require('@ecommerce/shared/src/errors');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  lazyConnect: true,
});

redis.connect().catch(() => {
  console.warn('Redis not available — cache-aside disabled, falling back to DB only');
});

const CACHE_TTL = 300; // 5 minutes
const cacheKey = (id) => `product:${id}`;
const cacheListKey = () => 'products:list';

/**
 * Cache-aside pattern (Section 9.4):
 * 1. Check Redis first
 * 2. On miss: read from MongoDB, populate cache with TTL
 * 3. On write: invalidate cache key explicitly
 */
const getAllProducts = async (query = {}) => {
  const { category, search, page = 1, limit = 20 } = query;
  const filter = { isActive: true };

  if (category) filter.category = category;
  if (search) filter.name = { $regex: search, $options: 'i' };

  const skip = (page - 1) * limit;
  const [products, total] = await Promise.all([
    Product.find(filter).skip(skip).limit(parseInt(limit, 10)).sort({ createdAt: -1 }),
    Product.countDocuments(filter),
  ]);

  return {
    products,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

const getProductById = async (id) => {
  // Check cache first
  try {
    const cached = await redis.get(cacheKey(id));
    if (cached) return JSON.parse(cached);
  } catch { /* cache miss or redis down — fall through to DB */ }

  const product = await Product.findById(id);
  if (!product) throw new NotFoundError('Product');

  // Populate cache
  try {
    await redis.set(cacheKey(id), JSON.stringify(product), 'EX', CACHE_TTL);
  } catch { /* redis down — continue without caching */ }

  return product;
};

const createProduct = async (data) => {
  const product = await Product.create(data);
  return product;
};

const updateProduct = async (id, data) => {
  const product = await Product.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!product) throw new NotFoundError('Product');

  // Invalidate cache on update (Section 9.4)
  try { await redis.del(cacheKey(id)); } catch { /* ignore */ }

  return product;
};

const deleteProduct = async (id) => {
  const product = await Product.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!product) throw new NotFoundError('Product');

  try { await redis.del(cacheKey(id)); } catch { /* ignore */ }

  return product;
};

module.exports = { getAllProducts, getProductById, createProduct, updateProduct, deleteProduct };
