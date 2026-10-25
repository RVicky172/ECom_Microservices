/**
 * Publishes usage analytics (012): `assistant.interaction` per finished chat turn
 * and `assistant.feedback` per rating, keyed by conversation ID.
 *
 * Best-effort and outside the request path (AC-12): callers fire these after the
 * response is sent and never await them. They never reject; a failed or timed-out
 * event is dropped with one warning (topic and event ID only), with no retry or queue.
 */
import { randomUUID } from 'crypto';
import {
  EventTypes,
  KafkaTopics,
  type AssistantFeedbackData,
  type AssistantInteractionData,
} from '@ecommerce/shared';
import type { Logger } from 'pino';
import { publishCapped } from './eventPublisher';

const PUBLISH_TIMEOUT_MS = 5000;

const publishDroppingFailures = async (
  topic: KafkaTopics,
  type: EventTypes,
  name: string,
  data: AssistantInteractionData | AssistantFeedbackData,
  correlationId: string,
  log: Logger,
): Promise<void> => {
  const eventId = randomUUID();
  try {
    await publishCapped({ topic, type, key: data.conversationId, data, correlationId, timeoutMs: PUBLISH_TIMEOUT_MS, name, eventId });
  } catch (error) {
    log.warn({ topic, eventId, error: (error as Error).message }, 'analytics event dropped');
  }
};

/** Publishes one `assistant.interaction`; fire and forget, never rejects. */
export const publishInteraction = (data: AssistantInteractionData, correlationId: string, log: Logger): Promise<void> =>
  publishDroppingFailures(KafkaTopics.ASSISTANT_INTERACTION, EventTypes.INTERACTION_COMPLETED, 'Interaction', data, correlationId, log);

/** Publishes one `assistant.feedback`; fire and forget, never rejects. */
export const publishFeedback = (data: AssistantFeedbackData, correlationId: string, log: Logger): Promise<void> =>
  publishDroppingFailures(KafkaTopics.ASSISTANT_FEEDBACK, EventTypes.ANSWER_RATED, 'Feedback', data, correlationId, log);
