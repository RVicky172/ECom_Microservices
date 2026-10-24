/**
 * Parses the assistant's Server-Sent Events stream into events (012 eval runner).
 * Feed it text chunks as they arrive; frames can be split anywhere.
 */
import type { AssistantEvent } from '../agent/events';

export class SseParser {
  private buffer = '';

  /** Returns the events completed by this chunk. */
  push(chunk: string): AssistantEvent[] {
    this.buffer += chunk.replace(/\r\n?/g, '\n');
    const events: AssistantEvent[] = [];
    for (let end = this.buffer.indexOf('\n\n'); end !== -1; end = this.buffer.indexOf('\n\n')) {
      const frame = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const event = parseFrame(frame);
      if (event) events.push(event);
    }
    return events;
  }

  /** Call when the stream ends: a last frame without its blank line still counts. */
  end(): AssistantEvent[] {
    const frame = this.buffer;
    this.buffer = '';
    const event = frame.trim() ? parseFrame(frame) : null;
    return event ? [event] : [];
  }
}

const parseFrame = (frame: string): AssistantEvent | null => {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  if (data.length === 0) return null; // a comment or an event without data
  const text = data.join('\n');
  try {
    return JSON.parse(text) as AssistantEvent;
  } catch {
    throw new Error(`SSE data is not JSON: ${text.slice(0, 200)}`);
  }
};
