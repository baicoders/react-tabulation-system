import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { tabulateRound } from '../lib/tabulate';
import { requireRole } from '../middleware/auth';

// Running a round on the night: open it, watch the tabulation, close it and send the Top N on.
export const roundsRouter = Router();
const admin = requireRole('admin');
const id = z.coerce.number().int().positive();

async function audit(eventId: number, actor: string, action: string, details: object) {
  await prisma.auditLog.create({ data: { eventId, actor, action, details } });
}

roundsRouter.get('/rounds/:id/tabulation', admin, async (req, res) => {
  res.json(await tabulateRound(id.parse(req.params.id)));
});

roundsRouter.post('/rounds/:id/open', admin, async (req, res) => {
  const round = await prisma.round.findUniqueOrThrow({ where: { id: id.parse(req.params.id) }, include: { _count: { select: { entries: true } } } });
  const otherOpen = await prisma.round.findFirst({ where: { eventId: round.eventId, status: 'OPEN', id: { not: round.id } } });
  if (otherOpen) return res.status(409).json({ error: `Close ${otherOpen.name} before opening ${round.name}` });

  if (round._count.entries === 0) {
    const previous = await prisma.round.findFirst({ where: { eventId: round.eventId, order: { lt: round.order } }, orderBy: { order: 'desc' } });
    if (previous && previous.status !== 'CLOSED') return res.status(409).json({ error: `Close ${previous.name} first; it decides who is in this round` });
    // The first round takes every candidate; later rounds are filled when the round before closes.
    const candidateIds = previous
      ? (await prisma.roundEntry.findMany({ where: { roundId: previous.id, advanced: true }, select: { candidateId: true } })).map((e) => e.candidateId)
      : (await prisma.candidate.findMany({ where: { eventId: round.eventId }, select: { id: true } })).map((c) => c.id);
    if (candidateIds.length === 0) return res.status(409).json({ error: 'No candidates to put in this round' });
    await prisma.roundEntry.createMany({ data: candidateIds.map((candidateId) => ({ roundId: round.id, candidateId })), skipDuplicates: true });
  }
  await prisma.round.update({ where: { id: round.id }, data: { status: 'OPEN' } });
  await audit(round.eventId, req.user!.name, 'round.open', { roundId: round.id, name: round.name });
  res.json(await tabulateRound(round.id));
});

roundsRouter.post('/rounds/:id/close', admin, async (req, res) => {
  const { includeTies } = z.object({ includeTies: z.boolean().default(false) }).parse(req.body ?? {});
  const roundId = id.parse(req.params.id);
  const tab = await tabulateRound(roundId);
  if (tab.round.status !== 'OPEN') return res.status(409).json({ error: `${tab.round.name} is not open` });
  if (tab.round.kind === 'PAIR_VOTE' && tab.pairs.length === 0) return res.status(409).json({ error: 'Set the pairs first' });
  if (!tab.complete && tab.pairTies.length === 0) {
    const waiting = tab.judges.filter((j) => j.required > 0 && !j.done).map((j) => j.name);
    return res.status(409).json({ error: `Waiting on ${waiting.join(', ')}` });
  }
  if (tab.unpaired > 0) return res.status(409).json({ error: `${tab.unpaired} candidates have no pair yet` });
  if (tab.pairTies.length > 0) {
    return res.status(409).json({ error: `${tab.pairTies.length === 1 ? 'A pair is' : `${tab.pairTies.length} pairs are`} tied on votes. A judge needs to change a vote.` });
  }
  if (tab.tieAtCutLine.length > 0 && !includeTies) {
    return res.status(409).json({
      error: `${tab.tieAtCutLine.length} candidates tie at the Top ${tab.round.advanceCount} line`,
      tie: tab.tieAtCutLine,
    });
  }

  const round = await prisma.round.findUniqueOrThrow({ where: { id: roundId } });
  const advancing = new Set(tab.advancingIds);
  const next = await prisma.round.findFirst({ where: { eventId: round.eventId, order: { gt: round.order } }, orderBy: { order: 'asc' } });

  await prisma.$transaction([
    ...tab.standings.map((s) =>
      prisma.roundEntry.update({
        where: { roundId_candidateId: { roundId, candidateId: s.candidateId } },
        data: { score: s.score, rank: s.rank, advanced: round.advanceCount ? advancing.has(s.candidateId) : null },
      }),
    ),
    prisma.round.update({ where: { id: roundId }, data: { status: 'CLOSED' } }),
    ...(next && round.advanceCount
      ? [prisma.roundEntry.createMany({ data: tab.advancingIds.map((candidateId) => ({ roundId: next.id, candidateId })), skipDuplicates: true })]
      : []),
  ]);
  await audit(round.eventId, req.user!.name, 'round.close', { roundId, name: round.name, advanced: tab.advancingIds.length, includeTies });
  res.json({ closed: true, advanced: tab.advancingIds.length, nextRound: next ? { id: next.id, name: next.name } : null });
});

// Undo a close: the round opens again, its results are cleared and the next round empties if it has not started.
roundsRouter.post('/rounds/:id/reopen', admin, async (req, res) => {
  const round = await prisma.round.findUniqueOrThrow({ where: { id: id.parse(req.params.id) } });
  const next = await prisma.round.findFirst({ where: { eventId: round.eventId, order: { gt: round.order } }, orderBy: { order: 'asc' } });
  if (next && next.status !== 'PENDING') return res.status(409).json({ error: `${next.name} has already started` });
  await prisma.$transaction([
    prisma.roundEntry.updateMany({ where: { roundId: round.id }, data: { score: null, rank: null, advanced: null } }),
    prisma.round.update({ where: { id: round.id }, data: { status: 'OPEN' } }),
    ...(next ? [prisma.roundEntry.deleteMany({ where: { roundId: next.id } })] : []),
  ]);
  await audit(round.eventId, req.user!.name, 'round.reopen', { roundId: round.id, name: round.name });
  res.json({ reopened: true });
});

// Lets one judge change their scores again in this round.
roundsRouter.post('/rounds/:id/judges/:judgeId/unlock', admin, async (req, res) => {
  const round = await prisma.round.findUniqueOrThrow({ where: { id: id.parse(req.params.id) }, include: { categories: { include: { criteria: true } } } });
  const judgeId = id.parse(req.params.judgeId);
  const criterionIds = round.categories.flatMap((c) => c.criteria.map((cr) => cr.id));
  const scores = await prisma.score.updateMany({ where: { judgeId, criterionId: { in: criterionIds } }, data: { status: 'DRAFT' } });
  const votes = await prisma.pairVote.updateMany({ where: { judgeId, pair: { roundId: round.id } }, data: { status: 'DRAFT' } });
  const count = scores.count + votes.count;
  await audit(round.eventId, req.user!.name, 'scores.unlock', { roundId: round.id, judgeId, count });
  res.json({ unlocked: count });
});

// Testing mode clean-up: delete the test scores (or every score) in a round that is not closed.
roundsRouter.post('/rounds/:id/reset-scores', admin, async (req, res) => {
  const { testOnly } = z.object({ testOnly: z.boolean().default(true) }).parse(req.body ?? {});
  const round = await prisma.round.findUniqueOrThrow({ where: { id: id.parse(req.params.id) }, include: { categories: { include: { criteria: true } } } });
  if (round.status === 'CLOSED') return res.status(409).json({ error: 'Reopen the round before resetting its scores' });
  const criterionIds = round.categories.flatMap((c) => c.criteria.map((cr) => cr.id));
  const testFilter = testOnly ? { isTest: true } : {};
  const scores = await prisma.score.deleteMany({ where: { criterionId: { in: criterionIds }, ...testFilter } });
  const votes = await prisma.pairVote.deleteMany({ where: { pair: { roundId: round.id }, ...testFilter } });
  const count = scores.count + votes.count;
  await audit(round.eventId, req.user!.name, 'scores.reset', { roundId: round.id, testOnly, count });
  res.json({ deleted: count });
});

// Pairs for a pair-vote round. Ranked: best of the round before meets the lowest (1 vs 10, 2 vs 9).
// Random: a draw, for guidelines that add an element of chance. Pairs can be redrawn until the first vote.
roundsRouter.post('/rounds/:id/pairs', admin, async (req, res) => {
  const { method } = z.object({ method: z.enum(['RANKED', 'RANDOM']) }).parse(req.body);
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: id.parse(req.params.id) },
    include: { entries: { select: { candidateId: true } }, _count: { select: { pairs: true } } },
  });
  if (round.kind !== 'PAIR_VOTE') return res.status(400).json({ error: `${round.name} is not a pair-vote round` });
  if (round.status === 'CLOSED') return res.status(409).json({ error: `${round.name} is closed` });
  const votes = await prisma.pairVote.count({ where: { pair: { roundId: round.id } } });
  if (votes > 0) return res.status(409).json({ error: 'Judges have started voting, so the pairs are fixed' });
  if (round.entries.length < 2) return res.status(409).json({ error: 'Open the round first; it needs at least 2 candidates' });
  if (round.entries.length % 2 !== 0) return res.status(409).json({ error: `${round.entries.length} candidates cannot be split into pairs` });

  let order = round.entries.map((e) => e.candidateId);
  if (method === 'RANKED') {
    const previous = await prisma.round.findFirst({
      where: { eventId: round.eventId, order: { lt: round.order }, status: 'CLOSED' },
      orderBy: { order: 'desc' },
      include: { entries: { where: { candidateId: { in: order } }, select: { candidateId: true, rank: true } } },
    });
    const rank = new Map(previous?.entries.map((e) => [e.candidateId, e.rank ?? Number.MAX_SAFE_INTEGER]) ?? []);
    order.sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER));
    const half = order.length / 2;
    order = order.slice(0, half).flatMap((top, i) => [top, order[order.length - 1 - i]]);
  } else {
    for (let i = order.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
  }

  await prisma.$transaction([
    prisma.pair.deleteMany({ where: { roundId: round.id } }),
    prisma.pair.createMany({
      data: Array.from({ length: order.length / 2 }, (_, i) => ({ roundId: round.id, candidateAId: order[i * 2], candidateBId: order[i * 2 + 1], order: i })),
    }),
  ]);
  await audit(round.eventId, req.user!.name, 'pairs.set', { roundId: round.id, method, pairs: order.length / 2 });
  res.json(await tabulateRound(round.id));
});
