/**
 * State and actions for the assistant chat panel.
 *
 * Data flow:
 *   send(text) ──► streamAssistantChat ──SSE events──► applyEvent ──► items[]
 *
 * The conversation id is kept in sessionStorage (per user) so a page reload
 * restores the conversation; the history itself lives on the server.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteConversation, fetchConversation, streamAssistantChat } from '../api/assistantApi';
import type { AssistantEvent, ChatItem } from '../types/assistant';

/** Status line shown while a tool runs. */
const TOOL_ACTIVITY: Record<string, string> = {
  search_products: 'Searching the catalog…',
  get_product: 'Looking at the product…',
  check_stock: 'Checking stock…',
  get_cart: 'Looking at your cart…',
  list_orders: 'Checking your orders…',
  get_order: 'Checking your order…',
  propose_add_to_cart: 'Preparing your cart suggestion…',
};

const storageKey = (userId: string) => `mercato:assistant:${userId}`;

const readStoredId = (userId: string): string | undefined => {
  try {
    return window.sessionStorage.getItem(storageKey(userId)) ?? undefined;
  } catch {
    return undefined;
  }
};

const writeStoredId = (userId: string, conversationId: string | undefined): void => {
  try {
    if (conversationId) window.sessionStorage.setItem(storageKey(userId), conversationId);
    else window.sessionStorage.removeItem(storageKey(userId));
  } catch {
    // Storage unavailable (private mode): the conversation just won't survive a reload.
  }
};

let nextItemId = 0;

const newItem = (role: ChatItem['role'], text = ''): ChatItem => ({
  id: `chat-${++nextItemId}`,
  role,
  text,
  products: [],
  proposals: [],
});

/** Fold one stream event into the assistant bubble it belongs to. */
const applyEvent = (item: ChatItem, event: AssistantEvent): ChatItem => {
  switch (event.type) {
    case 'text':
      return { ...item, text: item.text + event.delta };
    case 'tool_status':
      return { ...item, activity: event.state === 'running' ? TOOL_ACTIVITY[event.tool] ?? 'Working…' : undefined };
    case 'products': {
      const known = new Set(item.products.map((product) => product.id));
      return { ...item, products: [...item.products, ...event.items.filter((product) => !known.has(product.id))] };
    }
    case 'proposal':
      return { ...item, proposals: [...item.proposals, event.proposal] };
    case 'error':
      return { ...item, activity: undefined, error: { code: event.code, message: event.message } };
    default:
      return item;
  }
};

/**
 * @param userId The signed-in user; scopes the remembered conversation id.
 */
export const useAssistantChat = (userId: string) => {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const conversationId = useRef<string | undefined>(readStoredId(userId));
  const abortRef = useRef<AbortController | null>(null);

  // Restore the previous conversation after a page reload.
  useEffect(() => {
    const id = conversationId.current;
    if (!id) return;
    let cancelled = false;
    setIsRestoring(true);
    fetchConversation(id)
      .then((messages) => {
        if (!cancelled) setItems(messages.map((message) => newItem(message.role, message.text)));
      })
      .catch(() => {
        // Expired or deleted: start fresh.
        conversationId.current = undefined;
        writeStoredId(userId, undefined);
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Stop any in-flight reply when the panel's owner unmounts (e.g. sign-out).
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string): Promise<void> => {
      const message = text.trim();
      if (!message || isStreaming) return;

      const reply = newItem('assistant');
      setItems((current) => [...current, newItem('user', message), reply]);
      setIsStreaming(true);
      const updateReply = (update: (item: ChatItem) => ChatItem) =>
        setItems((current) => current.map((item) => (item.id === reply.id ? update(item) : item)));

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await streamAssistantChat(
          { conversationId: conversationId.current, message },
          (event) => {
            if (event.type === 'start') {
              conversationId.current = event.conversationId;
              writeStoredId(userId, event.conversationId);
            }
            updateReply((item) => applyEvent(item, event));
          },
          controller.signal,
        );
      } catch {
        if (controller.signal.aborted) {
          updateReply((item) => ({ ...item, text: item.text || 'Stopped.' }));
        } else {
          updateReply((item) => ({
            ...item,
            activity: undefined,
            error: { code: 'network', message: "Couldn't reach the assistant. Check your connection and try again." },
          }));
        }
      } finally {
        updateReply((item) => ({ ...item, activity: undefined }));
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [isStreaming, userId],
  );

  /** Stop the reply that is streaming now. */
  const stop = useCallback(() => abortRef.current?.abort(), []);

  /** Start over and delete the old conversation from the server. */
  const newChat = useCallback(() => {
    abortRef.current?.abort();
    const previous = conversationId.current;
    conversationId.current = undefined;
    writeStoredId(userId, undefined);
    setItems([]);
    if (previous) void deleteConversation(previous).catch(() => undefined);
  }, [userId]);

  return { items, isStreaming, isRestoring, send, stop, newChat };
};
