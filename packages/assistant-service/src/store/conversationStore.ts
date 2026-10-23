/**
 * Conversation history in Redis.
 *
 * Key: `assistant:conv:{userId}:{conversationId}`. The user ID in the key means
 * a guessed conversation ID can never load another user's conversation.
 *
 * Messages are stored in the format of the provider that wrote them (Claude
 * and OpenAI-compatible APIs differ), tagged with that provider. A conversation
 * from a different provider is treated as new rather than converted.
 *
 * History is append-only: turns are stored as the API returned them and never
 * edited, because current Claude models check replayed history. Long
 * conversations are capped (see `config.maxHistoryMessages`) instead of truncated.
 */
import type { ProviderId } from '../config';
import { config } from '../config';
import { redis } from './redis';

export interface StoredConversation {
  provider: ProviderId;
  messages: unknown[];
}

const conversationKey = (userId: string, conversationId: string) => `assistant:conv:${userId}:${conversationId}`;
const lockKey = (userId: string, conversationId: string) => `assistant:lock:${userId}:${conversationId}`;

export const loadConversation = async (userId: string, conversationId: string): Promise<StoredConversation | null> => {
  const raw = await redis.get(conversationKey(userId, conversationId));
  if (!raw) return null;
  const parsed = JSON.parse(raw) as StoredConversation | unknown[];
  // Conversations saved before providers existed are plain Anthropic message arrays.
  return Array.isArray(parsed) ? { provider: 'anthropic', messages: parsed } : parsed;
};

export const saveConversation = async (
  userId: string,
  conversationId: string,
  conversation: StoredConversation,
): Promise<void> => {
  await redis.set(conversationKey(userId, conversationId), JSON.stringify(conversation), 'EX', config.conversationTtlSeconds);
};

export const deleteConversation = async (userId: string, conversationId: string): Promise<void> => {
  await redis.del(conversationKey(userId, conversationId));
};

/**
 * Allow only one turn at a time per conversation; two concurrent turns would
 * fork the history. Returns false if a turn is already running. The expiry
 * covers slow local models; the lock is released as soon as the turn ends.
 */
export const acquireTurnLock = async (userId: string, conversationId: string): Promise<boolean> => {
  const result = await redis.set(lockKey(userId, conversationId), '1', 'EX', 360, 'NX');
  return result === 'OK';
};

export const releaseTurnLock = async (userId: string, conversationId: string): Promise<void> => {
  await redis.del(lockKey(userId, conversationId));
};
