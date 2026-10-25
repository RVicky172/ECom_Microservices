/**
 * The handoff reference of each conversation (feature 011), so a repeat request
 * returns the same reference instead of publishing again.
 *
 * Key: `assistant:handoff:{userId}:{conversationId}`, kept as long as the
 * conversation itself.
 */
import { config } from '../config';
import { redis } from './redis';

const handoffKey = (userId: string, conversationId: string) => `assistant:handoff:${userId}:${conversationId}`;

export const getHandoffReference = (userId: string, conversationId: string): Promise<string | null> =>
  redis.get(handoffKey(userId, conversationId));

export const saveHandoffReference = async (userId: string, conversationId: string, reference: string): Promise<void> => {
  await redis.set(handoffKey(userId, conversationId), reference, 'EX', config.conversationTtlSeconds);
};
