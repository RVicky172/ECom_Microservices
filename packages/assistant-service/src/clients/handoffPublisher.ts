/**
 * Publishes `assistant.handoff_requested` (feature 011) through the shared capped
 * producer (`eventPublisher.ts`, D-021). Capped at 5 s by default so a Kafka
 * outage doesn't stall the chat turn; the caller awaits it, because the customer
 * is told whether support was reached.
 */
import { EventTypes, KafkaTopics, type HandoffRequestedData } from '@ecommerce/shared';
import { publishCapped } from './eventPublisher';

const PUBLISH_TIMEOUT_MS = 5000;

/** Resolves once Kafka has the event; rejects on failure or after `timeoutMs`. */
export const publishHandoff = (
  data: HandoffRequestedData,
  correlationId: string,
  timeoutMs: number = PUBLISH_TIMEOUT_MS,
): Promise<void> =>
  publishCapped({
    topic: KafkaTopics.ASSISTANT_HANDOFF_REQUESTED,
    type: EventTypes.HANDOFF_REQUESTED,
    key: data.reference,
    data,
    correlationId,
    timeoutMs,
    name: 'Handoff',
  });
