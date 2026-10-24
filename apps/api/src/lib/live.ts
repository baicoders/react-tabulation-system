import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';

// Live updates over Server-Sent Events. When something changes in an event (a score saved, a round closed),
// every open admin or judge screen of that event gets a short notice and reloads just the data it shows.
// Notices carry no scores, only what changed, so a screen asks the API for the data it is allowed to see.

export type LiveType = 'scores' | 'votes' | 'round' | 'event' | 'judges';

export interface LiveNotice {
  type: LiveType;
  roundId?: number;
}

const bus = new EventEmitter();
bus.setMaxListeners(0); // one listener per open screen; 15 judges and a few admins is the usual night

export function publish(eventId: number, notice: LiveNotice) {
  bus.emit(`event:${eventId}`, notice);
}

/** Holds the response open and writes each notice for this event as an SSE message. */
export function stream(req: Request, res: Response, eventId: number) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tells nginx not to buffer, so each notice reaches the browser at once.
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  const send = (notice: LiveNotice) => res.write(`data: ${JSON.stringify(notice)}\n\n`);
  // A comment line every 20 seconds keeps the connection open through proxies that drop idle ones.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
  bus.on(`event:${eventId}`, send);

  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off(`event:${eventId}`, send);
  });
}
