/**
 * The OpenAI-compatible provider (LM Studio) with a stubbed `openai` client: no sockets, no model
 * (testing-strategy rule 5). Each `chat.completions.create` call plays back the next scripted list of
 * stream chunks, shaped like LM Studio's (012 T001: the usage chunk comes last, with `choices: []`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../toolTypes';
import { openaiCompatibleProvider } from './openaiCompatible';

// Empty model = "first model the server lists", as with the default LM Studio setup.
vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return { config: { ...actual.config, model: '', maxIterations: 4 } };
});

const sdk = vi.hoisted(() => ({ requests: [] as any[], calls: [] as any[][] }));

vi.mock('openai', () => {
  class OpenAI {
    models = { list: async () => ({ data: [{ id: 'local-model' }] }) };
    chat = {
      completions: {
        create: async (params: any) => {
          sdk.requests.push(params);
          const chunks = sdk.calls.shift() ?? [];
          return {
            async *[Symbol.asyncIterator]() {
              yield* chunks;
            },
          };
        },
      },
    };
  }
  return { default: OpenAI };
});

const chunk = (delta: object, finishReason: string | null = null) => ({
  model: 'local-model',
  choices: [{ index: 0, delta, finish_reason: finishReason }],
});
const usageChunk = (prompt: number, completion: number, cached?: number) => ({
  model: 'local-model',
  choices: [],
  usage: {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    ...(cached === undefined ? {} : { prompt_tokens_details: { cached_tokens: cached } }),
  },
});
const textCall = (text: string, usage?: object) => [
  chunk({ role: 'assistant', content: text }),
  chunk({}, 'stop'),
  ...(usage ? [usage] : []),
];
const toolCall = (name: string, usage?: object) => [
  chunk({ tool_calls: [{ index: 0, id: 'call_1', function: { name, arguments: '{"text":"x"}' } }] }),
  chunk({}, 'tool_calls'),
  ...(usage ? [usage] : []),
];

const echoTool = defineTool({
  name: 'echo_tool',
  description: 'Echoes.',
  inputSchema: z.object({ text: z.string() }),
  run: async ({ text }) => text,
});

const runOnce = async () => {
  const emitted: unknown[] = [];
  const output = await openaiCompatibleProvider.runTurn({
    history: [],
    userMessage: 'Hi',
    tools: [echoTool],
    emit: (event) => emitted.push(event),
    signal: new AbortController().signal,
    log: { info: vi.fn() } as any,
  });
  return { output, emitted };
};

describe('openai-compatible provider (stubbed client)', () => {
  beforeEach(() => {
    sdk.requests.length = 0;
    sdk.calls = [];
  });

  it('streams the reply text and returns the history with the new turn', async () => {
    sdk.calls = [textCall('Hello!', usageChunk(22, 10))];
    const { output, emitted } = await runOnce();
    expect(emitted).toEqual([{ type: 'text', delta: 'Hello!' }]);
    expect(output.stopReason).toBe('stop');
    expect(output.messages).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ]);
  });

  it('asks the server to report usage in the stream (012)', async () => {
    sdk.calls = [textCall('Hello!')];
    await runOnce();
    expect(sdk.requests[0].stream).toBe(true);
    expect(sdk.requests[0].stream_options).toEqual({ include_usage: true });
  });

  it('reads the final usage chunk that has no choices, and returns the model (012)', async () => {
    sdk.calls = [textCall('Hello!', usageChunk(22, 10))];
    const { output } = await runOnce();
    expect(output.usage).toEqual({ inputTokens: 22, cachedInputTokens: 0, outputTokens: 10 });
    expect(output.model).toBe('local-model');
  });

  it('sums usage over every model call in the turn, with cached tokens split out (012, D-025)', async () => {
    sdk.calls = [toolCall('echo_tool', usageChunk(1857, 20)), textCall('Done.', usageChunk(1900, 30, 1800))];
    const { output } = await runOnce();
    expect(sdk.requests).toHaveLength(2);
    expect(output.usage).toEqual({ inputTokens: 1857 + 100, cachedInputTokens: 1800, outputTokens: 50 });
  });

  it('returns usage: null, not zeros, when the server sends no usage chunk (012)', async () => {
    sdk.calls = [toolCall('echo_tool'), textCall('Done.')];
    const { output } = await runOnce();
    expect(output.usage).toBeNull();
    expect(output.model).toBe('local-model');
  });
});
