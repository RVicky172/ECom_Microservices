/** Per-user usage limits for the assistant, kept in Redis. */
import { config } from '../config';
import { redis } from './redis';

/**
 * Per-user message limit, counted per clock hour.
 *
 * The gateway's limiter is per IP and in memory; this one is per user and
 * shared across assistant instances through Redis, which is what bounds
 * model spend per customer.
 *
 * @returns true if the message is allowed (and counts it), false if over the limit.
 */
export const consumeUserMessage = async (userId: string): Promise<boolean> => {
  const hour = Math.floor(Date.now() / 3_600_000);
  const key = `assistant:rate:${userId}:${hour}`;
  const [[, count]] = (await redis.multi().incr(key).expire(key, 3600).exec()) as [[Error | null, number]];
  return count <= config.userMessagesPerHour;
};
