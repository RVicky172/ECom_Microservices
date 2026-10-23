import {
  KafkaTopics,
  parseOrderCreated,
  parsePaymentCompleted,
  parsePaymentFailed,
  startSagaConsumer,
} from '@ecommerce/shared';
import type { SagaConsumerHandle } from '@ecommerce/shared';
import * as notificationService from '../services/notificationService';

const processedEvents = new Set<string>(); // In-memory idempotency for this dummy project (G10)

type Logger = { info: Function; warn: Function; error: Function };

/**
 * Starts the notification service's consumer. It retries until Kafka is ready
 * (D-015). Payloads are read with the shared parsers; a redelivered event (payment
 * outcomes keep their event ID, D-014) is skipped.
 */
export const startConsumer = (logger: Logger): SagaConsumerHandle =>
  startSagaConsumer({
    clientId: 'notification-service-consumer',
    groupId: 'notification-service-group',
    topics: [KafkaTopics.ORDER_CREATED, KafkaTopics.PAYMENT_COMPLETED, KafkaTopics.PAYMENT_FAILED, KafkaTopics.ORDER_SHIPPED],
    logger,
    onMessage: async (topic, event, correlationId) => {
      logger.info({ topic, eventId: event.eventId, correlationId }, `Received event: ${topic}`);
      if (processedEvents.has(event.eventId)) {
        logger.info({ eventId: event.eventId }, 'Event already processed, skipping');
        return;
      }

      if (topic === KafkaTopics.ORDER_CREATED) {
        await notificationService.sendOrderCreatedEmail(parseOrderCreated(event.data), logger);
      } else if (topic === KafkaTopics.PAYMENT_COMPLETED) {
        await notificationService.sendPaymentSuccessEmail(parsePaymentCompleted(event.data), logger);
      } else if (topic === KafkaTopics.PAYMENT_FAILED) {
        await notificationService.sendPaymentFailedEmail(parsePaymentFailed(event.data), logger);
      }

      processedEvents.add(event.eventId);
    },
  });
