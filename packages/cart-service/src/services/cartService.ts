import Redis from 'ioredis';
import { NotFoundError } from '@ecommerce/shared';

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface Cart {
  userId: string;
  items: CartItem[];
  total: number;
  itemCount: number;
}

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
});

const CART_TTL = 86400 * 7; // 7 days
const cartKey = (userId: string): string => `cart:${userId}`;

/**
 * Cart stored in Redis as a hash: cart:{userId} → { productId: JSON({productId, name, price, quantity}) }
 * Redis is ideal for cart: fast reads/writes, built-in TTL, no need for ACID transactions.
 */

export const getCart = async (userId: string): Promise<Cart> => {
  const cart = await redis.hgetall(cartKey(userId));
  const items = Object.values(cart).map((item) => JSON.parse(item));
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { userId, items, total: Math.round(total * 100) / 100, itemCount: items.length };
};

export const addItem = async (userId: string, item: CartItem): Promise<Cart> => {
  const key = cartKey(userId);
  const existing = await redis.hget(key, item.productId);

  let cartItem: CartItem;
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

export const updateItemQuantity = async (userId: string, productId: string, quantity: number): Promise<Cart> => {
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

export const removeItem = async (userId: string, productId: string): Promise<Cart> => {
  const key = cartKey(userId);
  const removed = await redis.hdel(key, productId);
  if (!removed) throw new NotFoundError('Cart item');
  return getCart(userId);
};

export const clearCart = async (userId: string): Promise<Cart> => {
  await redis.del(cartKey(userId));
  return { userId, items: [], total: 0, itemCount: 0 };
};
