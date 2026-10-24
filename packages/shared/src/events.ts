import { ValidationError } from './errors';

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
  ASSISTANT_HANDOFF_REQUESTED = 'assistant.handoff_requested',
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
  HANDOFF_REQUESTED = 'HANDOFF_REQUESTED',
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

/**
 * True when an order may move from `from` to `to`. Statuses outside `OrderStatus`
 * (e.g. a corrupt row) are never allowed to move.
 */
export const canTransitionOrder = (from: string, to: string): boolean =>
  (VALID_ORDER_TRANSITIONS[from as OrderStatus] ?? []).includes(to as OrderStatus);

/**
 * Why an order was cancelled; stored on the order and shown to the shopper (feature 010).
 */
export const CANCEL_REASONS = ['OUT_OF_STOCK', 'PAYMENT_DECLINED'] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

/**
 * Saga event payloads (the `data` of each Kafka message). Producers build these
 * and consumers read them through the parsers below, so the two cannot drift
 * apart (Constitution V: change producer, consumers and this file together).
 */
export interface SagaItem {
  productId: string;
  quantity: number;
  productName?: string;
  price?: number;
}

export interface OrderCreatedData {
  orderId: string;
  userId: string;
  items: SagaItem[];
  totalAmount: number;
}

/** Forwards what payment needs from `order.created` (was only `orderId`: gap G3). */
export interface InventoryReservedData {
  orderId: string;
  userId: string;
  items: SagaItem[];
  totalAmount: number;
}

export interface InventoryRejectedData {
  orderId: string;
  reason: 'OUT_OF_STOCK';
}

/** Carries the items so inventory can finalize or release them (were `undefined`: gap G4). */
export interface PaymentCompletedData {
  orderId: string;
  items: SagaItem[];
  amount: number;
}

export interface PaymentFailedData {
  orderId: string;
  items: SagaItem[];
  amount: number;
  reason: 'PAYMENT_DECLINED';
}

/** The envelope every saga message carries; `data` is one of the payloads above. */
export interface SagaEnvelope {
  eventId: string;
  eventType: string;
  aggregateId: string;
  data: unknown;
  timestamp: string;
}

type Fields = Record<string, unknown>;

const reader = (event: string, data: unknown) => {
  const invalid = (field: string) => new ValidationError(`${event}: ${field} missing or invalid`);
  if (typeof data !== 'object' || data === null) throw invalid('payload');
  const fields = data as Fields;

  const text = (field: string): string => {
    const value = fields[field];
    if (typeof value !== 'string' || value.trim() === '') throw invalid(field);
    return value;
  };
  const amount = (field: string): number => {
    const value = fields[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw invalid(field);
    return value;
  };
  const items = (): SagaItem[] => {
    const value = fields.items;
    if (!Array.isArray(value) || value.length === 0) throw invalid('items');
    return value.map((item: Fields) => {
      if (typeof item?.productId !== 'string' || !Number.isInteger(item.quantity) || (item.quantity as number) < 1) {
        throw invalid('items');
      }
      return { ...item } as unknown as SagaItem;
    });
  };
  const literal = <T extends string>(field: string, expected: T): T => {
    if (fields[field] !== expected) throw invalid(field);
    return expected;
  };
  const oneOf = <T extends string>(field: string, allowed: readonly T[]): T => {
    if (!allowed.includes(fields[field] as T)) throw invalid(field);
    return fields[field] as T;
  };
  const shortText = (field: string, max: number): string => {
    const value = text(field);
    if (value.length > max) throw invalid(field);
    return value;
  };
  return { text, amount, items, literal, oneOf, shortText };
};

export const parseOrderCreated = (data: unknown): OrderCreatedData => {
  const read = reader('order.created', data);
  return { orderId: read.text('orderId'), userId: read.text('userId'), items: read.items(), totalAmount: read.amount('totalAmount') };
};

export const parseInventoryReserved = (data: unknown): InventoryReservedData => {
  const read = reader('inventory.reserved', data);
  return { orderId: read.text('orderId'), userId: read.text('userId'), items: read.items(), totalAmount: read.amount('totalAmount') };
};

export const parseInventoryRejected = (data: unknown): InventoryRejectedData => {
  const read = reader('inventory.rejected', data);
  return { orderId: read.text('orderId'), reason: read.literal('reason', 'OUT_OF_STOCK') };
};

export const parsePaymentCompleted = (data: unknown): PaymentCompletedData => {
  const read = reader('payment.completed', data);
  return { orderId: read.text('orderId'), items: read.items(), amount: read.amount('amount') };
};

export const parsePaymentFailed = (data: unknown): PaymentFailedData => {
  const read = reader('payment.failed', data);
  return {
    orderId: read.text('orderId'),
    items: read.items(),
    amount: read.amount('amount'),
    reason: read.literal('reason', 'PAYMENT_DECLINED'),
  };
};

/**
 * A customer asked the shopping assistant for a person (feature 011). Published by
 * the assistant, logged by notification as a support email. Carries IDs, a reason
 * and a short summary, never the chat transcript or an email address.
 */
export const HANDOFF_REASONS = ['customer_request', 'policy_not_covered', 'order_problem', 'other'] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];
export const MAX_HANDOFF_SUMMARY = 500;

export interface HandoffRequestedData {
  /** Shown to the customer, e.g. "HO-1A2B3C4D"; one per conversation. */
  reference: string;
  /** From the gateway-verified identity, never from the model or the customer. */
  userId: string;
  conversationId: string;
  reason: HandoffReason;
  /** Written by the assistant, 1–500 characters. */
  summary: string;
  /** ISO timestamp. */
  requestedAt: string;
}

/** Returns only the known fields, so nothing else (e.g. a transcript) passes through. */
export const parseHandoffRequested = (data: unknown): HandoffRequestedData => {
  const read = reader('assistant.handoff_requested', data);
  return {
    reference: read.text('reference'),
    userId: read.text('userId'),
    conversationId: read.text('conversationId'),
    reason: read.oneOf('reason', HANDOFF_REASONS),
    summary: read.shortText('summary', MAX_HANDOFF_SUMMARY),
    requestedAt: read.text('requestedAt'),
  };
};
