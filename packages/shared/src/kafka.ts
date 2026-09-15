import { Kafka, logLevel, Producer, Consumer } from 'kafkajs';

/**
 * Creates a KafkaJS client instance.
 */
export const createKafkaClient = (clientId: string): Kafka => {
  const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
  return new Kafka({
    clientId: clientId || process.env.KAFKA_CLIENT_ID || 'ecommerce-platform',
    brokers,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: 10,
    },
  });
};

/**
 * Creates a connected Kafka producer with idempotent mode enabled.
 */
export const createProducer = async (kafka: Kafka): Promise<Producer> => {
  const producer = kafka.producer({
    idempotent: true,
    maxInFlightRequests: 1,
  });
  await producer.connect();
  return producer;
};

/**
 * Creates a Kafka consumer for a given group ID.
 */
export const createConsumer = async (kafka: Kafka, groupId: string): Promise<Consumer> => {
  const consumer = kafka.consumer({
    groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });
  await consumer.connect();
  return consumer;
};
