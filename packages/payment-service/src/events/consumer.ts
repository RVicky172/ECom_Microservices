/** The payment service's saga consumer and its producer for payment outcomes. */
import { createKafkaClient, createProducer, KafkaTopics, startSagaConsumer } from '@ecommerce/shared';
import type { SagaConsumerHandle } from '@ecommerce/shared';
import type { Producer } from 'kafkajs';
import { handleInventoryReserved } from './sagaHandlers';

type Logger = { info: Function; warn: Function; error: Function };

/**
 * Starts the payment service's saga consumer (inventory.reserved). The consumer
 * retries until Kafka is ready (D-015); the producer for payment outcomes connects
 * on first use.
 */
export const startConsumer = (logger: Logger): SagaConsumerHandle => {
  let producer: Promise<Producer> | undefined;
  const getProducer = () => (producer ??= createProducer(createKafkaClient('payment-service-producer')).catch((err) => {
    producer = undefined; // try again on the next event
    throw err;
  }));

  return startSagaConsumer({
    clientId: 'payment-service-consumer',
    groupId: 'payment-service-group',
    topics: [KafkaTopics.INVENTORY_RESERVED],
    logger,
    onMessage: async (topic, event, correlationId) => {
      logger.info({ topic, eventId: event.eventId, correlationId }, `Received event: ${topic}`);
      await handleInventoryReserved(event, correlationId, logger, await getProducer());
    },
  });
};
