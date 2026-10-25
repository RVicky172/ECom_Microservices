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

/** The conversation's handoff reference, or `null` if none was requested yet. */
export const getHandoffReference = (userId: string, conversationId: string): Promise<string | null> =>
  redis.get(handoffKey(userId, conversationId));

/** Records the conversation's handoff reference, kept as long as the conversation. */
export const saveHandoffReference = async (userId: string, conversationId: string, reference: string): Promise<void> => {
  await redis.set(handoffKey(userId, conversationId), reference, 'EX', config.conversationTtlSeconds);
};
