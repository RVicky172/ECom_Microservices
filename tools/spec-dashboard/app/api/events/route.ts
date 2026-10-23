/**
 * GET /api/events — a Server-Sent Events stream that sends `change` whenever a
 * file under `specs/` or `memory/` changes. `LiveRefresh` listens and
 * re-renders the page.
 */
import { subscribe } from '@/lib/watch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEEP_ALIVE_MS = 25_000;

export function GET(request: Request): Response {
  const encoder = new TextEncoder();
  let cleanup = (): void => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string): void => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup(); // the client has gone
        }
      };

      send('retry: 2000\n\n'); // tell the browser to reconnect quickly after a restart
      const unsubscribe = subscribe(() => send(`event: change\ndata: ${Date.now()}\n\n`));
      const keepAlive = setInterval(() => send(': keep-alive\n\n'), KEEP_ALIVE_MS);
      cleanup = () => {
        clearInterval(keepAlive);
        unsubscribe();
      };

      request.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
