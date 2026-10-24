/**
 * Publishes `assistant.handoff_requested` (feature 011).
 *
 * The producer connects on the first handoff, so the assistant starts and chats
 * without Kafka; only a handoff needs it. Publishing is capped (5 s by default)
 * so a Kafka outage doesn't stall the chat turn. KafkaJS itself makes a single
 * attempt that ends inside the cap: a send left retrying after the cap would
 * reach support after the customer was told it failed (D-021). Duplicates are
 * dropped by the notification service's event ID check, so no idempotence.
 */
import {
  createKafkaClient,
  createProducer,
  EventTypes,
  KafkaTopics,
  publishEvent,
  type HandoffRequestedData,
  type KafkaLimits,
} from '@ecommerce/shared';
import type { Producer } from 'kafkajs';

const PUBLISH_TIMEOUT_MS = 5000;
// One attempt: connect (1 s) + metadata request (1 s) + produce request (1 s) = 3 s at most.
const KAFKA_LIMITS: KafkaLimits = { connectionTimeout: 1000, requestTimeout: 1000, retry: { retries: 0 } };

let producer: Promise<Producer> | undefined;
const getProducer = () =>
  (producer ??= createProducer(createKafkaClient('assistant-service-producer', KAFKA_LIMITS), {
    idempotent: false,
    retry: { retries: 0 },
  }).catch((error) => {
    producer = undefined; // try again on the next handoff
    throw error;
  }));

/** Resolves once Kafka has the event; rejects on failure or after `timeoutMs`. */
export const publishHandoff = async (
  data: HandoffRequestedData,
  correlationId: string,
  timeoutMs: number = PUBLISH_TIMEOUT_MS,
): Promise<void> => {
  const publishing = getProducer().then((connected) =>
    publishEvent(connected, KafkaTopics.ASSISTANT_HANDOFF_REQUESTED, EventTypes.HANDOFF_REQUESTED, data.reference, data, correlationId),
  );

  // Promise.race also observes `publishing`, so a failure after the cap is not an unhandled rejection.
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Handoff publish timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    await Promise.race([publishing, timeout]);
  } finally {
    clearTimeout(timer);
  }
};
