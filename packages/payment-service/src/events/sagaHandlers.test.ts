import { EventTypes, KafkaTopics, parsePaymentCompleted, parsePaymentFailed, publishEvent } from '@ecommerce/shared';
import type { SagaEnvelope } from '@ecommerce/shared';
import type { Producer } from 'kafkajs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processPayment } from '../services/paymentService';
import { handleInventoryReserved } from './sagaHandlers';

vi.mock('../services/paymentService', () => ({ processPayment: vi.fn() }));
vi.mock('@ecommerce/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ecommerce/shared')>()),
  publishEvent: vi.fn(async () => {}),
}));

const ORDER_ID = '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16';
const USER_ID = '16be8435-63db-4cd3-9c33-e8de62839df2';
const items = [{ productId: 'mouse', productName: 'Mouse', price: 25, quantity: 2 }];
const producer = {} as Producer;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const reserved = (eventId: string, data: unknown = { orderId: ORDER_ID, userId: USER_ID, items, totalAmount: 50 }): SagaEnvelope => ({
  eventId,
  eventType: 'INVENTORY_RESERVED',
  aggregateId: ORDER_ID,
  data,
  timestamp: 't',
});
const outcome = (status: 'COMPLETED' | 'FAILED') =>
  vi.mocked(processPayment).mockResolvedValue({ id: 'pay-1', order_id: ORDER_ID, amount: 50, status } as never);
const published = () => vi.mocked(publishEvent).mock.calls.map(([, topic, type, key, data, correlationId, eventId]) => ({ topic, type, key, data, correlationId, eventId }));

describe('payment saga handler (inventory.reserved)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('charges the order total once per event, keyed by the event ID (G3)', async () => {
    outcome('COMPLETED');
    await handleInventoryReserved(reserved('11111111-1111-4111-8111-111111111111'), 'corr-1', logger, producer);
    expect(processPayment).toHaveBeenCalledWith(ORDER_ID, 50, 'evt_11111111-1111-4111-8111-111111111111');
  });

  it('publishes payment.completed with the items, so inventory can finalize them (G4)', async () => {
    outcome('COMPLETED');
    await handleInventoryReserved(reserved('11111111-1111-4111-8111-111111111111'), 'corr-1', logger, producer);
    const [event] = published();
    expect(event).toMatchObject({ topic: KafkaTopics.PAYMENT_COMPLETED, type: EventTypes.PAYMENT_COMPLETED, key: ORDER_ID, correlationId: 'corr-1' });
    expect(event.data).toEqual({ orderId: ORDER_ID, items, amount: 50 });
    expect(() => parsePaymentCompleted(event.data)).not.toThrow(); // contract with order, inventory, notification (AC-9)
  });

  it('publishes payment.failed with the items and reason PAYMENT_DECLINED', async () => {
    outcome('FAILED');
    await handleInventoryReserved(reserved('11111111-1111-4111-8111-111111111111'), 'corr-1', logger, producer);
    const [event] = published();
    expect(event).toMatchObject({ topic: KafkaTopics.PAYMENT_FAILED, type: EventTypes.PAYMENT_FAILED });
    expect(event.data).toEqual({ orderId: ORDER_ID, items, amount: 50, reason: 'PAYMENT_DECLINED' });
    expect(() => parsePaymentFailed(event.data)).not.toThrow();
  });

  it('gives a redelivered event the same outcome event ID, so downstream services skip the repeat (AC-7)', async () => {
    outcome('COMPLETED');
    await handleInventoryReserved(reserved('11111111-1111-4111-8111-111111111111'), 'c', logger, producer);
    await handleInventoryReserved(reserved('11111111-1111-4111-8111-111111111111'), 'c', logger, producer);
    await handleInventoryReserved(reserved('22222222-2222-4222-8222-222222222222'), 'c', logger, producer);

    const [first, repeat, other] = published().map((event) => event.eventId);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/); // a v5 UUID
    expect(repeat).toBe(first);
    expect(other).not.toBe(first);
  });

  it('logs an unreadable inventory.reserved and charges nothing', async () => {
    await handleInventoryReserved(reserved('e', { orderId: ORDER_ID }), 'c', logger, producer);
    expect(logger.error).toHaveBeenCalled();
    expect(processPayment).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
  });
});
