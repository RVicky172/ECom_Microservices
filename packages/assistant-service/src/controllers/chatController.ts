import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { UnauthorizedError, ValidationError, NotFoundError } from '@ecommerce/shared';
import type { AssistantErrorCode, AssistantEvent } from '../agent/events';
import { isConfigured, provider, runAgentTurn } from '../agent/runAgent';
import { config } from '../config';
import type { RequestContext } from '../context';
import * as conversations from '../store/conversationStore';
import { consumeUserMessage } from '../store/usageLimiter';

const chatBodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(config.maxMessageLength),
});

/** Identity from the gateway's verified JWT. Never from the request body. */
const contextFrom = (req: Request): RequestContext => {
  const userId = req.headers['x-user-id'];
  if (typeof userId !== 'string' || !userId) {
    throw new UnauthorizedError('Missing user identity');
  }
  return { userId, correlationId: req.correlationId ?? randomUUID() };
};

const errorMessages: Record<AssistantErrorCode, string> = {
  not_configured: 'The assistant is not set up on this server yet.',
  rate_limited: "You've sent a lot of messages. Please try again in a little while.",
  busy: 'Still working on your previous message.',
  conversation_full: 'This conversation is getting long. Start a new chat to continue.',
  assistant_unavailable: 'The assistant is temporarily unavailable. Please try again shortly.',
};

/**
 * POST /api/v1/assistant/chat
 *
 * Runs one turn and streams {@link AssistantEvent}s as Server-Sent Events.
 * Pre-flight problems (limits, busy, full) are sent as a single `error` event
 * so the client handles every outcome the same way.
 */
export const postChat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let ctx: RequestContext;
  let body: z.infer<typeof chatBodySchema>;
  try {
    ctx = contextFrom(req);
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid request');
    body = parsed.data;
  } catch (error) {
    return next(error);
  }

  const log: Logger = req.log;
  const conversationId = body.conversationId ?? randomUUID();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const emit = (event: AssistantEvent): void => {
    if (!res.writableEnded) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  const fail = (code: AssistantErrorCode): void => {
    emit({ type: 'error', code, message: errorMessages[code] });
    res.end();
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

  try {
    emit({ type: 'start', conversationId });
    const { messages, stopReason } = await runAgentTurn({
      history,
      userMessage: body.message,
      ctx,
      emit,
      signal: abort.signal,
      log,
    });
    await conversations.saveConversation(ctx.userId, conversationId, { provider: provider.id, messages });
    emit({ type: 'done', conversationId, stopReason });
    res.end();
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

/** GET /api/v1/assistant/conversations/:id — the visible transcript, for restoring the chat after a reload. */
export const getConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const ctx = contextFrom(req);
    const stored = await conversations.loadConversation(ctx.userId, req.params.id);
    if (!stored || stored.provider !== provider.id) throw new NotFoundError('Conversation');
    res.json({ conversationId: req.params.id, messages: provider.toTranscript(stored.messages) });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/v1/assistant/conversations/:id — the user clears their chat history. */
export const deleteConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const ctx = contextFrom(req);
    await conversations.deleteConversation(ctx.userId, req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
