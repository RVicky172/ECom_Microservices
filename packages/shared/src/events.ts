/**
 * Kafka topic names and event type constants.
 * Central registry so producers and consumers stay in sync.
 */

export enum KafkaTopics {
  ORDER_CREATED = 'order.created',
  INVENTORY_RESERVED = 'inventory.reserved',
  INVENTORY_REJECTED = 'inventory.rejected',
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
  ORDER_SHIPPED = 'order.shipped',
}

export enum EventTypes {
  ORDER_CREATED = 'ORDER_CREATED',
  INVENTORY_RESERVED = 'INVENTORY_RESERVED',
  INVENTORY_REJECTED = 'INVENTORY_REJECTED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  ORDER_CONFIRMED = 'ORDER_CONFIRMED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ORDER_SHIPPED = 'ORDER_SHIPPED',
}

/**
 * Order state machine valid transitions (Section 3.3).
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  INVENTORY_RESERVED = 'INVENTORY_RESERVED',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.INVENTORY_RESERVED, OrderStatus.CANCELLED],
  [OrderStatus.INVENTORY_RESERVED]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};
