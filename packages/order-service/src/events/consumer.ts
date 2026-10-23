import {
  KafkaTopics,
  NotFoundError,
  parseInventoryRejected,
  parseInventoryReserved,
  parsePaymentCompleted,
  parsePaymentFailed,
  startSagaConsumer,
} from '@ecommerce/shared';
import type { SagaConsumerHandle, SagaEnvelope } from '@ecommerce/shared';
import { getOrderById, updateOrderStatus } from '../services/orderService';
import { nextTransitions } from '../services/sagaTransitions';

const TOPICS = [
  KafkaTopics.INVENTORY_RESERVED,
  KafkaTopics.INVENTORY_REJECTED,
  KafkaTopics.PAYMENT_COMPLETED,
  KafkaTopics.PAYMENT_FAILED,
];

const PARSERS: Record<string, (data: unknown) => { orderId: string }> = {
  [KafkaTopics.INVENTORY_RESERVED]: parseInventoryReserved,
  [KafkaTopics.INVENTORY_REJECTED]: parseInventoryRejected,
  [KafkaTopics.PAYMENT_COMPLETED]: parsePaymentCompleted,
  [KafkaTopics.PAYMENT_FAILED]: parsePaymentFailed,
};

type Logger = { info: Function; warn: Function; error: Function };

/**
 * Applies one saga event to its order (Section 9.5, plan §4): parse the payload,
 * ask `nextTransitions` what the event means for the order's current status, and
 * apply those steps in order. Duplicates and late events change nothing. A payload
 * that cannot be read, or an order that does not exist, is logged, never thrown.
 */
export const handleSagaEvent = async (
  topic: string,
  event: SagaEnvelope,
  correlationId: string,
  logger: Logger,
): Promise<void> => {
  const parse = PARSERS[topic];
  if (!parse) return;

  let orderId: string;
  try {
    ({ orderId } = parse(event.data));
  } catch (err) {
    logger.error({ err: (err as Error).message, topic, eventId: event.eventId, correlationId }, 'Unreadable saga event');
    return;
  }

  let order: { status: string };
  try {
    order = await getOrderById(orderId);
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
    logger.warn({ topic, orderId, correlationId }, 'Saga event for an unknown order');
    return;
  }

  const steps = nextTransitions(order.status, topic);
  if (steps.length === 0) {
    logger.info({ topic, orderId, status: order.status, correlationId }, 'Saga event changes nothing (duplicate or late)');
    return;
  }

  for (const step of steps) {
    await updateOrderStatus(orderId, step.status, step.reason);
    logger.info({ topic, orderId, status: step.status, reason: step.reason, correlationId }, `Order → ${step.status}`);
  }
};

/** Starts the order service's saga consumer; it retries until Kafka is ready (D-015). */
export const startConsumer = (logger: Logger): SagaConsumerHandle =>
  startSagaConsumer({
    clientId: 'order-service-consumer',
    groupId: 'order-service-group',
    topics: TOPICS,
    logger,
    onMessage: (topic, event, correlationId) => handleSagaEvent(topic, event, correlationId, logger),
  });
