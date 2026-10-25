/**
 * HTTP handlers for `/api/v1/assistant`: run a chat turn as a Server-Sent Events stream, and read or delete a
 * stored conversation.
 */
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { ANSWER_RATINGS, UnauthorizedError, ValidationError, NotFoundError } from '@ecommerce/shared';
import type { AssistantErrorCode, AssistantEvent } from '../agent/events';
import type { TurnOutput } from '../agent/providers/types';
import { isConfigured, provider, runAgentTurn } from '../agent/runAgent';
import { TurnObserver } from '../agent/turnObserver';
import { buildInteractionEvent } from '../analytics/interactionEvent';
import { publishFeedback, publishInteraction } from '../clients/analyticsPublisher';
import { config } from '../config';
import type { RequestContext } from '../context';
import * as conversations from '../store/conversationStore';
import * as feedback from '../store/feedbackStore';
import { consumeUserMessage } from '../store/usageLimiter';

const chatBodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(config.maxMessageLength),
});

const feedbackBodySchema = z.object({ rating: z.enum(ANSWER_RATINGS) });

/** Identity from the gateway's verified JWT. Never from the request body. */
const userIdFrom = (req: Request): string => {
  const userId = req.headers['x-user-id'];
  if (typeof userId !== 'string' || !userId) {
    throw new UnauthorizedError('Missing user identity');
  }
  return userId;
};

const contextFrom = (req: Request, conversationId: string): RequestContext => ({
  userId: userIdFrom(req),
  correlationId: req.correlationId ?? randomUUID(),
  conversationId,
});

const errorMessages: Record<AssistantErrorCode, string> = {
  not_configured: 'The assistant is not set up on this server yet.',
  rate_limited: "You've sent a lot of messages. Please try again in a little while.",
  busy: 'Still working on your previous message.',
  conversation_full: 'This conversation is getting long. Start a new chat to continue.',
  assistant_unavailable: 'The assistant is temporarily unavailable. Please try again shortly.',
};

/** How many turns a stored history holds: one user bubble per turn. */
const countTurns = (messages: unknown[]): number =>
  provider.toTranscript(messages).filter((entry) => entry.role === 'user').length;

/**
 * POST /api/v1/assistant/chat
 *
 * Runs one turn and streams {@link AssistantEvent}s as Server-Sent Events.
 * Pre-flight problems (limits, busy, full) are sent as a single `error` event
 * so the client handles every outcome the same way.
 *
 * Every finished turn, a pre-flight error included, publishes one
 * `assistant.interaction` event after the response has ended (012). A turn the
 * client cancelled is not finished and publishes nothing.
 */
export const postChat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let ctx: RequestContext;
  let body: z.infer<typeof chatBodySchema>;
  try {
    userIdFrom(req); // a missing identity is a 401 whatever the body holds
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid request');
    body = parsed.data;
    ctx = contextFrom(req, body.conversationId ?? randomUUID());
  } catch (error) {
    return next(error);
  }

  const log: Logger = req.log;
  const { conversationId } = ctx;
  const answerId = randomUUID();
  const observer = new TurnObserver();
  let startedAt = Date.now();

  /** Fire-and-forget: never awaited and never rejects, so it can't slow or break the chat (AC-12). */
  const publishTurn = (turn: Pick<TurnOutput, 'stopReason' | 'model' | 'usage'> | null): void => {
    const stopReason = turn?.stopReason ?? null;
    const event = buildInteractionEvent({
      conversationId,
      answerId,
      provider: provider.id,
      model: turn?.model ?? provider.describeModel(),
      stopReason,
      outcome: observer.outcome(stopReason),
      tools: observer.tools,
      usage: turn?.usage ?? null,
      startedAt,
      endedAt: Date.now(),
    });
    void publishInteraction(event, ctx.correlationId, log);
  };

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const emit = observer.wrap((event: AssistantEvent): void => {
    if (!res.writableEnded) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  const fail = (code: AssistantErrorCode): void => {
    emit({ type: 'error', code, message: errorMessages[code] });
    res.end();
    publishTurn(null);
  };

  if (!isConfigured()) return fail('not_configured');
  if (!(await consumeUserMessage(ctx.userId))) return fail('rate_limited');

  // A conversation written by another provider (after a config change) starts fresh.
  const stored = await conversations.loadConversation(ctx.userId, conversationId);
  const history = stored?.provider === provider.id ? stored.messages : [];
  if (history.length >= config.maxHistoryMessages) return fail('conversation_full');
  if (!(await conversations.acquireTurnLock(ctx.userId, conversationId))) return fail('busy');

  // Stop calling the model if the user closes the chat or navigates away.
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  // Entry k belongs to turn k; turns saved before 012 get null (no feedback buttons).
  const earlierAnswerIds = history.length > 0 ? (stored?.answerIds ?? []) : [];
  const padding = Array<null>(Math.max(0, countTurns(history) - earlierAnswerIds.length)).fill(null);
  const answerIds = [...earlierAnswerIds, ...padding, answerId];

  try {
    emit({ type: 'start', conversationId });
    startedAt = Date.now();
    const turn = await runAgentTurn({
      history,
      userMessage: body.message,
      ctx,
      emit,
      signal: abort.signal,
      log,
    });
    await conversations.saveConversation(ctx.userId, conversationId, { provider: provider.id, messages: turn.messages, answerIds });
    emit({ type: 'done', conversationId, stopReason: turn.stopReason, answerId, usage: turn.usage });
    res.end();
    publishTurn(turn);
  } catch (error) {
    if (abort.signal.aborted) {
      log.info({ conversationId }, 'assistant turn cancelled by client');
      return;
    }
    // Both SDKs' API errors carry `status`; connection errors (e.g. LM Studio not running) carry a cause.
    const apiError = error as { status?: number; message?: string; cause?: { code?: string } };
    log.error(
      { provider: provider.id, model: provider.describeModel(), status: apiError.status, cause: apiError.cause?.code, message: apiError.message },
      'model provider error',
    );
    fail('assistant_unavailable');
  } finally {
    await conversations.releaseTurnLock(ctx.userId, conversationId);
  }
};

/**
 * GET /api/v1/assistant/conversations/:id — the visible transcript, for restoring the chat after a reload.
 * Each assistant entry carries its turn's `answerId` when it has one; `ratings` holds the saved votes (012).
 */
export const getConversation = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const ctx = contextFrom(req, req.params.id);
    const stored = await conversations.loadConversation(ctx.userId, req.params.id);
    if (!stored || stored.provider !== provider.id) throw new NotFoundError('Conversation');
    const answerIds = stored.answerIds ?? [];
    let turn = -1;
    const messages = provider.toTranscript(stored.messages).map((entry) => {
      if (entry.role === 'user') {
        turn += 1;
        return entry;
      }
      const answerId = answerIds[turn];
      return answerId ? { ...entry, answerId } : entry;
    });
    const ratings = await feedback.getRatings(ctx.userId, req.params.id);
    res.json({ conversationId: req.params.id, messages, ratings });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/assistant/conversations/:id/answers/:answerId/feedback — rate one answer up or down (012).
 * Only the conversation's owner can rate, only answers in it; the last vote counts.
 */
export const putFeedback = async (
  req: Request<{ id: string; answerId: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const ctx = contextFrom(req, req.params.id);
    const parsed = feedbackBodySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('rating must be "up" or "down"');
    // The key holds the user ID, so another user's conversation is simply not found.
    const stored = await conversations.loadConversation(ctx.userId, req.params.id);
    if (!stored || stored.provider !== provider.id) throw new NotFoundError('Conversation');
    const { answerId } = req.params;
    if (!stored.answerIds?.includes(answerId)) throw new NotFoundError('Answer');

    await feedback.saveRating(ctx.userId, req.params.id, answerId, parsed.data.rating);
    res.status(204).end();
    void publishFeedback(
      { conversationId: req.params.id, answerId, rating: parsed.data.rating, ratedAt: new Date().toISOString() },
      ctx.correlationId,
      req.log,
    );
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/v1/assistant/conversations/:id — the user clears their chat history. */
export const deleteConversation = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const ctx = contextFrom(req, req.params.id);
    await Promise.all([
      conversations.deleteConversation(ctx.userId, req.params.id),
      feedback.deleteRatings(ctx.userId, req.params.id),
    ]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
