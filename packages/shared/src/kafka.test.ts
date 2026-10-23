import type { Kafka, Producer } from 'kafkajs';
import { describe, expect, it, vi } from 'vitest';
import { EventTypes, KafkaTopics } from './events';
import { ensureTopics, publishEvent, startSagaConsumer } from './kafka';

const ORDER_ID = '4eb595bd-36de-4eb6-9ef7-f8da2b9cfe16';
const silentLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe('publishEvent', () => {
  const send = vi.fn();
  const producer = { send } as unknown as Producer;

  it('sends the standard envelope keyed by the aggregate, with correlation and type headers', async () => {
    send.mockClear();
    await publishEvent(producer, KafkaTopics.INVENTORY_REJECTED, EventTypes.INVENTORY_REJECTED, ORDER_ID,
      { orderId: ORDER_ID, reason: 'OUT_OF_STOCK' }, 'corr-1', 'event-1');

    const { topic, messages } = send.mock.calls[0][0];
    expect(topic).toBe('inventory.rejected');
    expect(messages).toHaveLength(1);
    expect(messages[0].key).toBe(ORDER_ID);
    expect(messages[0].headers).toEqual({ 'correlation-id': 'corr-1', 'event-type': 'INVENTORY_REJECTED' });
    const envelope = JSON.parse(messages[0].value);
    expect(envelope).toMatchObject({
      eventId: 'event-1',
      eventType: 'INVENTORY_REJECTED',
      aggregateId: ORDER_ID,
      data: { orderId: ORDER_ID, reason: 'OUT_OF_STOCK' },
    });
    expect(new Date(envelope.timestamp).toISOString()).toBe(envelope.timestamp);
  });

  it('generates a fresh event ID when none is given', async () => {
    send.mockClear();
    await publishEvent(producer, KafkaTopics.INVENTORY_REJECTED, EventTypes.INVENTORY_REJECTED, ORDER_ID, {}, 'c');
    await publishEvent(producer, KafkaTopics.INVENTORY_REJECTED, EventTypes.INVENTORY_REJECTED, ORDER_ID, {}, 'c');
    const ids = send.mock.calls.map(([batch]) => JSON.parse(batch.messages[0].value).eventId);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

/** A fake KafkaJS client whose admin and consumer record calls and can be told to fail. */
const fakeKafka = (options: { subscribeFailures?: number; createTopicsError?: Error } = {}) => {
  let subscribeFailures = options.subscribeFailures ?? 0;
  const crashHandlers: Array<(event: { payload: { error: Error; restart: boolean } }) => void> = [];
  const admin = {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    createTopics: vi.fn(async () => {
      if (options.createTopicsError) throw options.createTopicsError;
      return true;
    }),
  };
  const consumer = {
    events: { CRASH: 'consumer.crash' },
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    subscribe: vi.fn(async () => {
      if (subscribeFailures > 0) {
        subscribeFailures -= 1;
        throw new Error('This server does not host this topic-partition');
      }
    }),
    run: vi.fn(async (_config: unknown) => {}),
    on: vi.fn((event: string, handler: (typeof crashHandlers)[number]) => {
      if (event === 'consumer.crash') crashHandlers.push(handler);
    }),
  };
  const kafka = { admin: () => admin, consumer: vi.fn(() => consumer) } as unknown as Kafka;
  return { kafka, admin, consumer, crash: (restart: boolean) => crashHandlers.at(-1)?.({ payload: { error: new Error('boom'), restart } }) };
};

describe('ensureTopics', () => {
  it('creates the topics and waits for their leaders', async () => {
    const { kafka, admin } = fakeKafka();
    await ensureTopics(kafka, [KafkaTopics.ORDER_CREATED, KafkaTopics.PAYMENT_FAILED]);
    expect(admin.createTopics).toHaveBeenCalledWith({
      topics: [{ topic: 'order.created' }, { topic: 'payment.failed' }],
      waitForLeaders: true,
    });
    expect(admin.disconnect).toHaveBeenCalled();
  });

  it('treats topics that already exist as success', async () => {
    const exists = Object.assign(new Error('Topic with this name already exists'), { type: 'TOPIC_ALREADY_EXISTS' });
    const { kafka } = fakeKafka({ createTopicsError: exists });
    await expect(ensureTopics(kafka, [KafkaTopics.ORDER_CREATED])).resolves.toBeUndefined();
  });

  it('passes on any other failure, after disconnecting', async () => {
    const { kafka, admin } = fakeKafka({ createTopicsError: new Error('broker down') });
    await expect(ensureTopics(kafka, [KafkaTopics.ORDER_CREATED])).rejects.toThrow('broker down');
    expect(admin.disconnect).toHaveBeenCalled();
  });
});

describe('startSagaConsumer', () => {
  const start = (fake: ReturnType<typeof fakeKafka>, sleep = vi.fn(async (_ms: number) => {})) => {
    const logger = silentLogger();
    const onMessage = vi.fn(async () => {});
    const handle = startSagaConsumer({
      clientId: 'order-service-consumer',
      groupId: 'order-service-group',
      topics: [KafkaTopics.INVENTORY_RESERVED, KafkaTopics.PAYMENT_COMPLETED],
      logger,
      onMessage,
      createKafka: () => fake.kafka,
      sleep,
    });
    return { handle, sleep, logger, onMessage };
  };

  it('subscribes from the beginning and reports running once started', async () => {
    const fake = fakeKafka();
    const { handle } = start(fake);
    await handle.ready;

    expect(fake.consumer.subscribe).toHaveBeenCalledWith({
      topics: ['inventory.reserved', 'payment.completed'],
      fromBeginning: true,
    });
    expect(fake.admin.createTopics).toHaveBeenCalled();
    expect(handle.status()).toBe('running');
  });

  it('keeps retrying with growing waits instead of giving up when the start fails', async () => {
    const fake = fakeKafka({ subscribeFailures: 3 });
    const { handle, sleep, logger } = start(fake);
    await handle.ready;

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000]);
    expect(fake.consumer.subscribe).toHaveBeenCalledTimes(4);
    expect(logger.error).toHaveBeenCalledTimes(3);
    expect(handle.status()).toBe('running');
  });

  it('caps the wait between attempts at 30 seconds', async () => {
    const fake = fakeKafka({ subscribeFailures: 7 });
    const { handle, sleep } = start(fake);
    await handle.ready;
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it('reports starting while it is still trying', async () => {
    const fake = fakeKafka({ subscribeFailures: 1 });
    let release!: () => void;
    const sleep = vi.fn((_ms: number) => new Promise<void>((resolve) => (release = resolve)));
    const { handle } = start(fake, sleep);

    await vi.waitFor(() => expect(sleep).toHaveBeenCalled());
    expect(handle.status()).toBe('starting');
    release();
    await handle.ready;
    expect(handle.status()).toBe('running');
  });

  it('starts again after a crash that KafkaJS will not recover from itself', async () => {
    const fake = fakeKafka();
    const { handle } = start(fake);
    await handle.ready;

    fake.crash(false);
    await vi.waitFor(() => expect(fake.consumer.subscribe).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(handle.status()).toBe('running'));
  });

  it('leaves a crash that KafkaJS restarts by itself alone', async () => {
    const fake = fakeKafka();
    const { handle } = start(fake);
    await handle.ready;

    fake.crash(true);
    await Promise.resolve();
    expect(fake.consumer.subscribe).toHaveBeenCalledTimes(1);
  });

  it('hands each message to onMessage with its parsed envelope and correlation ID, and survives a bad one', async () => {
    const fake = fakeKafka();
    const { handle, onMessage, logger } = start(fake);
    await handle.ready;
    const { eachMessage } = fake.consumer.run.mock.calls[0][0] as unknown as {
      eachMessage: (payload: { topic: string; message: { value: Buffer; headers: Record<string, Buffer> } }) => Promise<void>;
    };

    const envelope = { eventId: 'e-1', eventType: 'INVENTORY_RESERVED', aggregateId: ORDER_ID, data: {}, timestamp: 't' };
    await eachMessage({ topic: 'inventory.reserved', message: { value: Buffer.from(JSON.stringify(envelope)), headers: { 'correlation-id': Buffer.from('corr-9') } } });
    expect(onMessage).toHaveBeenCalledWith('inventory.reserved', envelope, 'corr-9');

    onMessage.mockRejectedValueOnce(new Error('handler failed'));
    await expect(eachMessage({ topic: 'inventory.reserved', message: { value: Buffer.from(JSON.stringify(envelope)), headers: {} } })).resolves.toBeUndefined();
    await expect(eachMessage({ topic: 'inventory.reserved', message: { value: Buffer.from('not json'), headers: {} } })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(2);
  });
});
