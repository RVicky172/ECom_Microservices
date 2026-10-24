import { KafkaTopics } from '@ecommerce/shared';
import { describe, expect, it, vi } from 'vitest';
import { ensureAnalyticsTopics } from './analyticsTopics';

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as any;
const kafka = { kafka: true } as any;

describe('ensureAnalyticsTopics (012)', () => {
  it('creates both analytics topics once and stops', async () => {
    const ensure = vi.fn().mockResolvedValue(undefined);
    const sleep = vi.fn();
    const log = logger();
    await ensureAnalyticsTopics({ createKafka: () => kafka, ensure, sleep, logger: log });
    expect(ensure.mock.calls).toEqual([[kafka, [KafkaTopics.ASSISTANT_INTERACTION, KafkaTopics.ASSISTANT_FEEDBACK]]]);
    expect(sleep).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledOnce();
  });

  it('retries with backoff (1 s, 2 s, 4 s … capped at 30 s) until Kafka is there, logging each failure once', async () => {
    const ensure = vi.fn();
    for (let i = 0; i < 7; i++) ensure.mockRejectedValueOnce(new Error('broker down'));
    ensure.mockResolvedValue(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const log = logger();
    await ensureAnalyticsTopics({ createKafka: () => kafka, ensure, sleep, logger: log });
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(ensure).toHaveBeenCalledTimes(8);
    expect(log.warn).toHaveBeenCalledTimes(7);
    expect(log.warn.mock.calls[0][0]).toMatchObject({ err: 'broker down', attempt: 1, retryInMs: 1000 });
    expect(log.info).toHaveBeenCalledOnce();
  });

  it('never rejects, even when creating the Kafka client throws', async () => {
    let calls = 0;
    const createKafka = () => {
      calls += 1;
      if (calls === 1) throw new Error('bad config');
      return kafka;
    };
    const ensure = vi.fn().mockResolvedValue(undefined);
    await expect(
      ensureAnalyticsTopics({ createKafka, ensure, sleep: vi.fn().mockResolvedValue(undefined), logger: logger() }),
    ).resolves.toBeUndefined();
    expect(ensure).toHaveBeenCalledOnce();
  });
});
