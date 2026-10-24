/**
 * Builds the `assistant.interaction` payload for one finished chat turn (012, AC-9).
 * Takes each field by name and never spreads its input, so a user ID or message
 * text passed in by mistake cannot reach the event (design doc §6).
 */
import type { AssistantInteractionData, InteractionOutcome, TokenUsage } from '@ecommerce/shared';

export interface InteractionInput {
  conversationId: string;
  answerId: string;
  provider: string;
  model: string;
  stopReason: string | null;
  outcome: InteractionOutcome;
  tools: string[];
  usage: TokenUsage | null;
  /** Clock readings in epoch milliseconds: just before the model turn, and after the stream ended. */
  startedAt: number;
  endedAt: number;
}

export const buildInteractionEvent = (input: InteractionInput): AssistantInteractionData => ({
  conversationId: input.conversationId,
  answerId: input.answerId,
  provider: input.provider,
  model: input.model,
  stopReason: input.stopReason,
  outcome: input.outcome,
  tools: [...input.tools],
  latencyMs: Math.max(0, Math.round(input.endedAt - input.startedAt)),
  usage: input.usage
    ? {
        inputTokens: input.usage.inputTokens,
        cachedInputTokens: input.usage.cachedInputTokens,
        outputTokens: input.usage.outputTokens,
      }
    : null,
  completedAt: new Date(input.endedAt).toISOString(),
});
