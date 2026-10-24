import type { TokenUsage } from '@ecommerce/shared';
import type { Logger } from 'pino';
import type { ProviderId } from '../../config';
import type { EmitEvent } from '../events';
import type { AssistantTool } from '../toolTypes';

/** One bubble in the chat UI, rebuilt from stored history. */
export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
}

export interface TurnInput {
  /** Earlier messages, in this provider's own message format. */
  history: unknown[];
  userMessage: string;
  tools: AssistantTool<any>[];
  emit: EmitEvent;
  signal: AbortSignal;
  log: Logger;
}

export interface TurnOutput {
  /** Full history after this turn, in this provider's format, ready to store. */
  messages: unknown[];
  stopReason: string | null;
  /** The model that answered (for LM Studio, the resolved loaded model). */
  model: string;
  /** Summed over every model call in the turn; `null` when the provider reported none (D-025). */
  usage: TokenUsage | null;
}

/**
 * A model backend. Each provider runs the tool loop with its own API and
 * stores history in its own message format, so stored conversations are
 * tagged with the provider that wrote them.
 */
export interface AssistantProvider {
  id: ProviderId;
  /** For logs and /health; may be a placeholder until resolved. */
  describeModel(): string;
  isConfigured(): boolean;
  runTurn(input: TurnInput): Promise<TurnOutput>;
  /** User-visible text only: no tool calls, tool results or reasoning. */
  toTranscript(messages: unknown[]): TranscriptEntry[];
}

/** Adds one model call's usage to the turn's total, which stays `null` until a call reports some. */
export const addUsage = (total: TokenUsage | null, call: TokenUsage): TokenUsage => {
  if (!total) return { ...call };
  return {
    inputTokens: total.inputTokens + call.inputTokens,
    cachedInputTokens: total.cachedInputTokens + call.cachedInputTokens,
    outputTokens: total.outputTokens + call.outputTokens,
  };
};

/** Appends consecutive assistant text to one bubble, since one turn may span several model calls. */
export const pushTranscriptEntry = (entries: TranscriptEntry[], role: TranscriptEntry['role'], text: string): void => {
  if (!text.trim()) return;
  const previous = entries.at(-1);
  if (role === 'assistant' && previous?.role === 'assistant') {
    previous.text += `\n\n${text}`;
  } else {
    entries.push({ role, text });
  }
};
