/**
 * The Anthropic provider with a stubbed SDK (011 AC-11): no sockets, no credits (testing-strategy rule 5).
 * The stub captures the request `runTurn` builds and plays back one final text message.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { loadPolicies } from '../policies';
import { SYSTEM_PROMPT } from '../systemPrompt';
import { defineTool, type AssistantTool } from '../toolTypes';
import { buildTools } from '../tools';
import { anthropicProvider } from './anthropic';

// The real tool set, without Redis or Kafka behind the handoff tool.
vi.mock('../../store/handoffStore', () => ({ getHandoffReference: vi.fn(), saveHandoffReference: vi.fn() }));
vi.mock('../../clients/handoffPublisher', () => ({ publishHandoff: vi.fn() }));

const helloMessage = {
  role: 'assistant',
  model: 'stub-model',
  content: [{ type: 'text', text: 'Hello!' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
};

/** `calls`: the final message of each model call in the turn, played back in order. */
const sdk = vi.hoisted(() => ({ requests: [] as any[], calls: [] as any[] }));

vi.mock('@anthropic-ai/sdk', () => {
  const streamOf = (message: any) => ({
    async *[Symbol.asyncIterator]() {
      for (const [index, block] of message.content.entries()) {
        if (block.type !== 'text') continue;
        yield { type: 'content_block_start', index, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } };
      }
    },
    finalMessage: async () => message,
  });
  class Anthropic {
    beta = {
      messages: {
        toolRunner: (params: any) => {
          sdk.requests.push(params);
          const calls = [...sdk.calls];
          const last = calls.at(-1);
          return {
            params: { ...params, messages: [...params.messages, ...calls.map((call) => ({ role: 'assistant', content: call.content }))] },
            async *[Symbol.asyncIterator]() {
              for (const call of calls) yield streamOf(call);
            },
            done: async () => last,
          };
        },
      },
    };
  }
  return { default: Anthropic };
});

const echoTool = defineTool({
  name: 'echo_tool',
  description: 'Echoes.',
  inputSchema: z.object({ text: z.string() }),
  run: async ({ text }) => text,
});

const runOnce = async (tools: AssistantTool<any>[] = [echoTool]) => {
  const emitted: unknown[] = [];
  const output = await anthropicProvider.runTurn({
    history: [],
    userMessage: 'Hi',
    tools,
    emit: (event) => emitted.push(event),
    signal: new AbortController().signal,
    log: { info: vi.fn() } as any,
  });
  return { output, emitted, request: sdk.requests.at(-1) };
};

describe('anthropic provider (stubbed SDK)', () => {
  beforeEach(() => {
    sdk.requests.length = 0;
    sdk.calls = [helloMessage];
  });

  it('sends the system prompt as one cached text block', async () => {
    const { request } = await runOnce();
    expect(request.system).toEqual([{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }]);
  });

  it('sends every tool by name, with its JSON input schema', async () => {
    const { request } = await runOnce();
    expect(request.tools.map((tool: any) => tool.name)).toEqual(['echo_tool']);
    expect(request.tools[0].input_schema).toMatchObject({ type: 'object', properties: { text: { type: 'string' } } });
  });

  it('streams the reply text and returns the history with the new turn', async () => {
    const { output, emitted } = await runOnce();
    expect(emitted).toEqual([{ type: 'text', delta: 'Hello!' }]);
    expect(output.stopReason).toBe('end_turn');
    expect(output.messages).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
    ]);
  });

  it('returns the model and its token usage for a single call (012)', async () => {
    const { output } = await runOnce();
    expect(output.model).toBe('stub-model');
    expect(output.usage).toEqual({ inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 });
  });

  it('sums usage over every model call in the turn, counting cache writes as input (012, D-025)', async () => {
    sdk.calls = [
      {
        ...helloMessage,
        model: 'claude-opus-5-5',
        content: [{ type: 'tool_use', id: 'tu_1', name: 'echo_tool', input: { text: 'x' } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0, output_tokens: 40 },
      },
      {
        ...helloMessage,
        model: 'claude-opus-5-5',
        usage: { input_tokens: 150, cache_creation_input_tokens: null, cache_read_input_tokens: 2000, output_tokens: 60 },
      },
    ];
    const { output } = await runOnce();
    expect(output.usage).toEqual({ inputTokens: 2250, cachedInputTokens: 2000, outputTokens: 100 });
    expect(output.model).toBe('claude-opus-5-5');
  });

  it('sends the store policies inside the cached system prompt (011)', async () => {
    const { request } = await runOnce();
    const [system] = request.system;
    expect(system.cache_control).toEqual({ type: 'ephemeral' });
    expect(system.text).toContain(loadPolicies());
    expect(system.text).toContain('request_human_handoff');
  });

  it('offers the handoff tool with its reason and summary inputs (011)', async () => {
    const ctx = { userId: 'u-1', correlationId: 'corr-1', conversationId: 'c-1' };
    const { request } = await runOnce(buildTools(ctx, vi.fn()));
    const handoff = request.tools.find((tool: any) => tool.name === 'request_human_handoff');
    expect(handoff).toBeDefined();
    expect(handoff.input_schema.properties.reason.enum).toEqual(['customer_request', 'policy_not_covered', 'order_problem', 'other']);
    expect(handoff.input_schema.properties.summary).toMatchObject({ type: 'string', maxLength: 500 });
    expect(Object.keys(handoff.input_schema.properties).sort()).toEqual(['reason', 'summary']);
  });
});

describe('anthropic appendReply (012 D-048)', () => {
  it("adds a text block to the turn's last assistant message, so the stored transcript shows it", () => {
    const messages = [
      { role: 'user', content: 'I want a person.' },
      { role: 'assistant', content: [{ type: 'text', text: "I'll connect you." }] },
    ];
    const updated = anthropicProvider.appendReply(messages, ' Correction.');
    expect(updated.at(-1)).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: "I'll connect you." },
        { type: 'text', text: ' Correction.' },
      ],
    });
    expect(anthropicProvider.toTranscript(updated).at(-1)?.text).toContain('Correction.');
    expect(messages[1].content).toHaveLength(1);
  });

  it('adds a new assistant message when the last one is from the user', () => {
    const updated = anthropicProvider.appendReply([{ role: 'user', content: 'Hi' }], 'Correction.');
    expect(updated.at(-1)).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'Correction.' }] });
  });
});
