import { Router } from 'express';
import { z } from 'zod';
import { stream } from '../lib/live';
import { requireRole } from '../middleware/auth';

export const liveRouter = Router();

// GET /api/events/:eventId/stream: Server-Sent Events for one event. Admins may listen to any event,
// a judge only to the event they are logged in to.
liveRouter.get('/events/:eventId/stream', requireRole('admin', 'judge'), (req, res) => {
  const eventId = z.coerce.number().int().positive().parse(req.params.eventId);
  if (req.user!.role === 'judge' && req.user!.eventId !== eventId) return res.status(403).json({ error: 'Not allowed' });
  stream(req, res, eventId);
});
