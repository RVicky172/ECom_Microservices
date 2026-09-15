import { createKafkaClient, createConsumer, KafkaTopics, OrderStatus } from '@ecommerce/shared';
import { updateOrderStatus } from '../services/orderService';

/**
 * Order Service consumes saga events (Section 9.5):
 * - inventory.reserved → status stays INVENTORY_RESERVED (waiting for payment)
 * - inventory.rejected → CANCELLED
 * - payment.completed → CONFIRMED
 * - payment.failed → CANCELLED
 */
export const startConsumer = async (logger: any): Promise<void> => {
  try {
    const kafka = createKafkaClient('order-service-consumer');
    const consumer = await createConsumer(kafka, 'order-service-group');

    await consumer.subscribe({
      topics: [
        KafkaTopics.INVENTORY_RESERVED,
        KafkaTopics.INVENTORY_REJECTED,
        KafkaTopics.PAYMENT_COMPLETED,
        KafkaTopics.PAYMENT_FAILED,
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
          switch (topic) {
            case KafkaTopics.INVENTORY_RESERVED:
              await updateOrderStatus(event.data.orderId, OrderStatus.INVENTORY_RESERVED);
              logger.info({ orderId: event.data.orderId }, 'Order → INVENTORY_RESERVED');
              break;

            case KafkaTopics.INVENTORY_REJECTED:
              await updateOrderStatus(event.data.orderId, OrderStatus.CANCELLED);
              logger.info({ orderId: event.data.orderId }, 'Order → CANCELLED (out of stock)');
              break;

            case KafkaTopics.PAYMENT_COMPLETED:
              await updateOrderStatus(event.data.orderId, OrderStatus.CONFIRMED);
              logger.info({ orderId: event.data.orderId }, 'Order → CONFIRMED');
              break;

            case KafkaTopics.PAYMENT_FAILED:
              await updateOrderStatus(event.data.orderId, OrderStatus.CANCELLED);
              logger.info(
                { orderId: event.data.orderId },
                'Order → CANCELLED (payment failed)'
              );
              break;

            default:
              logger.warn({ topic }, 'Unhandled topic');
          }
        } catch (err) {
          logger.error(
            { err: (err as Error).message, topic, orderId: event.data?.orderId },
            'Error processing event'
          );
        }
      },
    });

    logger.info('Order Service consumer started');
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to start Order Service consumer');
  }
};
