'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Subscribes to `/api/events` and re-renders the current page (fresh file
 * contents from the server) whenever `specs/` or `memory/` changes.
 * Also shows whether the live connection is up.
 */
export function LiveRefresh(): React.JSX.Element {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false); // EventSource reconnects by itself
    source.addEventListener('change', () => {
      router.refresh();
      setUpdatedAt(new Date().toLocaleTimeString());
    });
    return () => source.close();
  }, [router]);

  return (
    <span className={`live ${connected ? 'on' : 'off'}`} role="status">
      <span className="live-dot" aria-hidden="true" />
      {connected ? 'Live' : 'Reconnecting…'}
      {updatedAt && <span className="live-time"> · updated {updatedAt}</span>}
    </span>
  );
}
