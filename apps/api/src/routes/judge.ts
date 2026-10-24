import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { pictureUrls } from '../lib/images';
import { requireRole } from '../middleware/auth';

// Everything a judge does: see the open rounds, score candidates, submit a category.
export const judgeRouter = Router();
judgeRouter.use('/judge', requireRole('judge'));

const id = z.coerce.number().int().positive();

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: Response, err: unknown) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  throw err;
}

/** The category, checked: assigned to this judge, in an open round of the judge's event. */
async function categoryForJudge(judgeId: number, eventId: number, categoryId: number) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: {
      criteria: { orderBy: { order: 'asc' } },
      round: { include: { event: { select: { id: true, testingMode: true } }, _count: { select: { entries: true } } } },
      judges: { where: { judgeId } },
    },
  });
  if (!category || category.round.eventId !== eventId || category.judges.length === 0) throw new HttpError(404, 'This category is not yours to score');
  if (category.round.status !== 'OPEN') throw new HttpError(409, `${category.round.name} is not open for scoring`);
  return category;
}

async function submittedCount(judgeId: number, criterionIds: number[]) {
  return prisma.score.count({ where: { judgeId, criterionId: { in: criterionIds }, status: 'SUBMITTED' } });
}

judgeRouter.get('/judge/sheet', async (req, res) => {
  const judgeId = req.user!.id;
  const event = await prisma.event.findUniqueOrThrow({ where: { id: req.user!.eventId! }, select: { id: true, name: true, testingMode: true } });
  const rounds = await prisma.round.findMany({
    where: { eventId: event.id, status: 'OPEN', kind: 'SCORED' },
    orderBy: { order: 'asc' },
    include: {
      _count: { select: { entries: true } },
      categories: {
        where: { judges: { some: { judgeId } } },
        orderBy: { order: 'asc' },
        include: { criteria: { orderBy: { order: 'asc' } } },
      },
    },
  });

  const result = [];
  for (const r of rounds) {
    const categories = [];
    for (const c of r.categories) {
      const criterionIds = c.criteria.map((cr) => cr.id);
      const scored = await prisma.score.count({ where: { judgeId, criterionId: { in: criterionIds }, candidate: { roundEntries: { some: { roundId: r.id } } } } });
      const required = criterionIds.length * r._count.entries;
      const submitted = required > 0 && (await submittedCount(judgeId, criterionIds)) >= required;
      categories.push({
        id: c.id,
        name: c.name,
        criteria: c.criteria.map((cr) => ({ id: cr.id, name: cr.name, min: Number(cr.minPoints), max: Number(cr.maxPoints), weight: cr.weight === null ? null : Number(cr.weight) })),
        scored,
        required,
        submitted,
      });
    }
    result.push({ id: r.id, name: r.name, entries: r._count.entries, categories });
  }
  res.json({ event, judge: { id: judgeId, name: req.user!.name }, rounds: result });
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
});

judgeRouter.get('/judge/categories/:categoryId/candidates', async (req, res) => {
  try {
    const category = await categoryForJudge(req.user!.id, req.user!.eventId!, id.parse(req.params.categoryId));
    const { page, pageSize, q } = listQuery.parse(req.query);
    const asNumber = q && /^\d+$/.test(q) ? Number(q) : undefined;
    const where = {
      roundEntries: { some: { roundId: category.roundId } },
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, ...(asNumber ? [{ number: asNumber }] : [])] } : {}),
    };
    const criterionIds = category.criteria.map((c) => c.id);
    const [total, candidates, locked] = await prisma.$transaction([
      prisma.candidate.count({ where }),
      prisma.candidate.findMany({
        where,
        orderBy: { number: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          number: true,
          name: true,
          picturePath: true,
          scores: { where: { judgeId: req.user!.id, criterionId: { in: criterionIds } }, select: { criterionId: true, points: true } },
        },
      }),
      prisma.score.count({ where: { judgeId: req.user!.id, criterionId: { in: criterionIds }, status: 'SUBMITTED' } }),
    ]);
    res.json({
      items: candidates.map((c) => ({
        id: c.id,
        number: c.number,
        name: c.name,
        thumbUrl: pictureUrls(c.picturePath).thumbUrl,
        scores: Object.fromEntries(c.scores.map((s) => [s.criterionId, Number(s.points)])),
      })),
      total,
      page,
      pageSize,
      locked: locked > 0,
    });
  } catch (err) {
    send(res, err);
  }
});

const saveBody = z.object({
  categoryId: z.number().int().positive(),
  scores: z
    .array(z.object({ candidateId: z.number().int().positive(), criterionId: z.number().int().positive(), points: z.number().nullable() }))
    .max(1000),
});

// Saves drafts. A null clears that score. Every value is checked against its criterion's range.
judgeRouter.put('/judge/scores', async (req, res) => {
  try {
    const judgeId = req.user!.id;
    const body = saveBody.parse(req.body);
    const category = await categoryForJudge(judgeId, req.user!.eventId!, body.categoryId);
    const criteria = new Map(category.criteria.map((c) => [c.id, c]));
    if ((await submittedCount(judgeId, [...criteria.keys()])) > 0) throw new HttpError(409, 'You already submitted this category. Ask the tabulator to unlock it.');

    const candidateIds = [...new Set(body.scores.map((s) => s.candidateId))];
    const inRound = await prisma.roundEntry.count({ where: { roundId: category.roundId, candidateId: { in: candidateIds } } });
    if (inRound !== candidateIds.length) throw new HttpError(400, 'Some candidates are not in this round');

    for (const s of body.scores) {
      const cr = criteria.get(s.criterionId);
      if (!cr) throw new HttpError(400, 'Unknown criterion for this category');
      if (s.points !== null && (s.points < Number(cr.minPoints) || s.points > Number(cr.maxPoints))) {
        throw new HttpError(400, `${cr.name} must be between ${Number(cr.minPoints)} and ${Number(cr.maxPoints)}`);
      }
    }

    const isTest = category.round.event.testingMode;
    await prisma.$transaction(
      body.scores.map((s) => {
        const key = { judgeId_candidateId_criterionId: { judgeId, candidateId: s.candidateId, criterionId: s.criterionId } };
        return s.points === null
          ? prisma.score.deleteMany({ where: { judgeId, candidateId: s.candidateId, criterionId: s.criterionId } })
          : prisma.score.upsert({
              where: key,
              create: { judgeId, candidateId: s.candidateId, criterionId: s.criterionId, points: s.points, isTest },
              update: { points: s.points, isTest },
            });
      }),
    );
    res.json({ saved: body.scores.length, savedAt: new Date().toISOString() });
  } catch (err) {
    send(res, err);
  }
});

// Locks the category: every candidate in the round must have a score on every criterion.
judgeRouter.post('/judge/categories/:categoryId/submit', async (req, res) => {
  try {
    const judgeId = req.user!.id;
    const category = await categoryForJudge(judgeId, req.user!.eventId!, id.parse(req.params.categoryId));
    const criterionIds = category.criteria.map((c) => c.id);
    const where = { judgeId, criterionId: { in: criterionIds }, candidate: { roundEntries: { some: { roundId: category.roundId } } } };
    const scored = await prisma.score.count({ where });
    const required = criterionIds.length * category.round._count.entries;
    if (scored < required) throw new HttpError(409, `${required - scored} scores are still missing`);
    await prisma.score.updateMany({ where, data: { status: 'SUBMITTED' } });
    res.json({ submitted: scored });
  } catch (err) {
    send(res, err);
  }
});
