/**
 * Calls to the assistant service.
 *
 * The chat endpoint streams Server-Sent Events from a POST, which neither
 * `EventSource` (GET only) nor Axios (no browser response streaming) supports,
 * so it uses `fetch` and parses the stream here. It shares the in-memory access
 * token and refresh logic with the Axios client in `client.ts`.
 */
import {
  API_URL,
  api,
  canRefreshSession,
  expireSession,
  getAccessToken,
  refreshAccessToken,
} from './client';
import type { AssistantEvent } from '../types/assistant';

/** The body of `POST /api/v1/assistant/chat`. Omit `conversationId` to start a new conversation. */
export interface ChatRequest {
  /** Omit to start a new conversation; the server returns its id in the `start` event. */
  conversationId?: string;
  message: string;
}

/**
 * Send one message and call `onEvent` for every streamed event until the turn ends.
 * Retries once after refreshing an expired access token, like the Axios client.
 *
 * @throws on network failure, a non-2xx response, or when `signal` aborts.
 */
export const streamAssistantChat = async (
  request: ChatRequest,
  onEvent: (event: AssistantEvent) => void,
  signal: AbortSignal,
): Promise<void> => {
  const send = () =>
    fetch(`${API_URL}/api/v1/assistant/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      },
      body: JSON.stringify(request),
      signal,
    });

  let response = await send();
  if (response.status === 401 && canRefreshSession()) {
    try {
      await refreshAccessToken();
    } catch (error) {
      expireSession();
      throw error;
    }
    response = await send();
  }
  if (!response.ok || !response.body) {
    throw new Error(`Assistant request failed with status ${response.status}`);
  }

  await readEventStream(response.body, onEvent);
};

/** Parse a `text/event-stream` body. Each event is `event: …\ndata: {json}\n\n`. */
const readEventStream = async (
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AssistantEvent) => void,
): Promise<void> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) onEvent(JSON.parse(data) as AssistantEvent);
      boundary = buffer.indexOf('\n\n');
    }
  }
};

/** A stored conversation as user/assistant text, for restoring the panel after a reload. */
export const fetchConversation = async (
  conversationId: string,
): Promise<Array<{ role: 'user' | 'assistant'; text: string }>> => {
  const { data } = await api.get<{ messages: Array<{ role: 'user' | 'assistant'; text: string }> }>(
    `/api/v1/assistant/conversations/${conversationId}`,
  );
  return data.messages;
};

/** Delete a conversation's history on the server. */
export const deleteConversation = async (conversationId: string): Promise<void> => {
  await api.delete(`/api/v1/assistant/conversations/${conversationId}`);
};
