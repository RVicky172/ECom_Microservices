import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors';
import {
  ANSWER_RATINGS,
  CANCEL_REASONS,
  canTransitionOrder,
  EventTypes,
  HANDOFF_REASONS,
  INTERACTION_OUTCOMES,
  KafkaTopics,
  MAX_HANDOFF_SUMMARY,
  OrderStatus,
  parseAssistantFeedback,
  parseAssistantInteraction,
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

describe('assistant analytics events (012)', () => {
  const CONVERSATION_ID = 'b0c5d1a2-0a8e-4a3f-9a57-0d0c2e7b9f11';
  const ANSWER_ID = '3f2c9e1a-7b4d-4c8e-9a1f-2d6b5e8c0a47';

  const interaction = {
    conversationId: CONVERSATION_ID,
    answerId: ANSWER_ID,
    provider: 'openai-compatible',
    model: 'qwen/qwen3-30b-a3b-2507',
    stopReason: 'end_turn',
    outcome: 'proposal',
    tools: ['search_products', 'propose_add_to_cart'],
    latencyMs: 4721,
    usage: { inputTokens: 1857, cachedInputTokens: 0, outputTokens: 96 },
    completedAt: '2026-10-24T12:00:00.000Z',
  };
  const feedback = {
    conversationId: CONVERSATION_ID,
    answerId: ANSWER_ID,
    rating: 'down',
    ratedAt: '2026-10-24T12:01:00.000Z',
  };

  it('has its own topics and event types', () => {
    expect(KafkaTopics.ASSISTANT_INTERACTION).toBe('assistant.interaction');
    expect(KafkaTopics.ASSISTANT_FEEDBACK).toBe('assistant.feedback');
    expect(EventTypes.INTERACTION_COMPLETED).toBe('INTERACTION_COMPLETED');
    expect(EventTypes.ANSWER_RATED).toBe('ANSWER_RATED');
  });

  it('knows exactly six outcomes and two ratings', () => {
    expect([...INTERACTION_OUTCOMES]).toEqual(['answered', 'proposal', 'handoff', 'refused', 'error', 'limited']);
    expect([...ANSWER_RATINGS]).toEqual(['up', 'down']);
  });

  describe('assistant.interaction', () => {
    const message = (field: string) => `assistant.interaction: ${field} missing or invalid`;

    it('accepts a complete payload and returns its fields', () => {
      expect(parseAssistantInteraction(interaction)).toEqual(interaction);
    });

    it('accepts usage: null (the provider reported none), a null stop reason and no tools', () => {
      const quiet = { ...interaction, usage: null, stopReason: null, tools: [] };
      expect(parseAssistantInteraction(quiet)).toEqual(quiet);
    });

    it('returns only the known fields (no user ID or text passes through)', () => {
      expect(parseAssistantInteraction({ ...interaction, userId: USER_ID, text: 'hi' })).toEqual(interaction);
    });

    it.each([
      'conversationId',
      'answerId',
      'provider',
      'model',
      'stopReason',
      'outcome',
      'tools',
      'latencyMs',
      'usage',
      'completedAt',
    ])('rejects a payload without %s, naming the event and the field', (field) => {
      const { [field]: _dropped, ...incomplete } = interaction as Record<string, unknown>;
      const error = rejectionOf(parseAssistantInteraction, incomplete);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe(message(field));
    });

    it.each([
      ['an unknown outcome', { outcome: 'great' }, 'outcome'],
      ['a conversation ID that is not a UUID', { conversationId: 'abc' }, 'conversationId'],
      ['an answer ID that is not a UUID', { answerId: 'answer-1' }, 'answerId'],
      ['a negative latency', { latencyMs: -1 }, 'latencyMs'],
      ['a fractional latency', { latencyMs: 1.5 }, 'latencyMs'],
      ['a tool name that is not a string', { tools: ['search_products', 7] }, 'tools'],
      ['tools that are not a list', { tools: 'search_products' }, 'tools'],
      ['a non-ISO timestamp', { completedAt: '24/10/2026 12:00' }, 'completedAt'],
      ['an impossible ISO date', { completedAt: '2026-13-45T12:00:00.000Z' }, 'completedAt'],
      ['a 30 February that Date.parse rolls over', { completedAt: '2026-02-30T12:00:00.000Z' }, 'completedAt'],
      ['a timestamp with an offset instead of Z', { completedAt: '2026-10-24T12:00:00.000+02:00' }, 'completedAt'],
      ['a timestamp that is a number', { completedAt: 1792825044000 }, 'completedAt'],
      ['a negative input token count', { usage: { ...interaction.usage, inputTokens: -3 } }, 'usage.inputTokens'],
      ['a fractional cached token count', { usage: { ...interaction.usage, cachedInputTokens: 0.5 } }, 'usage.cachedInputTokens'],
      ['a missing output token count', { usage: { inputTokens: 1, cachedInputTokens: 0 } }, 'usage.outputTokens'],
      ['usage that is not an object', { usage: 12 }, 'usage'],
    ])('rejects %s', (_case, change, field) => {
      expect(rejectionOf(parseAssistantInteraction, { ...interaction, ...change }).message).toBe(message(field));
    });

    it('rejects something that is not an object', () => {
      expect(rejectionOf(parseAssistantInteraction, null)).toBeInstanceOf(ValidationError);
    });
  });

  describe('assistant.feedback', () => {
    const message = (field: string) => `assistant.feedback: ${field} missing or invalid`;

    it('accepts a complete payload and returns its fields', () => {
      expect(parseAssistantFeedback(feedback)).toEqual(feedback);
      expect(parseAssistantFeedback({ ...feedback, rating: 'up' }).rating).toBe('up');
    });

    it('returns only the known fields (no user ID or comment passes through)', () => {
      expect(parseAssistantFeedback({ ...feedback, userId: USER_ID, comment: 'bad' })).toEqual(feedback);
    });

    it.each(['conversationId', 'answerId', 'rating', 'ratedAt'])(
      'rejects a payload without %s, naming the event and the field',
      (field) => {
        const { [field]: _dropped, ...incomplete } = feedback as Record<string, unknown>;
        expect(rejectionOf(parseAssistantFeedback, incomplete).message).toBe(message(field));
      },
    );

    it.each([
      ['an unknown rating', { rating: 'meh' }, 'rating'],
      ['a non-ISO timestamp', { ratedAt: 'yesterday' }, 'ratedAt'],
      ['an answer ID that is not a UUID', { answerId: '42' }, 'answerId'],
    ])('rejects %s', (_case, change, field) => {
      expect(rejectionOf(parseAssistantFeedback, { ...feedback, ...change }).message).toBe(message(field));
    });
  });
});
