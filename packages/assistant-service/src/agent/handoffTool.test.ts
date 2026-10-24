import { parseHandoffRequested } from '@ecommerce/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publishHandoff } from '../clients/handoffPublisher';
import type { RequestContext } from '../context';
import { getHandoffReference, saveHandoffReference } from '../store/handoffStore';
import { buildHandoffTool } from './handoffTool';
import { ToolFailure } from './toolTypes';

vi.mock('../store/handoffStore', () => ({ getHandoffReference: vi.fn(), saveHandoffReference: vi.fn() }));
vi.mock('../clients/handoffPublisher', () => ({ publishHandoff: vi.fn() }));

const getReference = vi.mocked(getHandoffReference);
const saveReference = vi.mocked(saveHandoffReference);
const publish = vi.mocked(publishHandoff);

const ctx: RequestContext = {
  userId: '16be8435-63db-4cd3-9c33-e8de62839df2',
  correlationId: 'corr-1',
  conversationId: 'b0c5d1a2-0a8e-4a3f-9a57-0d0c2e7b9f11',
};
const input = { reason: 'customer_request' as const, summary: 'Wants to talk to a person about order 3F2A1B2C.' };
const emit = vi.fn();
const tool = buildHandoffTool(ctx, emit);

/** The `data` of the one published event. */
const published = () => {
  expect(publish).toHaveBeenCalledTimes(1);
  return publish.mock.calls[0][0];
};

describe('request_human_handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReference.mockResolvedValue(null);
    saveReference.mockResolvedValue();
    publish.mockResolvedValue();
  });

  it('publishes one event with the context identity, a reference and exactly the six fields', async () => {
    await tool.run(input);
    const data = published();
    expect(Object.keys(data).sort()).toEqual(['conversationId', 'reason', 'reference', 'requestedAt', 'summary', 'userId']);
    expect(data).toMatchObject({ userId: ctx.userId, conversationId: ctx.conversationId, ...input });
    expect(data.reference).toMatch(/^HO-[0-9A-F]{8}$/);
    expect(new Date(data.requestedAt).toISOString()).toBe(data.requestedAt);
    expect(publish.mock.calls[0][1]).toBe(ctx.correlationId);
  });

  it('publishes a payload the shared parser accepts unchanged (contract)', async () => {
    await tool.run(input);
    const data = published();
    expect(parseHandoffRequested(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('returns the reference and stores it for the conversation', async () => {
    const result = JSON.parse(await tool.run(input));
    const { reference } = published();
    expect(result).toEqual({ handoff_requested: true, reference });
    expect(saveReference.mock.calls).toEqual([[ctx.userId, ctx.conversationId, reference]]);
  });

  it('shows progress in the chat, with the handoff event between running and done (012)', async () => {
    await tool.run(input);
    const { reference } = published();
    expect(emit.mock.calls).toEqual([
      [{ type: 'tool_status', tool: 'request_human_handoff', state: 'running' }],
      [{ type: 'handoff', reference, alreadyRequested: false }],
      [{ type: 'tool_status', tool: 'request_human_handoff', state: 'done' }],
    ]);
  });

  it('emits the handoff event only after the publish has resolved (012)', async () => {
    let acknowledge!: () => void;
    publish.mockReturnValue(new Promise<void>((resolve) => (acknowledge = resolve)));
    const running = tool.run(input);
    await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
    expect(emit.mock.calls.some(([event]) => event.type === 'handoff')).toBe(false);
    acknowledge();
    await running;
    expect(emit.mock.calls.filter(([event]) => event.type === 'handoff')).toHaveLength(1);
  });

  it('emits alreadyRequested: true with the stored reference on a repeat request (012)', async () => {
    getReference.mockResolvedValue('HO-0000BEEF');
    await tool.run(input);
    expect(emit.mock.calls.filter(([event]) => event.type === 'handoff')).toEqual([
      [{ type: 'handoff', reference: 'HO-0000BEEF', alreadyRequested: true }],
    ]);
  });

  it('returns the stored reference on a repeat request and publishes nothing', async () => {
    getReference.mockResolvedValue('HO-0000BEEF');
    const result = JSON.parse(await tool.run(input));
    expect(result).toEqual({ already_requested: true, reference: 'HO-0000BEEF' });
    expect(getReference.mock.calls).toEqual([[ctx.userId, ctx.conversationId]]);
    expect(publish).not.toHaveBeenCalled();
    expect(saveReference).not.toHaveBeenCalled();
  });

  it.each([
    ['rejects', new Error('KafkaJSConnectionError: Connection error')],
    ['times out (the publisher gives up after its cap)', new Error('Handoff publish timed out after 5000 ms')],
  ])('reports a ToolFailure and stores nothing when publishing %s', async (_case, error) => {
    publish.mockRejectedValue(error);
    const failure = await tool.run(input).catch((thrown: unknown) => thrown);
    expect(failure).toBeInstanceOf(ToolFailure);
    expect((failure as ToolFailure).message).toMatch(/could not be reached/i);
    expect(saveReference).not.toHaveBeenCalled();
    expect(emit.mock.calls.some(([event]) => event.type === 'handoff')).toBe(false); // 012: no handoff claimed
  });

  it('publishes the context user even when the model sends a user ID', async () => {
    const forged = { ...input, user_id: 'someone-else', userId: 'someone-else', conversationId: 'other-conv' };
    await tool.run(tool.inputSchema.parse(forged));
    await tool.run(forged as typeof input);
    for (const [data] of publish.mock.calls) {
      expect(data.userId).toBe(ctx.userId);
      expect(data.conversationId).toBe(ctx.conversationId);
    }
  });

  it.each([
    ['a 501-character summary', { ...input, summary: 'x'.repeat(501) }],
    ['an empty summary', { ...input, summary: ' ' }],
    ['an unknown reason', { ...input, reason: 'angry' }],
  ])('rejects %s in its input schema', (_case, bad) => {
    expect(tool.inputSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a 500-character summary', () => {
    expect(tool.inputSchema.safeParse({ ...input, summary: 'x'.repeat(500) }).success).toBe(true);
  });
});
