const { createKafkaClient, createConsumer } = require('@ecommerce/shared/src/kafka');
const { KafkaTopics } = require('@ecommerce/shared/src/events');
const notificationService = require('../services/notificationService');

const processedEvents = new Set(); // In-memory idempotency for this dummy project

const startConsumer = async (logger) => {
  try {
    const kafka = createKafkaClient('notification-service-consumer');
    const consumer = await createConsumer(kafka, 'notification-service-group');

    await consumer.subscribe({ topics: [
      KafkaTopics.ORDER_CREATED,
      KafkaTopics.PAYMENT_COMPLETED,
      KafkaTopics.PAYMENT_FAILED,
      KafkaTopics.ORDER_SHIPPED,
    ], fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const event = JSON.parse(message.value.toString());
        const correlationId = message.headers?.['correlation-id']?.toString() || 'unknown';

        logger.info({ topic, orderId: event.data?.orderId, correlationId }, `Received event: ${topic}`);

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
          logger.error({ err: err.message, topic, orderId: event.data?.orderId }, 'Error processing event');
        }
      },
    });

    logger.info('Notification Service consumer started');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start Notification Service consumer');
  }
};

module.exports = { startConsumer };
