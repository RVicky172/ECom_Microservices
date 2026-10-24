import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors';
import {
  CANCEL_REASONS,
  canTransitionOrder,
  EventTypes,
  HANDOFF_REASONS,
  KafkaTopics,
  MAX_HANDOFF_SUMMARY,
  OrderStatus,
  parseHandoffRequested,
  parseInventoryRejected,
  parseInventoryReserved,
  parseOrderCreated,
  parsePaymentCompleted,
  parsePaymentFailed,
  VALID_ORDER_TRANSITIONS,
} from './events';

const allStatuses = Object.values(OrderStatus);

describe('order state machine', () => {
  it('has a transition entry for every status', () => {
    expect(Object.keys(VALID_ORDER_TRANSITIONS).sort()).toEqual([...allStatuses].sort());
  });

  // Written out rather than read from the table, so removing a transition fails a test (design doc §3.3).
  const allowed: [OrderStatus, OrderStatus][] = [
    [OrderStatus.PENDING, OrderStatus.INVENTORY_RESERVED],
    [OrderStatus.PENDING, OrderStatus.CANCELLED],
    [OrderStatus.INVENTORY_RESERVED, OrderStatus.CONFIRMED],
    [OrderStatus.INVENTORY_RESERVED, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED, OrderStatus.SHIPPED],
    [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    [OrderStatus.SHIPPED, OrderStatus.DELIVERED],
  ];

  it.each(allowed)('allows %s → %s', (from, to) => {
    expect(canTransitionOrder(from, to)).toBe(true);
  });

  it('allows nothing beyond those transitions', () => {
    const listed = Object.entries(VALID_ORDER_TRANSITIONS).flatMap(([from, targets]) => targets.map((to) => [from, to]));
    expect(listed.sort()).toEqual([...allowed].sort());
  });

  it.each([
    [OrderStatus.PENDING, OrderStatus.CONFIRMED], // skips inventory reservation
    [OrderStatus.SHIPPED, OrderStatus.CANCELLED], // too late to cancel
    [OrderStatus.DELIVERED, OrderStatus.CANCELLED], // terminal
    [OrderStatus.CANCELLED, OrderStatus.PENDING], // terminal
    [OrderStatus.PENDING, OrderStatus.PENDING], // no self-transition
  ])('rejects %s → %s', (from, to) => {
    expect(canTransitionOrder(from, to)).toBe(false);
  });

  it('allows nothing out of a terminal status', () => {
    for (const to of allStatuses) {
      expect(canTransitionOrder(OrderStatus.DELIVERED, to)).toBe(false);
      expect(canTransitionOrder(OrderStatus.CANCELLED, to)).toBe(false);
    }
  });

  it('rejects unknown statuses', () => {
    expect(canTransitionOrder('SHIPPING', OrderStatus.DELIVERED)).toBe(false);
    expect(canTransitionOrder(OrderStatus.PENDING, 'PAID')).toBe(false);
  });
});

const ORDER_ID = '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16';
const USER_ID = '16be8435-63db-4cd3-9c33-e8de62839df2';
const items = [{ productId: '6aa90ece96384c76af92529b', productName: 'Mouse', price: 25, quantity: 2 }];

/** The ValidationError a parser throws, so its message can be checked. */
const rejectionOf = (parse: (data: unknown) => unknown, data: unknown): ValidationError => {
  try {
    parse(data);
  } catch (error) {
    return error as ValidationError;
  }
  throw new Error('expected the parser to reject');
};

describe('saga event payloads', () => {
  // Each parser with a complete payload, then the fields that must each be present.
  const cases = [
    {
      event: 'order.created',
      parse: parseOrderCreated,
      valid: { orderId: ORDER_ID, userId: USER_ID, items, totalAmount: 50 },
      required: ['orderId', 'userId', 'items', 'totalAmount'],
    },
    {
      event: 'inventory.reserved',
      parse: parseInventoryReserved,
      valid: { orderId: ORDER_ID, userId: USER_ID, items, totalAmount: 50 },
      required: ['orderId', 'userId', 'items', 'totalAmount'],
    },
    {
      event: 'inventory.rejected',
      parse: parseInventoryRejected,
      valid: { orderId: ORDER_ID, reason: 'OUT_OF_STOCK' },
      required: ['orderId', 'reason'],
    },
    {
      event: 'payment.completed',
      parse: parsePaymentCompleted,
      valid: { orderId: ORDER_ID, items, amount: 50 },
      required: ['orderId', 'items', 'amount'],
    },
    {
      event: 'payment.failed',
      parse: parsePaymentFailed,
      valid: { orderId: ORDER_ID, items, amount: 50, reason: 'PAYMENT_DECLINED' },
      required: ['orderId', 'items', 'amount', 'reason'],
    },
  ] as const;

  describe.each(cases)('$event', ({ event, parse, valid, required }) => {
    it('accepts a complete payload and returns its fields', () => {
      expect(parse(valid)).toEqual(valid);
    });

    it.each(required)('rejects a payload without %s, naming the event and the field', (field) => {
      const { [field]: _dropped, ...incomplete } = valid as Record<string, unknown>;
      const error = rejectionOf(parse, incomplete);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe(`${event}: ${field} missing or invalid`);
    });

    it('rejects something that is not an object', () => {
      expect(rejectionOf(parse, undefined)).toBeInstanceOf(ValidationError);
    });
  });

  it.each([
    ['an empty items list', { orderId: ORDER_ID, items: [], amount: 50 }, 'items'],
    ['an item without a productId', { orderId: ORDER_ID, items: [{ quantity: 1 }], amount: 50 }, 'items'],
    ['an item with quantity 0', { orderId: ORDER_ID, items: [{ productId: 'p', quantity: 0 }], amount: 50 }, 'items'],
    ['a non-numeric amount', { orderId: ORDER_ID, items, amount: 'fifty' }, 'amount'],
    ['a negative amount', { orderId: ORDER_ID, items, amount: -1 }, 'amount'],
  ])('payment.completed rejects %s', (_case, data, field) => {
    expect(rejectionOf(parsePaymentCompleted, data).message).toBe(`payment.completed: ${field} missing or invalid`);
  });

  it('rejects a reason that does not belong to the event', () => {
    const error = rejectionOf(parsePaymentFailed, { orderId: ORDER_ID, items, amount: 50, reason: 'OUT_OF_STOCK' });
    expect(error.message).toBe('payment.failed: reason missing or invalid');
  });

  it('knows exactly two cancel reasons', () => {
    expect([...CANCEL_REASONS].sort()).toEqual(['OUT_OF_STOCK', 'PAYMENT_DECLINED']);
  });
});

describe('assistant handoff event (011)', () => {
  const valid = {
    reference: 'HO-1A2B3C4D',
    userId: USER_ID,
    conversationId: 'b0c5d1a2-0a8e-4a3f-9a57-0d0c2e7b9f11',
    reason: 'customer_request',
    summary: 'Customer wants to talk to a person about a late order.',
    requestedAt: '2026-10-23T12:00:00.000Z',
  };

  it('has its own topic and event type', () => {
    expect(KafkaTopics.ASSISTANT_HANDOFF_REQUESTED).toBe('assistant.handoff_requested');
    expect(EventTypes.HANDOFF_REQUESTED).toBe('HANDOFF_REQUESTED');
  });

  it('knows exactly four reasons', () => {
    expect([...HANDOFF_REASONS].sort()).toEqual(['customer_request', 'order_problem', 'other', 'policy_not_covered']);
  });

  it('accepts a complete payload and returns its fields', () => {
    expect(parseHandoffRequested(valid)).toEqual(valid);
  });

  it('returns only the six known fields, dropping anything else (no transcript passes through)', () => {
    expect(parseHandoffRequested({ ...valid, transcript: [{ role: 'user', text: 'hi' }] })).toEqual(valid);
  });

  it.each(['reference', 'userId', 'conversationId', 'reason', 'summary', 'requestedAt'])(
    'rejects a payload without %s, naming the event and the field',
    (field) => {
      const { [field]: _dropped, ...incomplete } = valid as Record<string, unknown>;
      const error = rejectionOf(parseHandoffRequested, incomplete);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe(`assistant.handoff_requested: ${field} missing or invalid`);
    },
  );

  it.each([
    ['an unknown reason', { reason: 'angry_customer' }, 'reason'],
    ['an empty summary', { summary: '  ' }, 'summary'],
    ['a summary one character over the cap', { summary: 'x'.repeat(501) }, 'summary'],
  ])('rejects %s', (_case, change, field) => {
    expect(rejectionOf(parseHandoffRequested, { ...valid, ...change }).message).toBe(
      `assistant.handoff_requested: ${field} missing or invalid`,
    );
  });

  it('accepts a summary of exactly the cap', () => {
    expect(MAX_HANDOFF_SUMMARY).toBe(500);
    const summary = 'x'.repeat(500);
    expect(parseHandoffRequested({ ...valid, summary }).summary).toBe(summary);
  });

  it('rejects something that is not an object', () => {
    expect(rejectionOf(parseHandoffRequested, null)).toBeInstanceOf(ValidationError);
  });
});
