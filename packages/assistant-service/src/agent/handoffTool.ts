/**
 * `request_human_handoff` (feature 011): the customer asked for a person.
 *
 * Publishes one `assistant.handoff_requested` event per conversation, with the
 * user and conversation from the verified {@link RequestContext}, never from the
 * model. The event carries a reason and a short summary, never the transcript.
 * When to call it (only when the customer asks or agrees) is set by the system prompt.
 */
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { HANDOFF_REASONS, MAX_HANDOFF_SUMMARY, type HandoffRequestedData } from '@ecommerce/shared';
import { publishHandoff } from '../clients/handoffPublisher';
import type { RequestContext } from '../context';
import { getHandoffReference, saveHandoffReference } from '../store/handoffStore';
import type { EmitEvent } from './events';
import { defineTool, instrumented, ToolFailure } from './toolTypes';

/** "HO-" and 8 uppercase hex characters, e.g. HO-1A2B3C4D. */
const newReference = (): string => `HO-${randomBytes(4).toString('hex').toUpperCase()}`;

/** The `request_human_handoff` tool for one turn, bound to the request's user and conversation. */
export const buildHandoffTool = (ctx: RequestContext, emit: EmitEvent) =>
  defineTool({
    name: 'request_human_handoff',
    description:
      'Send the customer\'s request to talk to a person to the support team, and get a reference to give them. ' +
      'Use only when the customer asks for a person, or says yes after you offered one. Never on your own.',
    inputSchema: z.object({
      reason: z.enum(HANDOFF_REASONS).describe('Why the customer wants a person.'),
      summary: z
        .string()
        .trim()
        .min(1)
        .max(MAX_HANDOFF_SUMMARY)
        .describe('One or two sentences for support: what the customer needs. Not the conversation itself.'),
    }),
    run: instrumented('request_human_handoff', emit, async ({ reason, summary }) => {
      const existing = await getHandoffReference(ctx.userId, ctx.conversationId);
      if (existing) return { already_requested: true, reference: existing };

      const data: HandoffRequestedData = {
        reference: newReference(),
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        reason,
        summary,
        requestedAt: new Date().toISOString(),
      };
      try {
        await publishHandoff(data, ctx.correlationId);
      } catch {
        throw new ToolFailure(
          'Support could not be reached right now, so the request was NOT sent. Tell the customer to try again later.',
        );
      }
      // The request is out; if saving the reference fails, a repeat request may send a second one.
      await saveHandoffReference(ctx.userId, ctx.conversationId, data.reference).catch(() => undefined);
      return { handoff_requested: true, reference: data.reference };
    }),
  });
