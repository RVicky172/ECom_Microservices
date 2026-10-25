import { describe, expect, it } from 'vitest';
import { SseParser } from './sse';

const frame = (event: object) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`;

describe('SseParser', () => {
  it('parses whole frames as the controller writes them', () => {
    const parser = new SseParser();
    const events = parser.push(frame({ type: 'start', conversationId: 'c-1' }) + frame({ type: 'text', delta: 'Hi' }));
    expect(events).toEqual([
      { type: 'start', conversationId: 'c-1' },
      { type: 'text', delta: 'Hi' },
    ]);
  });

  it('parses a frame split across chunks at any point', () => {
    const whole = frame({ type: 'text', delta: 'Hello there' }) + frame({ type: 'done', conversationId: 'c-1', stopReason: 'stop' });
    for (let cut = 1; cut < whole.length; cut++) {
      const parser = new SseParser();
      const events = [...parser.push(whole.slice(0, cut)), ...parser.push(whole.slice(cut))];
      expect(events.map((event) => event.type)).toEqual(['text', 'done']);
    }
  });

  it('joins multi-line data with newlines', () => {
    const parser = new SseParser();
    expect(parser.push('event: text\ndata: {"type":"text",\ndata: "delta":"a"}\n\n')).toEqual([{ type: 'text', delta: 'a' }]);
  });

  it('ignores comments and frames without data, and accepts CRLF line ends', () => {
    const parser = new SseParser();
    const events = parser.push(': keep-alive\n\nevent: ping\n\r\nevent: text\r\ndata: {"type":"text","delta":"x"}\r\n\r\n');
    expect(events).toEqual([{ type: 'text', delta: 'x' }]);
  });

  it('keeps an unfinished frame until the end of the stream', () => {
    const parser = new SseParser();
    expect(parser.push('event: text\ndata: {"type":"text","delta":"tail"}')).toEqual([]);
    expect(parser.end()).toEqual([{ type: 'text', delta: 'tail' }]);
    expect(parser.end()).toEqual([]);
  });

  it('throws on data that is not JSON, naming the frame', () => {
    const parser = new SseParser();
    expect(() => parser.push('data: not json\n\n')).toThrow(/not json/);
  });
});
