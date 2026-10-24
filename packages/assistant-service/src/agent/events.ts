/**
 * Events streamed to the browser as Server-Sent Events during one chat turn.
 * Mirrored in `packages/frontend/src/types/assistant.ts`; keep them in sync.
 */
import type { TokenUsage } from '@ecommerce/shared';

export interface ProductCard {
  id: string;
  name: string;
  price: number;
  category?: string;
  imageUrl?: string;
}

export interface CartProposal {
  /** Unique per proposal, so the UI can track which ones were confirmed. */
  id: string;
  action: 'add';
  product: ProductCard;
  quantity: number;
}

export type AssistantEvent =
  | { type: 'start'; conversationId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_status'; tool: string; state: 'running' | 'done' | 'error' }
  | { type: 'products'; items: ProductCard[] }
  | { type: 'proposal'; proposal: CartProposal }
  /** After support was told (or a repeat found the earlier request). The eval grades with it; the UI ignores it (012). */
  | { type: 'handoff'; reference: string; alreadyRequested: boolean }
  /** `answerId` identifies this answer for feedback; `usage` is the turn's token count, `null` if unreported (012). */
  | { type: 'done'; conversationId: string; stopReason: string | null; answerId: string; usage: TokenUsage | null }
  | { type: 'error'; code: AssistantErrorCode; message: string };

export type AssistantErrorCode =
  | 'not_configured'
  | 'rate_limited'
  | 'busy'
  | 'conversation_full'
  | 'assistant_unavailable';

/** Sends one event to the client. */
export type EmitEvent = (event: AssistantEvent) => void;
