import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';

// Event setup: groups, rounds, categories, criteria and judges. All admin only.
export const setupRouter = Router();
setupRouter.use(requireRole('admin'));

const id = z.coerce.number().int().positive();
const name = z.string().trim().min(1);
const percent = z.number().min(0).max(100).nullable();

// Groups ---------------------------------------------------------------

setupRouter.get('/events/:eventId/groups', async (req, res) => {
  const groups = await prisma.group.findMany({
    where: { eventId: id.parse(req.params.eventId) },
    orderBy: { id: 'asc' },
    include: { values: { orderBy: { id: 'asc' }, include: { _count: { select: { candidates: true } } } } },
  });
  res.json(groups);
});

setupRouter.post('/events/:eventId/groups', async (req, res) => {
  const body = z.object({ name, values: z.array(name).default([]) }).parse(req.body);
  const group = await prisma.group.create({
    data: { eventId: id.parse(req.params.eventId), name: body.name, values: { create: body.values.map((v) => ({ name: v })) } },
    include: { values: true },
  });
  res.status(201).json(group);
});

setupRouter.patch('/groups/:id', async (req, res) => {
  const body = z.object({ name }).parse(req.body);
  res.json(await prisma.group.update({ where: { id: id.parse(req.params.id) }, data: body }));
});

setupRouter.delete('/groups/:id', async (req, res) => {
  await prisma.group.delete({ where: { id: id.parse(req.params.id) } });
  res.status(204).end();
});

setupRouter.post('/groups/:id/values', async (req, res) => {
  const body = z.object({ name }).parse(req.body);
  res.status(201).json(await prisma.groupValue.create({ data: { groupId: id.parse(req.params.id), name: body.name } }));
});

setupRouter.delete('/group-values/:id', async (req, res) => {
  await prisma.groupValue.delete({ where: { id: id.parse(req.params.id) } });
  res.status(204).end();
});

// Rounds ---------------------------------------------------------------

const roundBody = z.object({
  name,
  kind: z.enum(['SCORED', 'PAIR_VOTE']).default('SCORED'),
  scoreMethod: z.enum(['AVERAGE', 'RANK_SUM']).default('AVERAGE'),
  advanceCount: z.number().int().positive().nullable().default(null),
  carryOverWeight: z.number().min(0).max(1).nullable().default(null),
  dropExtremes: z.boolean().default(false),
  tieBreak: z.enum(['SHARED_RANK', 'CATEGORY_SCORE', 'FIRST_PLACE_COUNT', 'ADMIN_DECIDES']).default('SHARED_RANK'),
});

setupRouter.get('/events/:eventId/rounds', async (req, res) => {
  const rounds = await prisma.round.findMany({
    where: { eventId: id.parse(req.params.eventId) },
    orderBy: { order: 'asc' },
    include: {
      _count: { select: { entries: true } },
      categories: { orderBy: { order: 'asc' }, include: { criteria: { orderBy: { order: 'asc' } } } },
    },
  });
  res.json(rounds);
});

setupRouter.post('/events/:eventId/rounds', async (req, res) => {
  const eventId = id.parse(req.params.eventId);
  const data = roundBody.parse(req.body);
  const last = await prisma.round.aggregate({ where: { eventId }, _max: { order: true } });
  const round = await prisma.round.create({ data: { ...data, eventId, order: (last._max.order ?? 0) + 1 } });
  res.status(201).json(round);
});

setupRouter.patch('/rounds/:id', async (req, res) => {
  const data = roundBody.partial().parse(req.body);
  res.json(await prisma.round.update({ where: { id: id.parse(req.params.id) }, data }));
});

setupRouter.delete('/rounds/:id', async (req, res) => {
  await prisma.round.delete({ where: { id: id.parse(req.params.id) } });
  res.status(204).end();
});

// Categories and criteria ------------------------------------------------

setupRouter.post('/rounds/:id/categories', async (req, res) => {
  const roundId = id.parse(req.params.id);
  const body = z.object({ name, weight: percent.default(null) }).parse(req.body);
  const count = await prisma.category.count({ where: { roundId } });
  res.status(201).json(await prisma.category.create({ data: { ...body, roundId, order: count } }));
});

setupRouter.patch('/categories/:id', async (req, res) => {
  const body = z.object({ name, weight: percent }).partial().parse(req.body);
  res.json(await prisma.category.update({ where: { id: id.parse(req.params.id) }, data: body }));
});

setupRouter.delete('/categories/:id', async (req, res) => {
  await prisma.category.delete({ where: { id: id.parse(req.params.id) } });
  res.status(204).end();
});

const criterionBody = z
  .object({ name, minPoints: z.number().min(0), maxPoints: z.number().positive(), weight: percent.default(null) })
  .refine((c) => c.maxPoints > c.minPoints, { message: 'Max points must be above min points', path: ['maxPoints'] });

setupRouter.post('/categories/:id/criteria', async (req, res) => {
  const categoryId = id.parse(req.params.id);
  const body = criterionBody.parse(req.body);
  const count = await prisma.criterion.count({ where: { categoryId } });
  res.status(201).json(await prisma.criterion.create({ data: { ...body, categoryId, order: count } }));
});

setupRouter.patch('/criteria/:id', async (req, res) => {
  const body = z
    .object({ name, minPoints: z.number().min(0), maxPoints: z.number().positive(), weight: percent })
    .partial()
    .parse(req.body);
  res.json(await prisma.criterion.update({ where: { id: id.parse(req.params.id) }, data: body }));
});

setupRouter.delete('/criteria/:id', async (req, res) => {
  await prisma.criterion.delete({ where: { id: id.parse(req.params.id) } });
  res.status(204).end();
});

// Judges -----------------------------------------------------------------

const judgeSelect = {
  id: true,
  name: true,
  categories: { select: { categoryId: true } },
  _count: { select: { scores: { where: { status: 'SUBMITTED' as const } } } },
};

function judgeDto(j: { id: number; name: string; categories: { categoryId: number }[]; _count: { scores: number } }) {
  return { id: j.id, name: j.name, categoryIds: j.categories.map((c) => c.categoryId), submittedScores: j._count.scores };
}

setupRouter.get('/events/:eventId/judges', async (req, res) => {
  const judges = await prisma.judge.findMany({
    where: { eventId: id.parse(req.params.eventId) },
    orderBy: { name: 'asc' },
    select: judgeSelect,
  });
  res.json(judges.map(judgeDto));
});

setupRouter.post('/events/:eventId/judges', async (req, res) => {
  const body = z
    .object({ name, password: z.string().min(4, 'Password needs at least 4 characters'), categoryIds: z.array(z.number().int()).default([]) })
    .parse(req.body);
  const judge = await prisma.judge.create({
    data: {
      eventId: id.parse(req.params.eventId),
      name: body.name,
      passwordHash: await bcrypt.hash(body.password, 10),
      categories: { create: body.categoryIds.map((categoryId) => ({ categoryId })) },
    },
    select: judgeSelect,
  });
  res.status(201).json(judgeDto(judge));
});

setupRouter.patch('/judges/:id', async (req, res) => {
  const body = z
    .object({ name, password: z.string().min(4), categoryIds: z.array(z.number().int()) })
    .partial()
    .parse(req.body);
  const judgeId = id.parse(req.params.id);

  if (body.categoryIds) {
    // Assignments can change while a round is open or not started, but not for a closed round:
    // that would change who its results came from.
    const current = await prisma.judge.findUniqueOrThrow({ where: { id: judgeId }, select: { eventId: true, categories: { select: { categoryId: true } } } });
    const before = new Set(current.categories.map((c) => c.categoryId));
    const after = new Set(body.categoryIds);
    const changed = [...new Set([...before, ...after])].filter((cid) => before.has(cid) !== after.has(cid));
    const touched = await prisma.category.findMany({ where: { id: { in: changed } }, select: { id: true, round: { select: { eventId: true, name: true, status: true } } } });
    if (touched.length !== changed.length || touched.some((c) => c.round.eventId !== current.eventId)) {
      return res.status(400).json({ error: 'A category is not part of this event' });
    }
    const closed = touched.find((c) => c.round.status === 'CLOSED');
    if (closed) return res.status(409).json({ error: `${closed.round.name} is closed, so who judged it cannot change` });
  }

  const judge = await prisma.judge.update({
    where: { id: judgeId },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.password ? { passwordHash: await bcrypt.hash(body.password, 10) } : {}),
      ...(body.categoryIds
        ? { categories: { deleteMany: {}, create: body.categoryIds.map((categoryId) => ({ categoryId })) } }
        : {}),
    },
    select: judgeSelect,
  });
  res.json(judgeDto(judge));
});

setupRouter.delete('/judges/:id', async (req, res) => {
  await prisma.judge.delete({ where: { id: id.parse(req.params.id) } });
  res.status(204).end();
});
