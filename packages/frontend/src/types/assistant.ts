/**
 * Shapes used by the AI shopping assistant.
 * Stream events mirror `packages/assistant-service/src/agent/events.ts`; keep them in sync.
 */

/** A product the assistant shows as a card under its answer. */
export interface AssistantProductCard {
  id: string;
  name: string;
  price: number;
  category?: string;
  imageUrl?: string;
}

/** An "Add to cart" suggestion. Nothing is added until the user confirms it. */
export interface CartProposal {
  id: string;
  action: 'add';
  product: AssistantProductCard;
  quantity: number;
}

/** Why a chat turn ended with an `error` event. */
export type AssistantErrorCode =
  | 'not_configured'
  | 'rate_limited'
  | 'busy'
  | 'conversation_full'
  | 'assistant_unavailable';

/** One Server-Sent Event from `POST /api/v1/assistant/chat`. */
export type AssistantEvent =
  | { type: 'start'; conversationId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_status'; tool: string; state: 'running' | 'done' | 'error' }
  | { type: 'products'; items: AssistantProductCard[] }
  | { type: 'proposal'; proposal: CartProposal }
  | { type: 'done'; conversationId: string; stopReason: string | null }
  | { type: 'error'; code: AssistantErrorCode; message: string };

/** One bubble in the chat panel. */
export interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  products: AssistantProductCard[];
  proposals: CartProposal[];
  /** What the assistant is doing right now, e.g. "Checking your orders…". */
  activity?: string;
  error?: { code: AssistantErrorCode | 'network'; message: string };
}
