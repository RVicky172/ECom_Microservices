/**
 * Events streamed to the browser as Server-Sent Events during one chat turn.
 * Mirrored in `packages/frontend/src/types/assistant.ts`; keep them in sync.
 */

/** The product fields the chat UI shows on a card. */
export interface ProductCard {
  id: string;
  name: string;
  price: number;
  category?: string;
  imageUrl?: string;
}

/** An add-to-cart the assistant suggests. Nothing is added until the shopper confirms it in the UI. */
export interface CartProposal {
  /** Unique per proposal, so the UI can track which ones were confirmed. */
  id: string;
  action: 'add';
  product: ProductCard;
  quantity: number;
}

/**
 * One event of a turn's stream: `start`, then any mix of text deltas, tool status, products and proposals, then
 * `done` or `error`.
 */
export type AssistantEvent =
  | { type: 'start'; conversationId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_status'; tool: string; state: 'running' | 'done' | 'error' }
  | { type: 'products'; items: ProductCard[] }
  | { type: 'proposal'; proposal: CartProposal }
  | { type: 'done'; conversationId: string; stopReason: string | null }
  | { type: 'error'; code: AssistantErrorCode; message: string };

/** Why a turn ended in an `error` event; the chat controller maps each code to the message shown. */
export type AssistantErrorCode =
  | 'not_configured'
  | 'rate_limited'
  | 'busy'
  | 'conversation_full'
  | 'assistant_unavailable';

/** Sends one event to the client. */
export type EmitEvent = (event: AssistantEvent) => void;
