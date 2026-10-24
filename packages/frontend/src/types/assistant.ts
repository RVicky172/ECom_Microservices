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
  /** Support was told; used by the eval, ignored by the chat UI (012). */
  | { type: 'handoff'; reference: string; alreadyRequested: boolean }
  | {
      type: 'done';
      conversationId: string;
      stopReason: string | null;
      /** Identifies this answer for feedback (012). */
      answerId: string;
      usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } | null;
    }
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
  /** Set when the answer finished (from `done`); only then can it be rated (012). */
  answerId?: string;
  rating?: AnswerRating;
}

/** Thumbs up or down on one assistant answer (012). */
export type AnswerRating = 'up' | 'down';

/** `GET /api/v1/assistant/conversations/:id`: the visible transcript and its saved ratings. */
export interface AssistantTranscript {
  messages: Array<{ role: 'user' | 'assistant'; text: string; answerId?: string }>;
  /** Missing on servers from before 012. */
  ratings?: Record<string, AnswerRating>;
}
