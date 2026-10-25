/**
 * The saga's shared vocabulary: Kafka topics, event types, the order state machine, and each event's payload type
 * with a parser that validates it on the consumer side.
 */
import { ValidationError } from './errors';

/**
 * Kafka topic names. Central registry so producers and consumers stay in sync.
 */
export enum KafkaTopics {
  ORDER_CREATED = 'order.created',
  INVENTORY_RESERVED = 'inventory.reserved',
  INVENTORY_REJECTED = 'inventory.rejected',
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
  ORDER_SHIPPED = 'order.shipped',
  ASSISTANT_HANDOFF_REQUESTED = 'assistant.handoff_requested',
  ASSISTANT_INTERACTION = 'assistant.interaction',
  ASSISTANT_FEEDBACK = 'assistant.feedback',
}

/** The `eventType` of a saga envelope (and its `event-type` header). */
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
  INTERACTION_COMPLETED = 'INTERACTION_COMPLETED',
  ANSWER_RATED = 'ANSWER_RATED',
}

/**
 * The states of an order (Section 3.3).
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  INVENTORY_RESERVED = 'INVENTORY_RESERVED',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

/** The order state machine: the statuses each status may move to. `DELIVERED` and `CANCELLED` are final. */
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
/** One of `CANCEL_REASONS`. */
export type CancelReason = (typeof CANCEL_REASONS)[number];

/**
 * Saga event payloads (the `data` of each Kafka message). Producers build these
 * and consumers read them through the parsers below, so the two cannot drift
 * apart (Constitution V: change producer, consumers and this file together).
 *
 * `SagaItem` is one order line as it travels through the saga.
 */
export interface SagaItem {
  productId: string;
  quantity: number;
  productName?: string;
  price?: number;
}

/** `order.created`: order → inventory. Starts the saga. */
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

/** `inventory.rejected`: inventory → order, which cancels with `OUT_OF_STOCK`. */
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

/** `payment.failed`: payment → order (cancels) and inventory (releases the reserved items). */
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads fields of one payload; `prefix` names a nested object in errors (e.g. `usage.`). */
const reader = (event: string, data: unknown, prefix = '') => {
  const invalid = (field: string) => new ValidationError(`${event}: ${prefix}${field} missing or invalid`);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ValidationError(`${event}: ${prefix ? prefix.slice(0, -1) : 'payload'} missing or invalid`);
  }
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
  const nullableText = (field: string): string | null => (fields[field] === null ? null : text(field));
  /** A non-negative integer (token counts, milliseconds). */
  const count = (field: string): number => {
    const value = fields[field];
    if (!Number.isInteger(value) || (value as number) < 0) throw invalid(field);
    return value as number;
  };
  /** A list of non-empty strings; may be empty. */
  const stringList = (field: string): string[] => {
    const value = fields[field];
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.trim() !== '')) {
      throw invalid(field);
    }
    return [...value];
  };
  /** Exactly as `Date.toISOString()` writes it, so other formats and impossible dates fail. */
  const iso = (field: string): string => {
    const value = fields[field];
    const time = typeof value === 'string' ? Date.parse(value) : NaN;
    if (Number.isNaN(time) || new Date(time).toISOString() !== value) throw invalid(field);
    return value as string;
  };
  const uuid = (field: string): string => {
    const value = fields[field];
    if (typeof value !== 'string' || !UUID.test(value)) throw invalid(field);
    return value;
  };
  /** A nested object, or `null` when the field is explicitly null; missing is invalid. */
  const nullableObject = <T>(field: string, read: (nested: ReturnType<typeof reader>) => T): T | null => {
    if (!(field in fields)) throw invalid(field);
    if (fields[field] === null) return null;
    return read(reader(event, fields[field], `${prefix}${field}.`));
  };
  return { text, amount, items, literal, oneOf, shortText, nullableText, count, stringList, iso, uuid, nullableObject };
};

/**
 * The parsers below validate an envelope's `data` and return only the known fields.
 *
 * @throws ValidationError naming the event and the first missing or invalid field
 */
export const parseOrderCreated = (data: unknown): OrderCreatedData => {
  const read = reader('order.created', data);
  return { orderId: read.text('orderId'), userId: read.text('userId'), items: read.items(), totalAmount: read.amount('totalAmount') };
};

/** Validates `inventory.reserved` data (see `parseOrderCreated`). */
export const parseInventoryReserved = (data: unknown): InventoryReservedData => {
  const read = reader('inventory.reserved', data);
  return { orderId: read.text('orderId'), userId: read.text('userId'), items: read.items(), totalAmount: read.amount('totalAmount') };
};

/** Validates `inventory.rejected` data (see `parseOrderCreated`). */
export const parseInventoryRejected = (data: unknown): InventoryRejectedData => {
  const read = reader('inventory.rejected', data);
  return { orderId: read.text('orderId'), reason: read.literal('reason', 'OUT_OF_STOCK') };
};

/** Validates `payment.completed` data (see `parseOrderCreated`). */
export const parsePaymentCompleted = (data: unknown): PaymentCompletedData => {
  const read = reader('payment.completed', data);
  return { orderId: read.text('orderId'), items: read.items(), amount: read.amount('amount') };
};

/** Validates `payment.failed` data (see `parseOrderCreated`). */
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
/** One of `HANDOFF_REASONS`. */
export type HandoffReason = (typeof HANDOFF_REASONS)[number];
/** The longest handoff summary, in characters; a longer one is rejected, not cut. */
export const MAX_HANDOFF_SUMMARY = 500;

/** `assistant.handoff_requested` payload. */
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

/**
 * Assistant usage analytics (feature 012). One `assistant.interaction` per finished chat
 * turn and one `assistant.feedback` per rating, keyed by conversation ID so they can be
 * joined on `answerId`. Neither carries a user ID or any message text (design doc §6).
 */
export const INTERACTION_OUTCOMES = ['answered', 'proposal', 'handoff', 'refused', 'error', 'limited'] as const;
/** One of `INTERACTION_OUTCOMES`. */
export type InteractionOutcome = (typeof INTERACTION_OUTCOMES)[number];
/** The votes a shopper can give an answer. */
export const ANSWER_RATINGS = ['up', 'down'] as const;
/** One of `ANSWER_RATINGS`. */
export type AnswerRating = (typeof ANSWER_RATINGS)[number];

/** Same meaning for every provider (D-025): input + cached input = the whole prompt. */
export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

/** `assistant.interaction` payload: one finished chat turn, with no user ID or text. */
export interface AssistantInteractionData {
  conversationId: string;
  answerId: string;
  provider: string;
  model: string;
  stopReason: string | null;
  outcome: InteractionOutcome;
  /** Tool names in call order. */
  tools: string[];
  latencyMs: number;
  /** `null` when the provider reported no usage, never zeros. */
  usage: TokenUsage | null;
  /** ISO timestamp. */
  completedAt: string;
}

/** `assistant.feedback` payload: one rating, joined to its turn on `answerId`. */
export interface AssistantFeedbackData {
  conversationId: string;
  answerId: string;
  rating: AnswerRating;
  /** ISO timestamp. */
  ratedAt: string;
}

/** Returns only the known fields, so a user ID or text can't pass through. */
export const parseAssistantInteraction = (data: unknown): AssistantInteractionData => {
  const read = reader('assistant.interaction', data);
  return {
    conversationId: read.uuid('conversationId'),
    answerId: read.uuid('answerId'),
    provider: read.text('provider'),
    model: read.text('model'),
    stopReason: read.nullableText('stopReason'),
    outcome: read.oneOf('outcome', INTERACTION_OUTCOMES),
    tools: read.stringList('tools'),
    latencyMs: read.count('latencyMs'),
    usage: read.nullableObject('usage', (usage) => ({
      inputTokens: usage.count('inputTokens'),
      cachedInputTokens: usage.count('cachedInputTokens'),
      outputTokens: usage.count('outputTokens'),
    })),
    completedAt: read.iso('completedAt'),
  };
};

/** Validates `assistant.feedback` data (see `parseOrderCreated`). */
export const parseAssistantFeedback = (data: unknown): AssistantFeedbackData => {
  const read = reader('assistant.feedback', data);
  return {
    conversationId: read.uuid('conversationId'),
    answerId: read.uuid('answerId'),
    rating: read.oneOf('rating', ANSWER_RATINGS),
    ratedAt: read.iso('ratedAt'),
  };
};
