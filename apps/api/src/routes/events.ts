import { Router } from 'express';
import { z } from 'zod';
import { deleteCandidatePicture } from '../lib/images';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';

// Events CRUD. The other admin resources (candidates, rounds, criteria, judges) follow this same pattern.
export const eventsRouter = Router();

eventsRouter.use(requireRole('admin'));

const eventSchema = z.object({
  name: z.string().min(1),
  date: z.coerce.date().optional(),
  venue: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']).optional(),
  testingMode: z.boolean().optional(),
});

const idParam = z.coerce.number().int().positive();

const counts = { _count: { select: { candidates: true, judges: true, rounds: true } } };

eventsRouter.get('/', async (_req, res) => {
  res.json(await prisma.event.findMany({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], include: counts }));
});

eventsRouter.get('/:id', async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: idParam.parse(req.params.id) },
    include: {
      ...counts,
      rounds: { orderBy: { order: 'asc' }, include: { _count: { select: { entries: true, categories: true } } } },
      groups: { orderBy: { id: 'asc' }, include: { values: { orderBy: { id: 'asc' }, include: { _count: { select: { candidates: true } } } } } },
    },
  });
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

eventsRouter.post('/', async (req, res) => {
  const data = eventSchema.parse(req.body);
  res.status(201).json(await prisma.event.create({ data }));
});

eventsRouter.patch('/:id', async (req, res) => {
  const data = eventSchema.partial().parse(req.body);
  const eventId = idParam.parse(req.params.id);
  // Judges log in to the one live event, so only one can be live at a time.
  if (data.status === 'ACTIVE') {
    const live = await prisma.event.findFirst({ where: { status: 'ACTIVE', id: { not: eventId } } });
    if (live) return res.status(409).json({ error: `${live.name} is live. Finish it before making another event live.` });
  }
  res.json(await prisma.event.update({ where: { id: eventId }, data }));
});

eventsRouter.delete('/:id', async (req, res) => {
  const eventId = idParam.parse(req.params.id);
  const pictures = await prisma.candidate.findMany({ where: { eventId, picturePath: { not: null } }, select: { picturePath: true } });
  await prisma.event.delete({ where: { id: eventId } });
  // The database cascade removes the candidates; their photo files go too.
  await Promise.all(pictures.map((p) => deleteCandidatePicture(p.picturePath)));
  res.status(204).end();
});
