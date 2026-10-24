import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireRole } from '../middleware/auth';

// Deduction rules (for example "Guideline 7", 5 points) and the deductions applied to candidates.
// A deduction comes off the candidate's score in one round, after tabulation and before results are announced.
export const deductionsRouter = Router();
const admin = requireRole('admin');
const id = z.coerce.number().int().positive();
const points = z.number().positive().max(100);

async function audit(eventId: number, actor: string, action: string, details: object) {
  await prisma.auditLog.create({ data: { eventId, actor, action, details } });
}

// Rules ------------------------------------------------------------------

deductionsRouter.get('/events/:eventId/deduction-rules', admin, async (req, res) => {
  const rules = await prisma.deductionRule.findMany({
    where: { eventId: id.parse(req.params.eventId) },
    orderBy: { id: 'asc' },
    include: { _count: { select: { deductions: true } } },
  });
  res.json(rules);
});

deductionsRouter.post('/events/:eventId/deduction-rules', admin, async (req, res) => {
  const body = z.object({ label: z.string().trim().min(1), points }).parse(req.body);
  res.status(201).json(await prisma.deductionRule.create({ data: { ...body, eventId: id.parse(req.params.eventId) } }));
});

deductionsRouter.patch('/deduction-rules/:id', admin, async (req, res) => {
  const body = z.object({ label: z.string().trim().min(1), points }).partial().parse(req.body);
  res.json(await prisma.deductionRule.update({ where: { id: id.parse(req.params.id) }, data: body }));
});

// Deleting a rule keeps the deductions already made under it; they just lose the rule's name.
deductionsRouter.delete('/deduction-rules/:id', admin, async (req, res) => {
  await prisma.deductionRule.delete({ where: { id: id.parse(req.params.id) } });
  res.status(204).end();
});

// Deductions ---------------------------------------------------------------

deductionsRouter.get('/events/:eventId/deductions', admin, async (req, res) => {
  const deductions = await prisma.deduction.findMany({
    where: { candidate: { eventId: id.parse(req.params.eventId) } },
    orderBy: { createdAt: 'desc' },
    include: {
      candidate: { select: { id: true, number: true, name: true } },
      round: { select: { id: true, name: true, status: true } },
      rule: { select: { id: true, label: true } },
    },
  });
  res.json(deductions);
});

const deductionBody = z.object({
  candidateId: z.number().int().positive(),
  roundId: z.number().int().positive(),
  ruleId: z.number().int().positive().nullable().default(null),
  points: points.optional(),
  note: z.string().trim().max(500).optional(),
});

deductionsRouter.post('/events/:eventId/deductions', admin, async (req, res) => {
  const eventId = id.parse(req.params.eventId);
  const body = deductionBody.parse(req.body);
  const round = await prisma.round.findUnique({ where: { id: body.roundId } });
  if (!round || round.eventId !== eventId) return res.status(404).json({ error: 'Round not found in this event' });
  if (round.status === 'CLOSED') return res.status(409).json({ error: `${round.name} is closed. Reopen it to change its results.` });
  if (round.kind === 'PAIR_VOTE') return res.status(409).json({ error: `${round.name} is decided by votes, so points cannot be deducted there` });
  if (round.scoreMethod === 'RANK_SUM') return res.status(409).json({ error: `${round.name} uses rank-sum, so a point deduction would not change it` });

  const entry = await prisma.roundEntry.findUnique({ where: { roundId_candidateId: { roundId: round.id, candidateId: body.candidateId } } });
  if (!entry) return res.status(409).json({ error: `This candidate is not in ${round.name}` });

  const rule = body.ruleId ? await prisma.deductionRule.findUnique({ where: { id: body.ruleId } }) : null;
  if (body.ruleId && (!rule || rule.eventId !== eventId)) return res.status(404).json({ error: 'Rule not found in this event' });
  const pts = body.points ?? (rule ? Number(rule.points) : undefined);
  if (pts === undefined) return res.status(400).json({ error: 'Pick a rule or enter the points' });
  if (!rule && !body.note) return res.status(400).json({ error: 'Say why in the note when no rule applies' });

  const created = await prisma.deduction.create({
    data: { candidateId: body.candidateId, roundId: round.id, ruleId: rule?.id ?? null, points: pts, note: body.note || null, createdBy: req.user!.name },
    include: { candidate: { select: { id: true, number: true, name: true } }, round: { select: { id: true, name: true, status: true } }, rule: { select: { id: true, label: true } } },
  });
  await audit(eventId, req.user!.name, 'deduction.add', { deductionId: created.id, candidateId: body.candidateId, roundId: round.id, points: pts, rule: rule?.label ?? null, note: body.note ?? null });
  res.status(201).json(created);
});

deductionsRouter.delete('/deductions/:id', admin, async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(1, 'Give a reason for removing it') }).parse(req.body ?? {});
  const deduction = await prisma.deduction.findUniqueOrThrow({ where: { id: id.parse(req.params.id) }, include: { round: true, candidate: { select: { eventId: true } } } });
  if (deduction.round?.status === 'CLOSED') return res.status(409).json({ error: `${deduction.round.name} is closed. Reopen it to change its results.` });
  await prisma.deduction.delete({ where: { id: deduction.id } });
  await audit(deduction.candidate.eventId, req.user!.name, 'deduction.remove', { deductionId: deduction.id, points: Number(deduction.points), reason });
  res.status(204).end();
});
