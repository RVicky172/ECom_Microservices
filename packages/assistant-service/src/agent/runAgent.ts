/**
 * Runs one chat turn with the configured model provider.
 *
 * `ASSISTANT_PROVIDER` picks the backend:
 * - `anthropic` (default): Claude through the Anthropic API.
 * - `openai-compatible`: a local or self-hosted model, e.g. LM Studio.
 */
import { config } from '../config';
import type { RequestContext } from '../context';
import type { EmitEvent } from './events';
import { anthropicProvider } from './providers/anthropic';
import { openaiCompatibleProvider } from './providers/openaiCompatible';
import type { AssistantProvider, TurnOutput } from './providers/types';
import { buildTools } from './tools';
import type { Logger } from 'pino';

const providers: Record<string, AssistantProvider> = {
  anthropic: anthropicProvider,
  'openai-compatible': openaiCompatibleProvider,
};

/** The provider selected by `ASSISTANT_PROVIDER`. Fails fast on a typo. */
export const provider: AssistantProvider = (() => {
  const selected = providers[config.provider];
  if (!selected) {
    throw new Error(`Unknown ASSISTANT_PROVIDER "${config.provider}". Use one of: ${Object.keys(providers).join(', ')}`);
  }
  return selected;
})();

/** True when the selected provider has what it needs (an API key or a server URL). */
export const isConfigured = (): boolean => provider.isConfigured();

/** Runs one chat turn on the selected provider with the store tools for this request's user. */
export const runAgentTurn = (options: {
  history: unknown[];
  userMessage: string;
  ctx: RequestContext;
  emit: EmitEvent;
  signal: AbortSignal;
  log: Logger;
}): Promise<TurnOutput> => {
  const { ctx, emit, ...rest } = options;
  return provider.runTurn({ ...rest, emit, tools: buildTools(ctx, emit) });
};
