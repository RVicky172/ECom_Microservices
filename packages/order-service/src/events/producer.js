const { createKafkaClient, createProducer } = require('@ecommerce/shared/src/kafka');
const { KafkaTopics } = require('@ecommerce/shared/src/events');
const { db } = require('../models/orderModel');

let producer = null;

/**
 * Outbox Relay (Section 9.3):
 * Polls outbox_events for unpublished events and publishes them to Kafka.
 * This guarantees the event is never lost relative to the DB write,
 * solving the dual-write problem.
 */
const startOutboxRelay = async (logger) => {
  try {
    const kafka = createKafkaClient('order-service-producer');
    producer = await createProducer(kafka);
    logger.info('Outbox relay producer connected');

    // Poll every 2 seconds for unpublished outbox events
    setInterval(async () => {
      try {
        const events = await db('outbox_events')
          .whereNull('published_at')
          .orderBy('created_at', 'asc')
          .limit(10);

        for (const event of events) {
          const topic = eventTypeToTopic(event.event_type);
          if (!topic) continue;

          const payload = typeof event.payload === 'string'
            ? JSON.parse(event.payload)
            : event.payload;

          await producer.send({
            topic,
            messages: [{
              key: event.aggregate_id,
              value: JSON.stringify({
                eventId: event.id,
                eventType: event.event_type,
                aggregateId: event.aggregate_id,
                data: payload,
                timestamp: new Date().toISOString(),
              }),
              headers: {
                'correlation-id': event.aggregate_id,
                'event-type': event.event_type,
              },
            }],
          });

          // Mark as published
          await db('outbox_events')
            .where({ id: event.id })
            .update({ published_at: db.fn.now() });

          logger.info({ eventId: event.id, topic, aggregateId: event.aggregate_id },
            'Outbox event published to Kafka');
        }
      } catch (err) {
        logger.error({ err: err.message }, 'Outbox relay error');
      }
    }, 2000);
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start outbox relay');
  }
};

const eventTypeToTopic = (eventType) => {
  const map = {
    ORDER_CREATED: KafkaTopics.ORDER_CREATED,
    ORDER_SHIPPED: KafkaTopics.ORDER_SHIPPED,
  };
  return map[eventType] || null;
};

module.exports = { startOutboxRelay };
