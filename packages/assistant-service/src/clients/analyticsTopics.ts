/**
 * Creates the analytics topics at startup (012, D-027).
 *
 * Nothing consumes `assistant.interaction` or `assistant.feedback`, so no
 * `startSagaConsumer` creates them. Left to Kafka's auto-create, the first
 * event on a fresh broker is lost: the topic is made on the first metadata
 * request, but the single-attempt producer (D-021) fails before the new
 * partition has a leader. This runs in the background with the saga
 * consumers' backoff until Kafka answers; it never blocks startup or chat.
 */
import { createKafkaClient, ensureTopics, KafkaTopics } from '@ecommerce/shared';
import type { Kafka } from 'kafkajs';
import type { Logger } from 'pino';

const MAX_RETRY_DELAY_MS = 30_000;
const retryDelay = (attempt: number): number => Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The producer-only topics this service must create itself. */
export const ANALYTICS_TOPICS = [KafkaTopics.ASSISTANT_INTERACTION, KafkaTopics.ASSISTANT_FEEDBACK];

/** Where to log, plus Kafka, topic creation and `sleep` injectable for tests. */
export interface EnsureAnalyticsTopicsOptions {
  logger: Logger;
  createKafka?: (clientId: string) => Kafka;
  ensure?: (kafka: Kafka, topics: KafkaTopics[]) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

/** Resolves once both topics exist; never rejects. */
export const ensureAnalyticsTopics = async ({
  logger,
  createKafka = createKafkaClient,
  ensure = ensureTopics,
  sleep = wait,
}: EnsureAnalyticsTopicsOptions): Promise<void> => {
  for (let attempt = 0; ; attempt++) {
    try {
      await ensure(createKafka('assistant-service-admin'), ANALYTICS_TOPICS);
      logger.info({ topics: ANALYTICS_TOPICS }, 'Analytics topics ready');
      return;
    } catch (error) {
      const delay = retryDelay(attempt);
      logger.warn({ err: (error as Error).message, attempt: attempt + 1, retryInMs: delay }, 'Analytics topics not ready; retrying');
      await sleep(delay);
    }
  }
};
