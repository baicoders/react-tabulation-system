import { useEffect, useRef, useState } from 'react';
import { getToken } from '../api/client';

export type LiveType = 'scores' | 'votes' | 'round' | 'event' | 'judges';

export interface LiveNotice {
  type: LiveType;
  roundId?: number;
}

/**
 * Listens to the event's live stream (Server-Sent Events) and calls `onNotice` when something changes, so a
 * screen reloads only the data it shows, never the whole page. Uses fetch rather than EventSource so the
 * login token travels in a header, not in the URL. Reconnects after 3 seconds if the connection drops.
 * Returns whether the stream is connected, so a screen can fall back to slower polling while it is not.
 */
export function useLiveUpdates(eventId: number | null | undefined, onNotice: (notice: LiveNotice) => void): boolean {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onNotice);
  handler.current = onNotice;

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    let retry: number | undefined;

    async function connect() {
      try {
        const res = await fetch(`/api/events/${eventId}/stream`, {
          headers: { Authorization: `Bearer ${getToken() ?? ''}` },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        setConnected(true);
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          // SSE messages end with a blank line; each data line carries one JSON notice.
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const message = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = message
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('');
            if (data) handler.current(JSON.parse(data) as LiveNotice);
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      setConnected(false);
      if (!controller.signal.aborted) retry = window.setTimeout(connect, 3000);
    }

    void connect();
    return () => {
      controller.abort();
      window.clearTimeout(retry);
      setConnected(false);
    };
  }, [eventId]);

  return connected;
}

/** Collapses a burst of notices (a judge saving a page of scores) into one reload after `delay` ms. */
export function useDebouncedCallback(fn: () => void, delay = 250): () => void {
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return useRef(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => latest.current(), delay);
  }).current;
}
