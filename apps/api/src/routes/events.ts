import { Router } from 'express';
import { z } from 'zod';
import { deleteCandidatePicture, deleteEventLogo, saveEventLogo, withLogo } from '../lib/images';
import { publish } from '../lib/live';
import { prisma } from '../lib/prisma';
import { MAX_PHOTO_MB, imageUpload } from '../lib/upload';
import { requireRole } from '../middleware/auth';

// Events CRUD. The other admin resources (candidates, rounds, criteria, judges) follow this same pattern.
export const eventsRouter = Router();

eventsRouter.use(requireRole('admin'));

const eventSchema = z.object({
  name: z.string().min(1),
  date: z.coerce.date().optional(),
  venue: z.string().optional(),
  organization: z.string().trim().max(120).nullable().optional(),
  // A hex colour like #03053e, used for the accent rule on printouts and the event mark.
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #03053e').nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']).optional(),
  testingMode: z.boolean().optional(),
});

const idParam = z.coerce.number().int().positive();

const counts = { _count: { select: { candidates: true, judges: true, rounds: true } } };

eventsRouter.get('/', async (_req, res) => {
  const events = await prisma.event.findMany({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], include: counts });
  res.json(events.map(withLogo));
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
  res.json(withLogo(event));
});

eventsRouter.post('/', async (req, res) => {
  const data = eventSchema.parse(req.body);
  res.status(201).json(withLogo(await prisma.event.create({ data })));
});

eventsRouter.patch('/:id', async (req, res) => {
  const data = eventSchema.partial().parse(req.body);
  const eventId = idParam.parse(req.params.id);
  // Judges log in to the one live event, so only one can be live at a time.
  if (data.status === 'ACTIVE') {
    const live = await prisma.event.findFirst({ where: { status: 'ACTIVE', id: { not: eventId } } });
    if (live) return res.status(409).json({ error: `${live.name} is live. Finish it before making another event live.` });
  }
  const updated = await prisma.event.update({ where: { id: eventId }, data });
  publish(eventId, { type: 'event' });
  res.json(withLogo(updated));
});

eventsRouter.post('/:id/logo', imageUpload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: `Upload a JPG, PNG or WebP image up to ${MAX_PHOTO_MB} MB` });
  const eventId = idParam.parse(req.params.id);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { logoPath: true } });
  const logoPath = await saveEventLogo(eventId, req.file.buffer);
  const updated = await prisma.event.update({ where: { id: eventId }, data: { logoPath } });
  await deleteEventLogo(event.logoPath);
  publish(eventId, { type: 'event' });
  res.json(withLogo(updated));
});

eventsRouter.delete('/:id/logo', async (req, res) => {
  const eventId = idParam.parse(req.params.id);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { logoPath: true } });
  const updated = await prisma.event.update({ where: { id: eventId }, data: { logoPath: null } });
  await deleteEventLogo(event.logoPath);
  publish(eventId, { type: 'event' });
  res.json(withLogo(updated));
});

eventsRouter.delete('/:id', async (req, res) => {
  const eventId = idParam.parse(req.params.id);
  const pictures = await prisma.candidate.findMany({ where: { eventId, picturePath: { not: null } }, select: { picturePath: true } });
  const { logoPath } = await prisma.event.delete({ where: { id: eventId } });
  await deleteEventLogo(logoPath);
  // The database cascade removes the candidates; their photo files go too.
  await Promise.all(pictures.map((p) => deleteCandidatePicture(p.picturePath)));
  res.status(204).end();
});
