const { createKafkaClient, createConsumer, createProducer } = require('@ecommerce/shared/src/kafka');
const { KafkaTopics, EventTypes } = require('@ecommerce/shared/src/events');
const { db } = require('../models/inventoryModel');
const { reserveStock, releaseStock, finalizeStock } = require('../services/inventoryService');

let producer = null;

const startConsumer = async (logger) => {
  try {
    const kafka = createKafkaClient('inventory-service-consumer');
    const consumer = await createConsumer(kafka, 'inventory-service-group');
    
    // We need a producer to emit INVENTORY_RESERVED or INVENTORY_REJECTED
    const producerKafka = createKafkaClient('inventory-service-producer');
    producer = await createProducer(producerKafka);

    await consumer.subscribe({ topics: [
      KafkaTopics.ORDER_CREATED,
      KafkaTopics.PAYMENT_COMPLETED,
      KafkaTopics.PAYMENT_FAILED,
    ], fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const event = JSON.parse(message.value.toString());
        const correlationId = message.headers?.['correlation-id']?.toString() || 'unknown';

        logger.info({ topic, orderId: event.data?.orderId, correlationId }, `Received event: ${topic}`);

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
            await handlePaymentFailed(event, logger);
          } else if (topic === KafkaTopics.PAYMENT_COMPLETED) {
            await handlePaymentCompleted(event, logger);
          }
        } catch (err) {
          logger.error({ err: err.message, topic, orderId: event.data?.orderId }, 'Error processing event');
        }
      },
    });

    logger.info('Inventory Service consumer started');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start Inventory Service consumer');
  }
};

const handleOrderCreated = async (event, logger, correlationId) => {
  const { orderId, items } = event.data;

  try {
    let success = true;
    
    // Atomic transaction for reservations + idempotency tracking
    await db.transaction(async (trx) => {
      // 1. Mark event processed
      await trx('processed_events').insert({ event_id: event.eventId });

      // 2. Attempt reservations for all items
      for (const item of items) {
        const reserved = await reserveStock(trx, item.productId, item.quantity);
        if (!reserved) {
          success = false;
          break; // If one fails, the transaction will rollback (or we handle it)
        }
      }

      if (!success) {
        throw new Error('Insufficient stock');
      }
    });

    // If we reach here, transaction committed and stock is reserved
    logger.info({ orderId }, 'Stock reserved successfully');
    await publishEvent(KafkaTopics.INVENTORY_RESERVED, EventTypes.INVENTORY_RESERVED, orderId, { orderId }, correlationId);

  } catch (err) {
    logger.warn({ orderId, err: err.message }, 'Failed to reserve stock');
    // If it was our own "Insufficient stock" throw, or a DB constraint, emit REJECTED
    // We need to mark the event as processed even on failure so we don't retry and emit multiple rejections
    // So we do it outside the failed transaction
    await db('processed_events').insert({ event_id: event.eventId }).onConflict('event_id').ignore();
    
    await publishEvent(KafkaTopics.INVENTORY_REJECTED, EventTypes.INVENTORY_REJECTED, orderId, { orderId, reason: 'Insufficient stock' }, correlationId);
  }
};

const handlePaymentFailed = async (event, logger) => {
  const { orderId, items } = event.data; // Payment service needs to pass items back, or we look it up (simplified here, assuming payment passes it or we store reservations)
  
  // For simplicity in this dummy project, we assume event.data contains items.
  // In a real system, Inventory would have a `reservations` table to look up what to release.
  if (!items) {
    logger.warn('Payment failed event missing items array to release');
    return;
  }

  await db.transaction(async (trx) => {
    await trx('processed_events').insert({ event_id: event.eventId });
    for (const item of items) {
      await releaseStock(trx, item.productId, item.quantity);
    }
  });
  logger.info({ orderId }, 'Stock released due to payment failure');
};

const handlePaymentCompleted = async (event, logger) => {
  const { orderId, items } = event.data;
  
  if (!items) return;

  await db.transaction(async (trx) => {
    await trx('processed_events').insert({ event_id: event.eventId });
    for (const item of items) {
      await finalizeStock(trx, item.productId, item.quantity);
    }
  });
  logger.info({ orderId }, 'Stock finalized due to payment success');
};

const publishEvent = async (topic, eventType, aggregateId, data, correlationId) => {
  await producer.send({
    topic,
    messages: [{
      key: aggregateId,
      value: JSON.stringify({
        eventId: require('uuid').v4(),
        eventType,
        aggregateId,
        data,
        timestamp: new Date().toISOString(),
      }),
      headers: {
        'correlation-id': correlationId,
        'event-type': eventType,
      },
    }],
  });
};

module.exports = { startConsumer };
