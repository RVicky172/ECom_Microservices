import {
  EventTypes,
  KafkaTopics,
  parseOrderCreated,
  parsePaymentCompleted,
  parsePaymentFailed,
  publishEvent,
} from '@ecommerce/shared';
import type {
  InventoryRejectedData,
  InventoryReservedData,
  OrderCreatedData,
  PaymentCompletedData,
  PaymentFailedData,
  SagaEnvelope,
  SagaItem,
} from '@ecommerce/shared';
import type { Producer } from 'kafkajs';
import { db } from '../models/inventoryModel';
import { finalizeStock, releaseStock, reserveStock } from '../services/inventoryService';

type Logger = { info: Function; warn: Function; error: Function };

/** Idempotency (Section 8.5): an event ID already in `processed_events` is skipped. */
const alreadyProcessed = async (eventId: string): Promise<boolean> =>
  Boolean(await db('processed_events').where({ event_id: eventId }).first());

/** Parses a payload, or logs why it cannot and returns undefined. */
const readOrLog = <T>(parse: (data: unknown) => T, event: SagaEnvelope, logger: Logger): T | undefined => {
  try {
    return parse(event.data);
  } catch (err) {
    logger.error({ err: (err as Error).message, eventId: event.eventId }, 'Unreadable saga event');
    return undefined;
  }
};

/**
 * order.created: reserve every item in one transaction, then publish
 * inventory.reserved with what payment needs (orderId, userId, items, total:
 * gap G3), or inventory.rejected with reason OUT_OF_STOCK.
 */
export const handleOrderCreated = async (
  event: SagaEnvelope,
  correlationId: string,
  logger: Logger,
  producer: Producer,
): Promise<void> => {
  if (await alreadyProcessed(event.eventId)) {
    logger.info({ eventId: event.eventId }, 'Event already processed, skipping');
    return;
  }
  const order = readOrLog<OrderCreatedData>(parseOrderCreated, event, logger);
  if (!order) return;

  try {
    await db.transaction(async (trx: any) => {
      await trx('processed_events').insert({ event_id: event.eventId });
      for (const item of order.items) {
        if (!(await reserveStock(trx, item.productId, item.quantity))) throw new Error('Insufficient stock');
      }
    });
  } catch (err) {
    logger.warn({ orderId: order.orderId, err: (err as Error).message }, 'Failed to reserve stock');
    await db('processed_events').insert({ event_id: event.eventId }).onConflict('event_id').ignore();
    const rejected: InventoryRejectedData = { orderId: order.orderId, reason: 'OUT_OF_STOCK' };
    await publishEvent(producer, KafkaTopics.INVENTORY_REJECTED, EventTypes.INVENTORY_REJECTED, order.orderId, rejected, correlationId);
    return;
  }

  logger.info({ orderId: order.orderId }, 'Stock reserved successfully');
  const reserved: InventoryReservedData = {
    orderId: order.orderId,
    userId: order.userId,
    items: order.items,
    totalAmount: order.totalAmount,
  };
  await publishEvent(producer, KafkaTopics.INVENTORY_RESERVED, EventTypes.INVENTORY_RESERVED, order.orderId, reserved, correlationId);
};

/** Applies `change` to every item of a payment outcome, once per event ID. */
const settleStock = async (
  event: SagaEnvelope,
  items: SagaItem[],
  change: (trx: any, productId: string, quantity: number) => Promise<void>,
): Promise<boolean> => {
  if (await alreadyProcessed(event.eventId)) return false;
  await db.transaction(async (trx: any) => {
    await trx('processed_events').insert({ event_id: event.eventId });
    for (const item of items) await change(trx, item.productId, item.quantity);
  });
  return true;
};

/** payment.completed: the reserved units are sold, so drop them from `reserved` (gap G4: items now present). */
export const handlePaymentCompleted = async (event: SagaEnvelope, _correlationId: string, logger: Logger): Promise<void> => {
  const payment = readOrLog<PaymentCompletedData>(parsePaymentCompleted, event, logger);
  if (!payment) return;
  if (await settleStock(event, payment.items, finalizeStock)) {
    logger.info({ orderId: payment.orderId }, 'Stock finalized after successful payment');
  } else {
    logger.info({ eventId: event.eventId }, 'Event already processed, skipping');
  }
};

/** payment.failed: give the reserved units back (gap G4: items now present). */
export const handlePaymentFailed = async (event: SagaEnvelope, _correlationId: string, logger: Logger): Promise<void> => {
  const payment = readOrLog<PaymentFailedData>(parsePaymentFailed, event, logger);
  if (!payment) return;
  if (await settleStock(event, payment.items, releaseStock)) {
    logger.info({ orderId: payment.orderId }, 'Stock released due to payment failure');
  } else {
    logger.info({ eventId: event.eventId }, 'Event already processed, skipping');
  }
};
