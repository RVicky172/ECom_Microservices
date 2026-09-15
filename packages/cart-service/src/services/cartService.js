const Redis = require('ioredis');
const { NotFoundError, ValidationError } = require('@ecommerce/shared/src/errors');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
});

const CART_TTL = 86400 * 7; // 7 days
const cartKey = (userId) => `cart:${userId}`;

/**
 * Cart stored in Redis as a hash: cart:{userId} → { productId: JSON({productId, name, price, quantity}) }
 * Redis is ideal for cart: fast reads/writes, built-in TTL, no need for ACID transactions.
 */

const getCart = async (userId) => {
  const cart = await redis.hgetall(cartKey(userId));
  const items = Object.values(cart).map((item) => JSON.parse(item));
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { userId, items, total: Math.round(total * 100) / 100, itemCount: items.length };
};

const addItem = async (userId, item) => {
  const key = cartKey(userId);
  const existing = await redis.hget(key, item.productId);

  let cartItem;
  if (existing) {
    cartItem = JSON.parse(existing);
    cartItem.quantity += item.quantity;
  } else {
    cartItem = {
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    };
  }

  await redis.hset(key, item.productId, JSON.stringify(cartItem));
  await redis.expire(key, CART_TTL);

  return getCart(userId);
};

const updateItemQuantity = async (userId, productId, quantity) => {
  const key = cartKey(userId);
  const existing = await redis.hget(key, productId);

  if (!existing) throw new NotFoundError('Cart item');

  if (quantity <= 0) {
    await redis.hdel(key, productId);
  } else {
    const item = JSON.parse(existing);
    item.quantity = quantity;
    await redis.hset(key, productId, JSON.stringify(item));
  }

  return getCart(userId);
};

const removeItem = async (userId, productId) => {
  const key = cartKey(userId);
  const removed = await redis.hdel(key, productId);
  if (!removed) throw new NotFoundError('Cart item');
  return getCart(userId);
};

const clearCart = async (userId) => {
  await redis.del(cartKey(userId));
  return { userId, items: [], total: 0, itemCount: 0 };
};

module.exports = { getCart, addItem, updateItemQuantity, removeItem, clearCart };
