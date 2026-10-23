import { v4 as uuidv4 } from 'uuid';
import { db } from '../models/orderModel';
import { OrderStatus, canTransitionOrder, EventTypes, NotFoundError, ValidationError, isUuid } from '@ecommerce/shared';
import type { CancelReason, OrderCreatedData } from '@ecommerce/shared';

interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface CreateOrderInput {
  userId: string;
  items: OrderItem[];
  shippingAddress?: string;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  price: number;
  quantity: number;
}

interface OrderRow {
  id: string;
  user_id: string;
  status: string;
  total_amount: number;
  shipping_address: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Creates an order with items and an outbox event in ONE transaction (Section 9.3).
 * The outbox event guarantees that order.created is never lost relative to the DB write.
 */
export const createOrder = async ({
  userId,
  items,
  shippingAddress,
}: CreateOrderInput): Promise<any> => {
  if (!items || items.length === 0) {
    throw new ValidationError('Order must contain at least one item');
  }

  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const orderId = uuidv4();

  // Single transaction: order + items + outbox event (Section 9.3 — no dual-write)
  await db.transaction(async (trx) => {
    await trx('orders').insert({
      id: orderId,
      user_id: userId,
      status: OrderStatus.PENDING,
      total_amount: totalAmount,
      shipping_address: shippingAddress || '',
    });

    const orderItems = items.map((item) => ({
      id: uuidv4(),
      order_id: orderId,
      product_id: item.productId,
      product_name: item.name,
      price: item.price,
      quantity: item.quantity,
    }));

    await trx('order_items').insert(orderItems);

    // Outbox event — will be picked up by the relay and published to Kafka
    const payload: OrderCreatedData = {
      orderId,
      userId,
      items: orderItems.map((i) => ({
        productId: i.product_id,
        productName: i.product_name,
        price: i.price,
        quantity: i.quantity,
      })),
      totalAmount,
    };
    await trx('outbox_events').insert({
      id: uuidv4(),
      aggregate_type: 'Order',
      aggregate_id: orderId,
      event_type: EventTypes.ORDER_CREATED,
      payload: JSON.stringify(payload),
    });
  });

  return getOrderById(orderId);
};

/**
 * State machine transition (Section 3.3).
 * Validates that the transition is allowed before updating.
 * Uses optimistic locking via version column (Section 3.4).
 * `reason` is stored with a cancellation so the shopper can see why (feature 010).
 */
export const updateOrderStatus = async (orderId: string, newStatus: string, reason?: CancelReason): Promise<any> => {
  const order = (await db('orders').where({ id: orderId }).first()) as OrderRow | undefined;
  if (!order) throw new NotFoundError('Order');

  if (!canTransitionOrder(order.status, newStatus)) {
    throw new ValidationError(
      `Cannot transition order from ${order.status} to ${newStatus}`
    );
  }

  const updated = await db('orders')
    .where({ id: orderId, version: order.version }) // Optimistic lock
    .update({
      status: newStatus,
      ...(reason ? { cancel_reason: reason } : {}),
      version: order.version + 1,
      updated_at: db.fn.now(),
    });

  if (updated === 0) {
    throw new ValidationError('Order was modified concurrently, please retry');
  }

  return getOrderById(orderId);
};

/**
 * The order with its items, only if `userId` owns it (the read path behind
 * `GET /orders/:id`). A malformed ID, a missing order and someone else's order
 * all raise the same NotFoundError, so a caller cannot tell them apart.
 */
export const getOrderForUser = async (orderId: string, userId: string): Promise<any> => {
  if (!isUuid(orderId)) throw new NotFoundError('Order');

  const order = (await db('orders').where({ id: orderId }).first()) as OrderRow | undefined;
  if (!order || order.user_id !== userId) throw new NotFoundError('Order');

  const items = (await db('order_items').where({ order_id: orderId })) as OrderItemRow[];

  return { ...order, items };
};

/** Any order by ID, for internal callers (saga, status updates); never exposed over HTTP. */
export const getOrderById = async (orderId: string): Promise<any> => {
  const order = (await db('orders').where({ id: orderId }).first()) as OrderRow | undefined;
  if (!order) throw new NotFoundError('Order');

  const items = (await db('order_items').where({ order_id: orderId })) as OrderItemRow[];

  return { ...order, items };
};

export const getOrdersByUserId = async (
  userId: string,
  page: number,
  limit: number
): Promise<any[]> => {
  const skip = (page - 1) * limit;
  return db('orders')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc')
    .offset(skip)
    .limit(limit);
};
