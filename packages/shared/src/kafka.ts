import { Kafka, logLevel, Producer, Consumer, type KafkaConfig, type RetryOptions } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import type { EventTypes, KafkaTopics, SagaEnvelope } from './events';

/** Timeouts and retry limits that replace the client defaults (e.g. to bound how long a send may keep trying). */
export type KafkaLimits = Pick<KafkaConfig, 'connectionTimeout' | 'requestTimeout' | 'retry'>;

/**
 * Creates a KafkaJS client instance.
 */
export const createKafkaClient = (clientId: string, limits: KafkaLimits = {}): Kafka => {
  const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
  return new Kafka({
    clientId: clientId || process.env.KAFKA_CLIENT_ID || 'ecommerce-platform',
    brokers,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: 10,
    },
    ...limits,
  });
};

/**
 * Creates a connected Kafka producer, idempotent by default. Without a `retry`
 * an idempotent producer retries a send without limit.
 */
export const createProducer = async (
  kafka: Kafka,
  options: { idempotent?: boolean; retry?: RetryOptions } = {},
): Promise<Producer> => {
  const { idempotent = true, retry } = options;
  const producer = kafka.producer({
    idempotent,
    maxInFlightRequests: 1,
    ...(retry && { retry }),
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

/**
 * Publishes one saga event in the standard envelope
 * `{ eventId, eventType, aggregateId, data, timestamp }`, keyed by the aggregate
 * (so one order's events stay in order) with `correlation-id` and `event-type`
 * headers. Pass `eventId` to make a republished event recognisable as the same one.
 */
export const publishEvent = async (
  producer: Producer,
  topic: KafkaTopics,
  eventType: EventTypes,
  aggregateId: string,
  data: object,
  correlationId: string,
  eventId: string = uuidv4(),
): Promise<void> => {
  const envelope: SagaEnvelope = { eventId, eventType, aggregateId, data, timestamp: new Date().toISOString() };
  await producer.send({
    topic,
    messages: [
      {
        key: aggregateId,
        value: JSON.stringify(envelope),
        headers: { 'correlation-id': correlationId, 'event-type': eventType },
      },
    ],
  });
};

/**
 * Creates the topics if they do not exist and waits until each has a partition
 * leader, so a consumer can subscribe straight away. Topics that already exist
 * (including one another service created a moment earlier) count as success.
 */
export const ensureTopics = async (kafka: Kafka, topics: KafkaTopics[]): Promise<void> => {
  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.createTopics({ topics: topics.map((topic) => ({ topic })), waitForLeaders: true });
  } catch (error) {
    if ((error as { type?: string }).type !== 'TOPIC_ALREADY_EXISTS') throw error;
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
};

type SagaLogger = Pick<Console, 'info' | 'warn' | 'error'> | { info: Function; warn: Function; error: Function };

export interface SagaConsumerOptions {
  clientId: string;
  groupId: string;
  topics: KafkaTopics[];
  logger: SagaLogger;
  /** Handles one message; a thrown error is logged and the consumer moves on. */
  onMessage: (topic: string, event: SagaEnvelope, correlationId: string) => Promise<void>;
  /** Injectable for tests. */
  createKafka?: (clientId: string) => Kafka;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface SagaConsumerHandle {
  /** `running` once subscribed and consuming; `starting` while (re)trying. */
  status: () => 'starting' | 'running';
  /** Resolves the first time the consumer is running. */
  ready: Promise<void>;
}

const MAX_RETRY_DELAY_MS = 30_000;
const retryDelay = (attempt: number): number => Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Starts a saga consumer that cannot silently die (feature 010, D-015).
 *
 * Ensures its topics exist, then connects, subscribes (`fromBeginning: true`, so a
 * group with no committed position reads what was published while it was down)
 * and runs. Any failure on the way is logged and retried with backoff (1 s, 2 s,
 * 4 s … capped at 30 s) for as long as it takes, and a KafkaJS crash it will not
 * restart itself starts the loop again. Before this, a consumer that failed to
 * start just logged and gave up while the service kept reporting healthy.
 */
export const startSagaConsumer = (options: SagaConsumerOptions): SagaConsumerHandle => {
  const { clientId, groupId, topics, logger, onMessage } = options;
  const createKafka = options.createKafka ?? createKafkaClient;
  const sleep = options.sleep ?? wait;
  let state: 'starting' | 'running' = 'starting';
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => (markReady = resolve));

  const eachMessage = async ({ topic, message }: { topic: string; message: { value: Buffer | null; headers?: Record<string, unknown> } }) => {
    const correlationId = message.headers?.['correlation-id']?.toString() || 'unknown';
    try {
      const event = JSON.parse(message.value?.toString() ?? '') as SagaEnvelope;
      await onMessage(topic, event, correlationId);
    } catch (error) {
      logger.error({ err: (error as Error).message, topic, correlationId }, 'Failed to process saga event');
    }
  };

  const run = async (): Promise<void> => {
    state = 'starting';
    for (let attempt = 0; ; attempt++) {
      let consumer: Consumer | undefined;
      try {
        const kafka = createKafka(clientId);
        await ensureTopics(kafka, topics);
        consumer = kafka.consumer({ groupId, sessionTimeout: 30000, heartbeatInterval: 3000 });
        const started = consumer;
        await started.connect();
        await started.subscribe({ topics, fromBeginning: true });
        started.on(started.events.CRASH, (event) => {
          if (event.payload.restart) return;
          logger.error({ err: event.payload.error?.message, groupId }, 'Saga consumer crashed; starting it again');
          state = 'starting';
          void started.disconnect().catch(() => undefined).then(run);
        });
        await started.run({ eachMessage });
        state = 'running';
        logger.info({ groupId, topics }, 'Saga consumer running');
        markReady();
        return;
      } catch (error) {
        const delay = retryDelay(attempt);
        logger.error({ err: (error as Error).message, groupId, attempt: attempt + 1, retryInMs: delay }, 'Saga consumer failed to start; retrying');
        await consumer?.disconnect().catch(() => undefined);
        await sleep(delay);
      }
    }
  };

  void run();
  return { status: () => state, ready };
};
