import {
  KafkaTopics,
  parseHandoffRequested,
  parseOrderCreated,
  parsePaymentCompleted,
  parsePaymentFailed,
  startSagaConsumer,
} from '@ecommerce/shared';
import type { SagaConsumerHandle, SagaEnvelope } from '@ecommerce/shared';
import * as notificationService from '../services/notificationService';

const processedEvents = new Set<string>(); // In-memory idempotency for this dummy project (G10)

type Logger = { info: Function; warn: Function; error: Function };

/**
 * Handles one event: skips a redelivered one (payment outcomes keep their event ID,
 * D-014), reads the payload with the shared parser and sends the matching notification.
 * An unreadable payload is logged and skipped. Logs carry IDs only, never message text.
 */
export const handleNotificationEvent = async (
  topic: string,
  event: SagaEnvelope,
  correlationId: string,
  logger: Logger,
): Promise<void> => {
  logger.info({ topic, eventId: event.eventId, correlationId }, `Received event: ${topic}`);
  if (processedEvents.has(event.eventId)) {
    logger.info({ eventId: event.eventId }, 'Event already processed, skipping');
    return;
  }

  try {
    if (topic === KafkaTopics.ORDER_CREATED) {
      await notificationService.sendOrderCreatedEmail(parseOrderCreated(event.data), logger);
    } else if (topic === KafkaTopics.PAYMENT_COMPLETED) {
      await notificationService.sendPaymentSuccessEmail(parsePaymentCompleted(event.data), logger);
    } else if (topic === KafkaTopics.PAYMENT_FAILED) {
      await notificationService.sendPaymentFailedEmail(parsePaymentFailed(event.data), logger);
    } else if (topic === KafkaTopics.ASSISTANT_HANDOFF_REQUESTED) {
      await notificationService.sendSupportHandoffEmail(parseHandoffRequested(event.data), logger);
    }
  } catch (error) {
    logger.error({ err: (error as Error).message, topic, eventId: event.eventId, correlationId }, 'Could not send notification');
    return;
  }

  processedEvents.add(event.eventId);
};

/**
 * Starts the notification service's consumer. It retries until Kafka is ready (D-015).
 */
export const startConsumer = (logger: Logger): SagaConsumerHandle =>
  startSagaConsumer({
    clientId: 'notification-service-consumer',
    groupId: 'notification-service-group',
    topics: [
      KafkaTopics.ORDER_CREATED,
      KafkaTopics.PAYMENT_COMPLETED,
      KafkaTopics.PAYMENT_FAILED,
      KafkaTopics.ORDER_SHIPPED,
      KafkaTopics.ASSISTANT_HANDOFF_REQUESTED,
    ],
    logger,
    onMessage: (topic, event, correlationId) => handleNotificationEvent(topic, event, correlationId, logger),
  });
