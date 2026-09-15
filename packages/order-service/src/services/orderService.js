const { v4: uuidv4 } = require('uuid');
const { db } = require('../models/orderModel');
const { OrderStatus, VALID_ORDER_TRANSITIONS, EventTypes } = require('@ecommerce/shared/src/events');
const { NotFoundError, ValidationError } = require('@ecommerce/shared/src/errors');

/**
 * Creates an order with items and an outbox event in ONE transaction (Section 9.3).
 * The outbox event guarantees that order.created is never lost relative to the DB write.
 */
const createOrder = async ({ userId, items, shippingAddress }) => {
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
    await trx('outbox_events').insert({
      id: uuidv4(),
      aggregate_type: 'Order',
      aggregate_id: orderId,
      event_type: EventTypes.ORDER_CREATED,
      payload: JSON.stringify({
        orderId,
        userId,
        items: orderItems.map((i) => ({
          productId: i.product_id,
          productName: i.product_name,
          price: i.price,
          quantity: i.quantity,
        })),
        totalAmount,
      }),
    });
  });

  return getOrderById(orderId);
};

/**
 * State machine transition (Section 3.3).
 * Validates that the transition is allowed before updating.
 * Uses optimistic locking via version column (Section 3.4).
 */
const updateOrderStatus = async (orderId, newStatus) => {
  const order = await db('orders').where({ id: orderId }).first();
  if (!order) throw new NotFoundError('Order');

  const allowedTransitions = VALID_ORDER_TRANSITIONS[order.status] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new ValidationError(
      `Cannot transition order from ${order.status} to ${newStatus}`
    );
  }

  const updated = await db('orders')
    .where({ id: orderId, version: order.version }) // Optimistic lock
    .update({
      status: newStatus,
      version: order.version + 1,
      updated_at: db.fn.now(),
    });

  if (updated === 0) {
    throw new ValidationError('Order was modified concurrently, please retry');
  }

  return getOrderById(orderId);
};

const getOrderById = async (orderId) => {
  const order = await db('orders').where({ id: orderId }).first();
  if (!order) throw new NotFoundError('Order');

  const items = await db('order_items').where({ order_id: orderId });

  return { ...order, items };
};

const getOrdersByUserId = async (userId, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;

  const orders = await db('orders')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc')
    .offset(offset)
    .limit(limit);

  // Batch fetch items (avoiding N+1 — Section 9.4)
  const orderIds = orders.map((o) => o.id);
  const allItems = orderIds.length
    ? await db('order_items').whereIn('order_id', orderIds)
    : [];

  const itemsByOrder = allItems.reduce((acc, item) => {
    if (!acc[item.order_id]) acc[item.order_id] = [];
    acc[item.order_id].push(item);
    return acc;
  }, {});

  return orders.map((order) => ({
    ...order,
    items: itemsByOrder[order.id] || [],
  }));
};

module.exports = { createOrder, updateOrderStatus, getOrderById, getOrdersByUserId };
