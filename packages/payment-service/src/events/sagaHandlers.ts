/** Payment's part of the checkout saga: charge the order once stock is reserved, and publish the outcome. */
import { EventTypes, KafkaTopics, parseInventoryReserved, publishEvent, uuidV5 } from '@ecommerce/shared';
import type { InventoryReservedData, PaymentCompletedData, PaymentFailedData, SagaEnvelope } from '@ecommerce/shared';
import type { Producer } from 'kafkajs';
import { processPayment } from '../services/paymentService';

type Logger = { info: Function; warn: Function; error: Function };

/** Namespace for outcome event IDs derived from the inventory.reserved event that caused them. */
const PAYMENT_OUTCOME_NAMESPACE = '6f1c2d9e-5b4a-4c3e-9f8d-7a6b5c4d3e2f';

/**
 * inventory.reserved: charge the order total, then publish payment.completed or
 * payment.failed carrying the items, so inventory can finalize or release them
 * (gaps G3, G4).
 *
 * A redelivered inventory.reserved is not charged again (`processPayment` returns
 * the stored result for the same idempotency key), and its outcome is republished
 * with the same event ID, derived from the incoming one, so inventory and
 * notification recognise and skip the repeat (AC-7, D-014).
 */
export const handleInventoryReserved = async (
  event: SagaEnvelope,
  correlationId: string,
  logger: Logger,
  producer: Producer,
): Promise<void> => {
  let reserved: InventoryReservedData;
  try {
    reserved = parseInventoryReserved(event.data);
  } catch (err) {
    logger.error({ err: (err as Error).message, eventId: event.eventId }, 'Unreadable saga event');
    return;
  }

  const { orderId, items, totalAmount } = reserved;
  const payment = await processPayment(orderId, totalAmount, `evt_${event.eventId}`);
  const outcomeEventId = uuidV5(event.eventId, PAYMENT_OUTCOME_NAMESPACE);

  if (payment.status === 'COMPLETED') {
    logger.info({ orderId }, 'Payment successful');
    const completed: PaymentCompletedData = { orderId, items, amount: totalAmount };
    await publishEvent(producer, KafkaTopics.PAYMENT_COMPLETED, EventTypes.PAYMENT_COMPLETED, orderId, completed, correlationId, outcomeEventId);
  } else {
    logger.info({ orderId }, 'Payment failed');
    const failed: PaymentFailedData = { orderId, items, amount: totalAmount, reason: 'PAYMENT_DECLINED' };
    await publishEvent(producer, KafkaTopics.PAYMENT_FAILED, EventTypes.PAYMENT_FAILED, orderId, failed, correlationId, outcomeEventId);
  }
};
