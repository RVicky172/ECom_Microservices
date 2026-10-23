import { EventTypes, KafkaTopics, parseInventoryRejected, parseInventoryReserved, publishEvent } from '@ecommerce/shared';
import type { SagaEnvelope } from '@ecommerce/shared';
import type { Producer } from 'kafkajs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeStock, releaseStock, reserveStock } from '../services/inventoryService';
import { handleOrderCreated, handlePaymentCompleted, handlePaymentFailed } from './sagaHandlers';

/** Records `processed_events` rows; `db.transaction(cb)` runs `cb` with a recording `trx`. */
const store = vi.hoisted(() => ({ processed: new Set<string>(), inserted: [] as string[] }));

vi.mock('../models/inventoryModel', () => {
  const insertInto = (table: string) => (row: { event_id: string }) => {
    store.inserted.push(`${table}:${row.event_id}`);
    store.processed.add(row.event_id);
    const done = Promise.resolve();
    return Object.assign(done, { onConflict: () => ({ ignore: async () => {} }) });
  };
  const db = Object.assign(
    (table: string) => ({
      where: ({ event_id }: { event_id: string }) => ({ first: async () => (store.processed.has(event_id) ? { event_id } : undefined) }),
      insert: insertInto(table),
    }),
    { transaction: async (work: (trx: unknown) => Promise<void>) => work((table: string) => ({ insert: insertInto(table) })) },
  );
  return { db };
});

vi.mock('../services/inventoryService', () => ({
  reserveStock: vi.fn(async () => true),
  releaseStock: vi.fn(async () => {}),
  finalizeStock: vi.fn(async () => {}),
}));

vi.mock('@ecommerce/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ecommerce/shared')>()),
  publishEvent: vi.fn(async () => {}),
}));

const ORDER_ID = '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16';
const USER_ID = '16be8435-63db-4cd3-9c33-e8de62839df2';
const items = [
  { productId: 'mouse', productName: 'Mouse', price: 25, quantity: 2 },
  { productId: 'keyboard', productName: 'Keyboard', price: 75, quantity: 1 },
];
const producer = {} as Producer;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const envelope = (eventId: string, data: unknown): SagaEnvelope => ({ eventId, eventType: 'X', aggregateId: ORDER_ID, data, timestamp: 't' });
const published = () => vi.mocked(publishEvent).mock.calls.map(([, topic, type, key, data]) => ({ topic, type, key, data }));

describe('inventory saga handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.processed.clear();
    store.inserted.length = 0;
  });

  describe('order.created', () => {
    const created = envelope('evt-created', { orderId: ORDER_ID, userId: USER_ID, items, totalAmount: 125 });

    it('reserves every item and forwards what payment needs in inventory.reserved (G3)', async () => {
      await handleOrderCreated(created, 'corr-1', logger, producer);

      expect(vi.mocked(reserveStock).mock.calls.map(([, productId, quantity]) => [productId, quantity])).toEqual([
        ['mouse', 2],
        ['keyboard', 1],
      ]);
      const [event] = published();
      expect(event).toMatchObject({ topic: KafkaTopics.INVENTORY_RESERVED, type: EventTypes.INVENTORY_RESERVED, key: ORDER_ID });
      expect(event.data).toEqual({ orderId: ORDER_ID, userId: USER_ID, items, totalAmount: 125 });
      expect(() => parseInventoryReserved(event.data)).not.toThrow(); // contract with payment and order (AC-9)
      expect(vi.mocked(publishEvent).mock.calls[0][5]).toBe('corr-1');
    });

    it('rejects with reason OUT_OF_STOCK when any item cannot be reserved', async () => {
      vi.mocked(reserveStock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      await handleOrderCreated(created, 'corr-1', logger, producer);

      const [event] = published();
      expect(event).toMatchObject({ topic: KafkaTopics.INVENTORY_REJECTED, type: EventTypes.INVENTORY_REJECTED });
      expect(event.data).toEqual({ orderId: ORDER_ID, reason: 'OUT_OF_STOCK' });
      expect(() => parseInventoryRejected(event.data)).not.toThrow();
      expect(store.processed.has('evt-created')).toBe(true);
    });

    it('skips an order.created it has already processed: no reservation, no event', async () => {
      store.processed.add('evt-created');
      await handleOrderCreated(created, 'corr-1', logger, producer);
      expect(reserveStock).not.toHaveBeenCalled();
      expect(publishEvent).not.toHaveBeenCalled();
    });

    it('logs an unreadable order.created and publishes nothing', async () => {
      await handleOrderCreated(envelope('evt-bad', { orderId: ORDER_ID }), 'c', logger, producer);
      expect(logger.error).toHaveBeenCalled();
      expect(reserveStock).not.toHaveBeenCalled();
      expect(publishEvent).not.toHaveBeenCalled();
    });
  });

  describe('payment outcomes (G4)', () => {
    const completed = envelope('evt-paid', { orderId: ORDER_ID, items, amount: 125 });
    const failed = envelope('evt-declined', { orderId: ORDER_ID, items, amount: 125, reason: 'PAYMENT_DECLINED' });

    it('finalizes every item once payment completes', async () => {
      await handlePaymentCompleted(completed, 'c', logger);
      expect(vi.mocked(finalizeStock).mock.calls.map(([, productId, quantity]) => [productId, quantity])).toEqual([
        ['mouse', 2],
        ['keyboard', 1],
      ]);
      expect(store.inserted).toEqual(['processed_events:evt-paid']);
    });

    it('releases every item once payment fails', async () => {
      await handlePaymentFailed(failed, 'c', logger);
      expect(vi.mocked(releaseStock).mock.calls.map(([, productId, quantity]) => [productId, quantity])).toEqual([
        ['mouse', 2],
        ['keyboard', 1],
      ]);
    });

    it.each([
      ['payment.completed', () => handlePaymentCompleted(completed, 'c', logger), 'evt-paid'],
      ['payment.failed', () => handlePaymentFailed(failed, 'c', logger), 'evt-declined'],
    ])('does not touch stock twice when %s is delivered again', async (_topic, handle, eventId) => {
      store.processed.add(eventId);
      await handle();
      expect(finalizeStock).not.toHaveBeenCalled();
      expect(releaseStock).not.toHaveBeenCalled();
    });
  });
});
