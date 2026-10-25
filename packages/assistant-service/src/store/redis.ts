/** The assistant's Redis connection. */
import Redis from 'ioredis';
import { config } from '../config';

/** Shared Redis connection for conversations, turn locks and rate limits. */
export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: 2,
});
