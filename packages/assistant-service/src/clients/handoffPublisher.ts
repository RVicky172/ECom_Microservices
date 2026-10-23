/**
 * Publishes `assistant.handoff_requested` (feature 011).
 *
 * The producer connects on the first handoff, so the assistant starts and chats
 * without Kafka; only a handoff needs it. Publishing is capped (5 s by default)
 * because KafkaJS retries for tens of seconds, which would stall the chat turn.
 */
import {
  createKafkaClient,
  createProducer,
  EventTypes,
  KafkaTopics,
  publishEvent,
  type HandoffRequestedData,
} from '@ecommerce/shared';
import type { Producer } from 'kafkajs';

const PUBLISH_TIMEOUT_MS = 5000;

let producer: Promise<Producer> | undefined;
const getProducer = () =>
  (producer ??= createProducer(createKafkaClient('assistant-service-producer')).catch((error) => {
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
