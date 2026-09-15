import { createKafkaClient, createConsumer, createProducer } from '@ecommerce/shared/src/kafka';
import { KafkaTopics, EventTypes } from '@ecommerce/shared/src/events';
import { db } from '../models/inventoryModel';
import { reserveStock, releaseStock, finalizeStock } from '../services/inventoryService';
import { v4 as uuidv4 } from 'uuid';

let producer: any = null;

export const startConsumer = async (logger: any): Promise<void> => {
  try {
    const kafka = createKafkaClient('inventory-service-consumer');
    const consumer = await createConsumer(kafka, 'inventory-service-group');

    // We need a producer to emit INVENTORY_RESERVED or INVENTORY_REJECTED
    const producerKafka = createKafkaClient('inventory-service-producer');
    producer = await createProducer(producerKafka);

    await consumer.subscribe({
      topics: [
        KafkaTopics.ORDER_CREATED,
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
          // Idempotency check (Section 8.5)
          const processed = await db('processed_events').where({ event_id: event.eventId }).first();
          if (processed) {
            logger.info({ eventId: event.eventId }, 'Event already processed, skipping');
            return;
          }

          if (topic === KafkaTopics.ORDER_CREATED) {
            await handleOrderCreated(event, logger, correlationId);
          } else if (topic === KafkaTopics.PAYMENT_FAILED) {
            await handlePaymentFailed(event, logger, correlationId);
          } else if (topic === KafkaTopics.PAYMENT_COMPLETED) {
            await handlePaymentCompleted(event, logger, correlationId);
          }
        } catch (err) {
          logger.error(
            { err: (err as Error).message, topic, orderId: event.data?.orderId },
            'Error processing event'
          );
        }
      },
    });

    logger.info('Inventory Service consumer started');
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      'Failed to start Inventory Service consumer'
    );
  }
};

const handleOrderCreated = async (event: any, logger: any, correlationId: string): Promise<void> => {
  const { orderId, items } = event.data;

  try {
    let success = true;

    // Atomic transaction for reservations + idempotency tracking
    await db.transaction(async (trx: any) => {
      // 1. Mark event processed
      await trx('processed_events').insert({ event_id: event.eventId });

      // 2. Attempt reservations for all items
      for (const item of items) {
        const reserved = await reserveStock(trx, item.productId, item.quantity);
        if (!reserved) {
          success = false;
          break;
        }
      }

      if (!success) {
        throw new Error('Insufficient stock');
      }
    });

    // If we reach here, transaction committed and stock is reserved
    logger.info({ orderId }, 'Stock reserved successfully');
    await publishEvent(
      KafkaTopics.INVENTORY_RESERVED,
      EventTypes.INVENTORY_RESERVED,
      orderId,
      { orderId },
      correlationId
    );
  } catch (err) {
    logger.warn({ orderId, err: (err as Error).message }, 'Failed to reserve stock');
    await db('processed_events')
      .insert({ event_id: event.eventId })
      .onConflict('event_id')
      .ignore();

    await publishEvent(
      KafkaTopics.INVENTORY_REJECTED,
      EventTypes.INVENTORY_REJECTED,
      orderId,
      { orderId, reason: 'Insufficient stock' },
      correlationId
    );
  }
};

const handlePaymentFailed = async (event: any, logger: any, correlationId: string): Promise<void> => {
  const { orderId, items } = event.data;

  await db.transaction(async (trx: any) => {
    await trx('processed_events').insert({ event_id: event.eventId });
    for (const item of items) {
      await releaseStock(trx, item.productId, item.quantity);
    }
  });

  logger.info({ orderId }, 'Stock released due to payment failure');
};

const handlePaymentCompleted = async (
  event: any,
  logger: any,
  correlationId: string
): Promise<void> => {
  const { orderId, items } = event.data;

  await db.transaction(async (trx: any) => {
    await trx('processed_events').insert({ event_id: event.eventId });
    for (const item of items) {
      await finalizeStock(trx, item.productId, item.quantity);
    }
  });

  logger.info({ orderId }, 'Stock finalized after successful payment');
};

const publishEvent = async (
  topic: string,
  eventType: string,
  aggregateId: string,
  data: any,
  correlationId: string
): Promise<void> => {
  await producer.send({
    topic,
    messages: [
      {
        key: aggregateId,
        value: JSON.stringify({
          eventId: uuidv4(),
          eventType,
          aggregateId,
          data,
          timestamp: new Date().toISOString(),
        }),
        headers: {
          'correlation-id': correlationId,
          'event-type': eventType,
        },
      },
    ],
  });
};
