const { createKafkaClient, createConsumer, createProducer } = require('@ecommerce/shared/src/kafka');
const { KafkaTopics, EventTypes } = require('@ecommerce/shared/src/events');
const { processPayment } = require('../services/paymentService');
const { v4: uuidv4 } = require('uuid');

let producer = null;

const startConsumer = async (logger) => {
  try {
    const kafka = createKafkaClient('payment-service-consumer');
    const consumer = await createConsumer(kafka, 'payment-service-group');
    
    const producerKafka = createKafkaClient('payment-service-producer');
    producer = await createProducer(producerKafka);

    await consumer.subscribe({ topics: [KafkaTopics.INVENTORY_RESERVED], fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const event = JSON.parse(message.value.toString());
        const correlationId = message.headers?.['correlation-id']?.toString() || 'unknown';
        const { orderId, totalAmount, items } = event.data;

        logger.info({ topic, orderId, correlationId }, `Received event: ${topic}`);

        try {
          // Use eventId as idempotency key for async flow
          const idempotencyKey = `evt_${event.eventId}`;
          
          const result = await processPayment(orderId, totalAmount, idempotencyKey);
          
          if (result.status === 'COMPLETED') {
            logger.info({ orderId }, 'Payment successful');
            await publishEvent(KafkaTopics.PAYMENT_COMPLETED, EventTypes.PAYMENT_COMPLETED, orderId, { orderId, items }, correlationId);
          } else {
            logger.info({ orderId }, 'Payment failed');
            await publishEvent(KafkaTopics.PAYMENT_FAILED, EventTypes.PAYMENT_FAILED, orderId, { orderId, items, reason: 'Card declined' }, correlationId);
          }
        } catch (err) {
          logger.error({ err: err.message, orderId }, 'Error processing payment event');
        }
      },
    });

    logger.info('Payment Service consumer started');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start Payment Service consumer');
  }
};

const publishEvent = async (topic, eventType, aggregateId, data, correlationId) => {
  await producer.send({
    topic,
    messages: [{
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
    }],
  });
};

module.exports = { startConsumer };
