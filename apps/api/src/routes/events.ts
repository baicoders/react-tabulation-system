import { Router } from 'express';
import { z } from 'zod';
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

eventsRouter.get('/', async (_req, res) => {
  res.json(await prisma.event.findMany({ orderBy: { createdAt: 'desc' } }));
});

eventsRouter.get('/:id', async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: idParam.parse(req.params.id) },
    include: { rounds: { orderBy: { order: 'asc' } }, groups: { include: { values: true } } },
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
  res.json(await prisma.event.update({ where: { id: idParam.parse(req.params.id) }, data }));
});

eventsRouter.delete('/:id', async (req, res) => {
  await prisma.event.delete({ where: { id: idParam.parse(req.params.id) } });
  res.status(204).end();
});
