/**
 * Any server that speaks the OpenAI Chat Completions API with function
 * calling: LM Studio (default), Ollama, vLLM, llama.cpp server, etc.
 *
 * Runs the tool loop by hand: stream a completion, run the requested tools,
 * append their results, repeat until the model answers without tools.
 * History is stored as Chat Completions messages (without the system prompt).
 *
 * The model must support tool calling (e.g. Qwen3, Llama 3.1+, Mistral Small).
 */
import OpenAI from 'openai';
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { z } from 'zod';
import { config } from '../../config';
import { SYSTEM_PROMPT } from '../systemPrompt';
import { ToolFailure, type AssistantTool } from '../toolTypes';
import { pushTranscriptEntry, type AssistantProvider, type TranscriptEntry, type TurnInput, type TurnOutput } from './types';

let client: OpenAI | undefined;
let resolvedModel: string | undefined;

const getClient = (): OpenAI => {
  client ??= new OpenAI({
    baseURL: config.openai.baseUrl,
    apiKey: config.openai.apiKey,
    timeout: config.openai.requestTimeoutMs,
    maxRetries: 1,
  });
  return client;
};

/** `ASSISTANT_MODEL`, or else the first model the server lists (LM Studio: the loaded one). */
const resolveModel = async (): Promise<string> => {
  if (config.model) return config.model;
  if (!resolvedModel) {
    const models = await getClient().models.list();
    resolvedModel = models.data[0]?.id;
    if (!resolvedModel) throw new Error(`No model available at ${config.openai.baseUrl}. Load a model in LM Studio.`);
  }
  return resolvedModel;
};

const toFunctionTool = (tool: AssistantTool<any>): ChatCompletionTool => {
  // `io: 'input'` keeps fields with defaults optional, as the model sees them.
  const { $schema: _ignored, ...parameters } = z.toJSONSchema(tool.inputSchema, { io: 'input' }) as Record<string, unknown>;
  return { type: 'function', function: { name: tool.name, description: tool.description, parameters } };
};

/** Run one requested tool call. Every outcome becomes text for the model; nothing throws. */
const runToolCall = async (tools: AssistantTool<any>[], call: ChatCompletionMessageFunctionToolCall): Promise<string> => {
  const tool = tools.find((candidate) => candidate.name === call.function.name);
  if (!tool) return `Error: there is no tool named ${call.function.name}.`;

  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments || '{}');
  } catch {
    return 'Error: the tool arguments were not valid JSON. Try again with valid JSON arguments.';
  }
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    return `Error: invalid arguments: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`).join('; ')}`;
  }

  try {
    return await tool.run(parsed.data);
  } catch (error) {
    return `Error: ${error instanceof ToolFailure ? error.message : 'the tool failed unexpectedly.'}`;
  }
};

/**
 * Removes `<think>…</think>` reasoning that many local models (Qwen, DeepSeek
 * R1 distills) write into the visible text. Works on a stream, where a tag can
 * be split across chunks.
 */
class ThinkFilter {
  private buffer = '';
  private inThink = false;

  push(chunk: string): string {
    this.buffer += chunk;
    let output = '';
    for (;;) {
      if (this.inThink) {
        const end = this.buffer.indexOf('</think>');
        if (end === -1) {
          this.buffer = this.buffer.slice(-'</think>'.length); // keep a possible partial tag
          return output;
        }
        this.buffer = this.buffer.slice(end + '</think>'.length);
        this.inThink = false;
      } else {
        const start = this.buffer.indexOf('<think>');
        if (start === -1) {
          const safe = this.buffer.length - partialSuffix(this.buffer, '<think>');
          output += this.buffer.slice(0, safe);
          this.buffer = this.buffer.slice(safe);
          return output;
        }
        output += this.buffer.slice(0, start);
        this.buffer = this.buffer.slice(start + '<think>'.length);
        this.inThink = true;
      }
    }
  }

  flush(): string {
    const rest = this.inThink ? '' : this.buffer;
    this.buffer = '';
    return rest;
  }
}

/** Length of the longest suffix of `text` that is a prefix of `tag`. */
const partialSuffix = (text: string, tag: string): number => {
  for (let length = Math.min(tag.length - 1, text.length); length > 0; length--) {
    if (text.endsWith(tag.slice(0, length))) return length;
  }
  return 0;
};

const stripThink = (text: string): string => text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

const runTurn = async ({ history, userMessage, tools, emit, signal, log }: TurnInput): Promise<TurnOutput> => {
  const model = await resolveModel();
  const toolDefinitions = tools.map(toFunctionTool);
  const messages: ChatCompletionMessageParam[] = [
    ...(history as ChatCompletionMessageParam[]),
    { role: 'user', content: userMessage },
  ];

  let hasWrittenText = false;
  let stopReason: string | null = null;

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    const stream = await getClient().chat.completions.create(
      {
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        tools: toolDefinitions,
        tool_choice: 'auto',
        temperature: config.openai.temperature,
        stream: true,
      },
      { signal },
    );

    const filter = new ThinkFilter();
    let text = '';
    let blockStarted = false;
    const write = (piece: string): void => {
      if (!piece) return;
      if (!blockStarted) {
        piece = piece.trimStart(); // drop blank lines left where reasoning was removed
        if (!piece) return;
        if (hasWrittenText) emit({ type: 'text', delta: '\n\n' });
        blockStarted = true;
      }
      text += piece;
      hasWrittenText = true;
      emit({ type: 'text', delta: piece });
    };

    // Tool calls arrive in fragments keyed by index; assemble them.
    const calls = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason: string | null = null;
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      if (choice.delta?.content) write(filter.push(choice.delta.content));
      for (const fragment of choice.delta?.tool_calls ?? []) {
        const call = calls.get(fragment.index) ?? { id: '', name: '', arguments: '' };
        if (fragment.id) call.id = fragment.id;
        if (fragment.function?.name && !call.name) call.name = fragment.function.name;
        if (fragment.function?.arguments) call.arguments += fragment.function.arguments;
        calls.set(fragment.index, call);
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
    write(filter.flush());
    stopReason = finishReason;

    const toolCalls: ChatCompletionMessageFunctionToolCall[] = [...calls.values()]
      .filter((call) => call.name)
      .map((call, index) => ({
        id: call.id || `call_${iteration}_${index}`, // some local servers omit ids
        type: 'function',
        function: { name: call.name, arguments: call.arguments || '{}' },
      }));

    log.info(
      { provider: 'openai-compatible', model, finishReason, tools: toolCalls.map((call) => call.function.name) },
      'assistant model call',
    );

    messages.push({
      role: 'assistant',
      content: stripThink(text) || null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });
    if (toolCalls.length === 0) break;

    for (const call of toolCalls) {
      messages.push({ role: 'tool', tool_call_id: call.id, content: await runToolCall(tools, call) });
    }
    if (iteration === config.maxIterations - 1) stopReason = 'max_iterations';
  }

  if (stopReason === 'max_iterations' || stopReason === 'length') {
    emit({ type: 'text', delta: `${hasWrittenText ? '\n\n' : ''}I couldn't finish that one. Could you ask in a simpler way?` });
  } else if (!hasWrittenText) {
    emit({ type: 'text', delta: "Sorry, I didn't get an answer together. Could you rephrase that?" });
  }

  return { messages, stopReason };
};

const toTranscript = (messages: unknown[]): TranscriptEntry[] => {
  const entries: TranscriptEntry[] = [];
  for (const message of messages as ChatCompletionMessageParam[]) {
    if ((message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string') {
      pushTranscriptEntry(entries, message.role, message.content);
    }
  }
  return entries;
};

/**
 * The provider for any `/v1/chat/completions` server (LM Studio, Ollama, vLLM): runs the tool loop itself with
 * function calling.
 */
export const openaiCompatibleProvider: AssistantProvider = {
  id: 'openai-compatible',
  describeModel: () => config.model || resolvedModel || `auto (first model at ${config.openai.baseUrl})`,
  isConfigured: () => Boolean(config.openai.baseUrl),
  runTurn,
  toTranscript,
};
