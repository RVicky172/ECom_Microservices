/** The inventory service's Kafka consumer: wires the saga topics to their handlers in `sagaHandlers.ts`. */
import { createKafkaClient, createProducer, KafkaTopics, startSagaConsumer } from '@ecommerce/shared';
import type { SagaConsumerHandle } from '@ecommerce/shared';
import type { Producer } from 'kafkajs';
import { handleOrderCreated, handlePaymentCompleted, handlePaymentFailed } from './sagaHandlers';

type Logger = { info: Function; warn: Function; error: Function };

/**
 * Starts the inventory service's saga consumer (order.created, payment.completed,
 * payment.failed). The consumer retries until Kafka is ready (D-015); the producer
 * for inventory.reserved / inventory.rejected connects on first use.
 */
export const startConsumer = (logger: Logger): SagaConsumerHandle => {
  let producer: Promise<Producer> | undefined;
  const getProducer = () => (producer ??= createProducer(createKafkaClient('inventory-service-producer')).catch((err) => {
    producer = undefined; // try again on the next event
    throw err;
  }));

  return startSagaConsumer({
    clientId: 'inventory-service-consumer',
    groupId: 'inventory-service-group',
    topics: [KafkaTopics.ORDER_CREATED, KafkaTopics.PAYMENT_COMPLETED, KafkaTopics.PAYMENT_FAILED],
    logger,
    onMessage: async (topic, event, correlationId) => {
      logger.info({ topic, eventId: event.eventId, correlationId }, `Received event: ${topic}`);
      if (topic === KafkaTopics.ORDER_CREATED) await handleOrderCreated(event, correlationId, logger, await getProducer());
      else if (topic === KafkaTopics.PAYMENT_COMPLETED) await handlePaymentCompleted(event, correlationId, logger);
      else if (topic === KafkaTopics.PAYMENT_FAILED) await handlePaymentFailed(event, correlationId, logger);
    },
  });
};
