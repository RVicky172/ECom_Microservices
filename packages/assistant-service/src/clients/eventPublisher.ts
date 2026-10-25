/**
 * The assistant's one Kafka producer (handoffs since 011, analytics since 012).
 *
 * It connects on the first publish, so the assistant starts and chats without
 * Kafka. Every publish is capped so a Kafka outage can't stall a request, and
 * KafkaJS itself makes a single attempt that ends inside the cap: a send left
 * retrying after the cap could land after the caller was told it failed (D-021).
 * Consumers drop duplicates by event ID, so no idempotence.
 */
import {
  createKafkaClient,
  createProducer,
  publishEvent,
  type EventTypes,
  type KafkaLimits,
  type KafkaTopics,
} from '@ecommerce/shared';
import type { Producer } from 'kafkajs';

// One attempt: connect (1 s) + metadata request (1 s) + produce request (1 s) = 3 s at most.
const KAFKA_LIMITS: KafkaLimits = { connectionTimeout: 1000, requestTimeout: 1000, retry: { retries: 0 } };

let producer: Promise<Producer> | undefined;
const getProducer = () =>
  (producer ??= createProducer(createKafkaClient('assistant-service-producer', KAFKA_LIMITS), {
    idempotent: false,
    retry: { retries: 0 },
  }).catch((error) => {
    producer = undefined; // try again on the next publish
    throw error;
  }));

/** One event to publish with a single, time-capped attempt. */
export interface CappedPublish {
  topic: KafkaTopics;
  type: EventTypes;
  key: string;
  data: object;
  correlationId: string;
  timeoutMs: number;
  /** Names the publish in the timeout error, e.g. "Handoff". */
  name: string;
  /** The envelope's event ID; `publishEvent` makes one when omitted. */
  eventId?: string;
}

/** Resolves once Kafka has the event; rejects on failure or after `timeoutMs`. */
export const publishCapped = async ({ topic, type, key, data, correlationId, timeoutMs, name, eventId }: CappedPublish): Promise<void> => {
  const publishing = getProducer().then((connected) =>
    eventId === undefined
      ? publishEvent(connected, topic, type, key, data, correlationId)
      : publishEvent(connected, topic, type, key, data, correlationId, eventId),
  );

  // Promise.race also observes `publishing`, so a failure after the cap is not an unhandled rejection.
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} publish timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    await Promise.race([publishing, timeout]);
  } finally {
    clearTimeout(timer);
  }
};
