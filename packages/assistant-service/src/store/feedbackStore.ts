/**
 * Answer ratings (feature 012): thumbs up or down per assistant answer.
 *
 * Key: `assistant:feedback:{userId}:{conversationId}`, a hash of
 * `answerId → 'up' | 'down'`. The last vote per answer wins. It expires with
 * the conversation's TTL and is deleted with the conversation. No free text.
 */
import type { AnswerRating } from '@ecommerce/shared';
import { config } from '../config';
import { redis } from './redis';

const feedbackKey = (userId: string, conversationId: string) => `assistant:feedback:${userId}:${conversationId}`;

/** Stores the user's vote on one answer (the last vote wins) and renews the hash's expiry. */
export const saveRating = async (userId: string, conversationId: string, answerId: string, rating: AnswerRating): Promise<void> => {
  const key = feedbackKey(userId, conversationId);
  await redis.multi().hset(key, answerId, rating).expire(key, config.conversationTtlSeconds).exec();
};

/** The conversation's saved votes, `answerId → rating`; `{}` when there are none. */
export const getRatings = async (userId: string, conversationId: string): Promise<Record<string, AnswerRating>> =>
  (await redis.hgetall(feedbackKey(userId, conversationId))) as Record<string, AnswerRating>;

/** Deletes the conversation's votes (with the conversation). */
export const deleteRatings = async (userId: string, conversationId: string): Promise<void> => {
  await redis.del(feedbackKey(userId, conversationId));
};
