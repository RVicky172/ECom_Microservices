import { describe, expect, it } from 'vitest';
import { parseAssistantInteraction } from '@ecommerce/shared';
import { buildInteractionEvent, type InteractionInput } from './interactionEvent';

const STARTED = Date.parse('2026-10-24T12:00:00.000Z');

const input: InteractionInput = {
  conversationId: 'b0c5d1a2-0a8e-4a3f-9a57-0d0c2e7b9f11',
  answerId: '3f2c9e1a-7b4d-4c8e-9a1f-2d6b5e8c0a47',
  provider: 'openai-compatible',
  model: 'qwen/qwen3-30b-a3b-2507',
  stopReason: 'stop',
  outcome: 'proposal',
  tools: ['search_products', 'propose_add_to_cart'],
  usage: { inputTokens: 1857, cachedInputTokens: 0, outputTokens: 96 },
  startedAt: STARTED,
  endedAt: STARTED + 4721,
};

describe('buildInteractionEvent', () => {
  it('builds the payload with latency and completion time from the injected clock', () => {
    expect(buildInteractionEvent(input)).toEqual({
      conversationId: input.conversationId,
      answerId: input.answerId,
      provider: 'openai-compatible',
      model: 'qwen/qwen3-30b-a3b-2507',
      stopReason: 'stop',
      outcome: 'proposal',
      tools: ['search_products', 'propose_add_to_cart'],
      latencyMs: 4721,
      usage: { inputTokens: 1857, cachedInputTokens: 0, outputTokens: 96 },
      completedAt: '2026-10-24T12:00:04.721Z',
    });
  });

  it('carries exactly the AC-9 fields: no user ID and no text, even when the input has them', () => {
    const leaky = { ...input, userId: '16be8435-63db-4cd3-9c33-e8de62839df2', text: 'my address is…', message: 'hi' };
    expect(Object.keys(buildInteractionEvent(leaky)).sort()).toEqual([
      'answerId',
      'completedAt',
      'conversationId',
      'latencyMs',
      'model',
      'outcome',
      'provider',
      'stopReason',
      'tools',
      'usage',
    ]);
  });

  it('rounds sub-millisecond clocks and never reports a negative latency', () => {
    expect(buildInteractionEvent({ ...input, endedAt: STARTED + 12.6 }).latencyMs).toBe(13);
    expect(buildInteractionEvent({ ...input, endedAt: STARTED - 5 }).latencyMs).toBe(0);
  });

  it('copies the tools and usage, so later changes to the inputs do not change the event', () => {
    const tools = ['list_orders'];
    const usage = { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 };
    const event = buildInteractionEvent({ ...input, tools, usage });
    tools.push('x');
    usage.inputTokens = 99;
    expect(event.tools).toEqual(['list_orders']);
    expect(event.usage?.inputTokens).toBe(1);
  });

  describe('contract with the shared parser (AC-11)', () => {
    it('passes parseAssistantInteraction unchanged', () => {
      const event = buildInteractionEvent(input);
      expect(parseAssistantInteraction(event)).toEqual(event);
    });

    it('passes for an error turn with no usage, no stop reason and no tools', () => {
      const event = buildInteractionEvent({ ...input, outcome: 'error', stopReason: null, usage: null, tools: [] });
      expect(parseAssistantInteraction(event)).toEqual(event);
    });
  });
});
