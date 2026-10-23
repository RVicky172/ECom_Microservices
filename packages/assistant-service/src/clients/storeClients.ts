/**
 * Typed read-only wrappers over the store's existing service endpoints.
 * Only the fields the assistant needs are typed; services may return more.
 */
import type { RequestContext } from '../context';
import { getJson, ServiceError } from './serviceClient';

export interface Product {
  _id: string;
  name: string;
  description: string;
  price: number | string;
  category?: string;
  imageUrl?: string;
}

export interface StockLevel {
  product_id: string;
  quantity: number;
  reserved: number;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number | string;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  itemCount: number;
  total: number | string;
}

export interface OrderSummary {
  id: string;
  user_id: string;
  status: string;
  total_amount: number | string;
  created_at: string;
}

export interface OrderDetail extends OrderSummary {
  shipping_address?: string;
  updated_at?: string;
  items: Array<{ product_id: string; product_name?: string; quantity: number; price: number | string }>;
}

export interface Payment {
  order_id: string;
  amount: number | string;
  status: string;
  created_at: string;
}

/** Whole active catalog. It is small, so tools filter it in memory. */
export const listProducts = async (ctx: RequestContext): Promise<Product[]> => {
  const { products } = await getJson<{ products: Product[] }>('product', '/api/v1/products', ctx, { limit: 200 });
  return products;
};

export const getProduct = (ctx: RequestContext, productId: string): Promise<Product> =>
  getJson<Product>('product', `/api/v1/products/${encodeURIComponent(productId)}`, ctx);

/** Stock for a product, or `null` when inventory has no record of it. */
export const getStock = async (ctx: RequestContext, productId: string): Promise<StockLevel | null> => {
  try {
    return await getJson<StockLevel>('inventory', `/api/v1/inventory/${encodeURIComponent(productId)}`, ctx);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) return null;
    throw error;
  }
};

export const getCart = (ctx: RequestContext): Promise<Cart> => getJson<Cart>('cart', '/api/v1/cart', ctx);

/** The current user's orders, newest first. */
export const listOrders = async (ctx: RequestContext, limit = 10): Promise<OrderSummary[]> => {
  const { orders } = await getJson<{ orders: OrderSummary[] }>('order', '/api/v1/orders', ctx, { limit });
  return orders;
};

/**
 * One order, only if it belongs to the current user.
 *
 * The order service's `GET /orders/:id` enforces ownership itself (feature 002:
 * someone else's order is a 404); this check is a second layer. Someone else's
 * order is reported as not found.
 */
export const getOwnOrder = async (ctx: RequestContext, orderId: string): Promise<OrderDetail | null> => {
  try {
    const order = await getJson<OrderDetail>('order', `/api/v1/orders/${encodeURIComponent(orderId)}`, ctx);
    return order.user_id === ctx.userId ? order : null;
  } catch (error) {
    if (error instanceof ServiceError && (error.status === 404 || error.status === 400 || error.status === 500)) {
      // 400/500: the order service rejects IDs that are not valid UUIDs.
      return null;
    }
    throw error;
  }
};

/**
 * Payment for an order the caller has already verified belongs to the user.
 * The payment service also checks ownership (through the order service).
 */
export const getPaymentForOrder = async (ctx: RequestContext, orderId: string): Promise<Payment | null> => {
  try {
    return await getJson<Payment>('payment', `/api/v1/payments/${encodeURIComponent(orderId)}`, ctx);
  } catch (error) {
    if (error instanceof ServiceError && error.status === 404) return null;
    throw error;
  }
};
