/**
 * Claude via the Anthropic SDK's tool runner.
 *
 * History is stored as Anthropic message params, exactly as the API returned
 * them, and never edited (current Claude models check replayed history).
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ToolError } from '@anthropic-ai/sdk/lib/tools/ToolError';
import type { BetaMessageParam, BetaTextBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { config } from '../../config';
import { SYSTEM_PROMPT } from '../systemPrompt';
import { ToolFailure, type AssistantTool } from '../toolTypes';
import { pushTranscriptEntry, type AssistantProvider, type TranscriptEntry, type TurnInput, type TurnOutput } from './types';

let client: Anthropic | undefined;

/** Created lazily so the service starts without credentials. Reads `ANTHROPIC_API_KEY`. */
const getClient = (): Anthropic => {
  client ??= new Anthropic();
  return client;
};

/** Adapts a neutral tool to the SDK's runnable tool; expected failures become `is_error` results. */
const toRunnableTool = (tool: AssistantTool<any>) =>
  betaZodTool({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    run: async (input) => {
      try {
        return await tool.run(input);
      } catch (error) {
        if (error instanceof ToolFailure) throw new ToolError(error.message);
        throw error;
      }
    },
  });

/**
 * If a turn stopped (iteration cap) right after the model requested tools, the
 * history ends with unanswered `tool_use` blocks and the API would reject the
 * next request. Append an error result for each so the history stays valid.
 */
const closeDanglingToolUse = (messages: BetaMessageParam[]): BetaMessageParam[] => {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant' || typeof last.content === 'string') return messages;
  const pending = last.content.filter((block) => block.type === 'tool_use');
  if (pending.length === 0) return messages;
  return [
    ...messages,
    {
      role: 'user',
      content: pending.map((block) => ({
        type: 'tool_result' as const,
        tool_use_id: (block as { id: string }).id,
        content: 'Not run: the turn ended before this tool was called.',
        is_error: true,
      })),
    },
  ];
};

const runTurn = async ({ history, userMessage, tools, emit, signal, log }: TurnInput): Promise<TurnOutput> => {
  const runner = getClient().beta.messages.toolRunner(
    {
      model: config.model,
      max_tokens: config.maxTokens,
      output_config: { effort: config.effort },
      // If a safety classifier declines, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: tools.map(toRunnableTool),
      messages: [...(history as BetaMessageParam[]), { role: 'user', content: userMessage }],
      max_iterations: config.maxIterations,
      stream: true,
    },
    { signal },
  );

  // Separate text from successive model turns (before and after tool calls).
  let hasWrittenText = false;
  for await (const stream of runner) {
    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'text' && hasWrittenText) {
        emit({ type: 'text', delta: '\n\n' });
      }
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        hasWrittenText = true;
        emit({ type: 'text', delta: event.delta.text });
      }
    }

    const message = await stream.finalMessage();
    log.info(
      {
        provider: 'anthropic',
        model: message.model,
        stopReason: message.stop_reason,
        inputTokens: message.usage.input_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens,
        outputTokens: message.usage.output_tokens,
        tools: message.content.filter((block) => block.type === 'tool_use').map((block) => block.name),
      },
      'assistant model call',
    );
  }

  const final = await runner.done();
  if (final.stop_reason === 'refusal') {
    emit({ type: 'text', delta: "Sorry, I can't help with that. I'm happy to help with products, your cart or your orders." });
  } else if (final.stop_reason === 'max_tokens' || final.stop_reason === 'tool_use') {
    // tool_use here means the iteration cap was reached mid-task.
    emit({ type: 'text', delta: `${hasWrittenText ? '\n\n' : ''}I couldn't finish that one. Could you ask in a simpler way?` });
  }

  return { messages: closeDanglingToolUse([...runner.params.messages]), stopReason: final.stop_reason };
};

const toTranscript = (messages: unknown[]): TranscriptEntry[] => {
  const entries: TranscriptEntry[] = [];
  for (const message of messages as BetaMessageParam[]) {
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const text =
      typeof message.content === 'string'
        ? message.content
        : message.content
            .filter((block): block is BetaTextBlockParam => block.type === 'text')
            .map((block) => block.text)
            .join('\n\n');
    pushTranscriptEntry(entries, message.role, text);
  }
  return entries;
};

export const anthropicProvider: AssistantProvider = {
  id: 'anthropic',
  describeModel: () => config.model,
  isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  runTurn,
  toTranscript,
};
