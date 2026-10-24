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

const sdk = vi.hoisted(() => ({ requests: [] as any[] }));

vi.mock('@anthropic-ai/sdk', () => {
  const finalMessage = {
    role: 'assistant',
    model: 'stub-model',
    content: [{ type: 'text', text: 'Hello!' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
  };
  const stream = {
    async *[Symbol.asyncIterator]() {
      yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
      yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello!' } };
    },
    finalMessage: async () => finalMessage,
  };
  class Anthropic {
    beta = {
      messages: {
        toolRunner: (params: any) => {
          sdk.requests.push(params);
          return {
            params: { ...params, messages: [...params.messages, { role: 'assistant', content: finalMessage.content }] },
            async *[Symbol.asyncIterator]() {
              yield stream;
            },
            done: async () => finalMessage,
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
