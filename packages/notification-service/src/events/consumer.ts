import { createKafkaClient, createConsumer } from '@ecommerce/shared/src/kafka';
import { KafkaTopics } from '@ecommerce/shared/src/events';
import * as notificationService from '../services/notificationService';

const processedEvents = new Set<string>(); // In-memory idempotency for this dummy project

export const startConsumer = async (logger: any): Promise<void> => {
  try {
    const kafka = createKafkaClient('notification-service-consumer');
    const consumer = await createConsumer(kafka, 'notification-service-group');

    await consumer.subscribe({
      topics: [
        KafkaTopics.ORDER_CREATED,
        KafkaTopics.PAYMENT_COMPLETED,
        KafkaTopics.PAYMENT_FAILED,
        KafkaTopics.ORDER_SHIPPED,
      ],
      fromBeginning: false,
    });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const event = JSON.parse(message.value!.toString());
        const correlationId = message.headers?.['correlation-id']?.toString() || 'unknown';

        logger.info(
          { topic, orderId: event.data?.orderId, correlationId },
          `Received event: ${topic}`
        );

        try {
          if (processedEvents.has(event.eventId)) {
            logger.info({ eventId: event.eventId }, 'Event already processed, skipping');
            return;
          }

          if (topic === KafkaTopics.ORDER_CREATED) {
            await notificationService.sendOrderCreatedEmail(event.data, logger);
          } else if (topic === KafkaTopics.PAYMENT_COMPLETED) {
            await notificationService.sendPaymentSuccessEmail(event.data, logger);
          } else if (topic === KafkaTopics.PAYMENT_FAILED) {
            await notificationService.sendPaymentFailedEmail(event.data, logger);
          }

          processedEvents.add(event.eventId);
        } catch (err) {
          logger.error(
            { err: (err as Error).message, topic, orderId: event.data?.orderId },
            'Error processing event'
          );
        }
      },
    });

    logger.info('Notification Service consumer started');
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      'Failed to start Notification Service consumer'
    );
  }
};
