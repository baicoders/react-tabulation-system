import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pictureUrls } from '../lib/images';
import { loadBasis } from '../lib/cut';
import { prisma } from '../lib/prisma';
import { publish } from '../lib/live';
import { tabulateRound } from '../lib/tabulate';
import { requireRole } from '../middleware/auth';
import { categoryWeightError } from '../scoring/category';

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
  if (round.kind === 'SCORED') {
    const categories = await prisma.category.findMany({ where: { roundId: round.id }, select: { weight: true } });
    const error = categoryWeightError(categories.map((c) => c.weight === null ? null : Number(c.weight)));
    if (error) return res.status(409).json({ error });
  }
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
  publish(round.eventId, { type: 'round', roundId: round.id });
  res.json(await tabulateRound(round.id));
});

roundsRouter.post('/rounds/:id/close', admin, async (req, res) => {
  const { includeTies } = z.object({ includeTies: z.boolean().default(false) }).parse(req.body ?? {});
  const roundId = id.parse(req.params.id);
  const categories = await prisma.category.findMany({ where: { roundId }, select: { weight: true } });
  const weightError = categoryWeightError(categories.map((c) => c.weight === null ? null : Number(c.weight)));
  if (weightError) return res.status(409).json({ error: weightError });
  const tab = await tabulateRound(roundId);
  if (tab.round.status !== 'OPEN') return res.status(409).json({ error: `${tab.round.name} is not open` });
  if (tab.round.kind === 'PAIR_VOTE' && tab.pairs.length === 0) return res.status(409).json({ error: 'Set the pairs first' });
  if (!tab.complete && tab.pairTies.length === 0) {
    const waiting = tab.judges.filter((j) => j.required > 0 && !j.done).map((j) => j.name);
    if (waiting.length) return res.status(409).json({ error: `Waiting on ${waiting.join(', ')}` });
    const categories = await prisma.category.findMany({
      where: { roundId },
      include: { _count: { select: { criteria: true, judges: true } } },
    });
    const notReady = categories.filter((c) => c._count.criteria === 0 || c._count.judges === 0).map((c) => c.name);
    return res.status(409).json({ error: notReady.length ? `Add criteria and assign judges for ${notReady.join(', ')} before closing` : 'This round is not ready to close' });
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
  // A cut based on earlier rounds can only be decided once they are all closed.
  const openSource = (await loadBasis(roundId)).find((s) => s.roundId !== roundId && !s.closed);
  if (openSource) return res.status(409).json({ error: `This cut is based on ${openSource.name}. Close ${openSource.name} first.` });

  const round = await prisma.round.findUniqueOrThrow({ where: { id: roundId } });
  const advancing = new Set(tab.advancingIds);
  const manualAdvancement = round.advanceCount === null || ('manualAdvancement' in tab && tab.manualAdvancement);
  const next = await prisma.round.findFirst({ where: { eventId: round.eventId, order: { gt: round.order } }, orderBy: { order: 'asc' } });

  await prisma.$transaction([
    ...tab.standings.map((s) =>
      prisma.roundEntry.update({
        where: { roundId_candidateId: { roundId, candidateId: s.candidateId } },
        data: { score: s.score, rank: s.rank, advanced: manualAdvancement ? null : advancing.has(s.candidateId) },
      }),
    ),
    prisma.round.update({ where: { id: roundId }, data: { status: 'CLOSED' } }),
    ...(next && !manualAdvancement
      ? [prisma.roundEntry.createMany({ data: tab.advancingIds.map((candidateId) => ({ roundId: next.id, candidateId })), skipDuplicates: true })]
      : []),
  ]);
  await audit(round.eventId, req.user!.name, 'round.close', { roundId, name: round.name, advanced: round.advanceCount ? tab.advancingIds.length : 0, includeTies });
  publish(round.eventId, { type: 'round', roundId: round.id });
  // A hand-decided cut sends nobody on automatically; the admin fills the next round's field.
  res.json({ closed: true, advanced: manualAdvancement ? 0 : tab.advancingIds.length, manualAdvancement, nextRound: next ? { id: next.id, name: next.name } : null });
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
  publish(round.eventId, { type: 'round', roundId: round.id });
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
  publish(round.eventId, { type: 'round', roundId: round.id });
  res.json({ unlocked: count });
});

// Unlock just one submitted category; other categories remain submitted.
roundsRouter.post('/categories/:id/judges/:judgeId/unlock', admin, async (req, res) => {
  const category = await prisma.category.findUniqueOrThrow({
    where: { id: id.parse(req.params.id) },
    include: { round: true, criteria: { select: { id: true } } },
  });
  const judgeId = id.parse(req.params.judgeId);
  if (category.round.status !== 'OPEN') return res.status(409).json({ error: `${category.round.name} is not open` });
  const assignment = await prisma.judgeCategory.findUnique({ where: { judgeId_categoryId: { judgeId, categoryId: category.id } } });
  if (!assignment) return res.status(404).json({ error: 'This judge is not assigned to the category' });
  const scores = await prisma.score.updateMany({ where: { judgeId, criterionId: { in: category.criteria.map((c) => c.id) }, status: 'SUBMITTED' }, data: { status: 'DRAFT' } });
  await audit(category.round.eventId, req.user!.name, 'scores.unlock-category', { roundId: category.roundId, categoryId: category.id, judgeId, count: scores.count });
  publish(category.round.eventId, { type: 'round', roundId: category.roundId });
  res.json({ unlocked: scores.count });
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
  publish(round.eventId, { type: 'round', roundId: round.id });
  res.json({ deleted: count });
});

// Rehearsal clean-up for the whole event: scores, votes, pairs and round results are deleted and every round goes
// back to not started. Only while testing mode is on, so it cannot wipe a real night by accident.
roundsRouter.post('/events/:eventId/start-over', admin, async (req, res) => {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: id.parse(req.params.eventId) } });
  if (!event.testingMode) return res.status(409).json({ error: 'Turn on testing mode first. Start over is for rehearsals only.' });
  const roundIds = (await prisma.round.findMany({ where: { eventId: event.id }, select: { id: true } })).map((r) => r.id);
  const [scores, votes] = await prisma.$transaction([
    prisma.score.deleteMany({ where: { criterion: { category: { roundId: { in: roundIds } } } } }),
    prisma.pairVote.deleteMany({ where: { pair: { roundId: { in: roundIds } } } }),
    prisma.pair.deleteMany({ where: { roundId: { in: roundIds } } }),
    prisma.roundEntry.deleteMany({ where: { roundId: { in: roundIds } } }),
    prisma.round.updateMany({ where: { id: { in: roundIds } }, data: { status: 'PENDING' } }),
  ]);
  await audit(event.id, req.user!.name, 'event.start-over', { scores: scores.count, votes: votes.count });
  publish(event.id, { type: 'round' });
  res.json({ deletedScores: scores.count, deletedVotes: votes.count });
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
  publish(round.eventId, { type: 'round', roundId: round.id });
  res.json(await tabulateRound(round.id));
});

// Who competes in a round, with what the round before says about everyone else. The admin edits the
// field by hand for cuts scores alone cannot decide: a judges' choice, a draw by lot on stage, or a
// last-minute change. Closing a round fills the next one; this shapes that list exactly.
roundsRouter.get('/rounds/:id/field', admin, async (req, res) => {
  const roundId = id.parse(req.params.id);
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      event: { select: { id: true } },
      entries: { include: { candidate: { select: { id: true, number: true, name: true, picturePath: true, status: true } } } },
    },
  });
  const previous = await prisma.round.findFirst({
    where: { eventId: round.eventId, order: { lt: round.order } },
    orderBy: { order: 'desc' },
    include: { entries: { select: { candidateId: true, score: true, rank: true, advanced: true } } },
  });
  // The previous round's combined cut ranking, when its cut is based on more rounds than itself.
  const prevTab = previous && previous.status === 'CLOSED' ? await tabulateRound(previous.id) : null;
  const prevByCandidate = new Map((previous?.entries ?? []).map((e) => [e.candidateId, e]));
  const basisByCandidate = new Map((prevTab?.basis?.standings ?? []).map((s) => [s.candidateId, s]));
  const inRound = new Set(round.entries.map((e) => e.candidateId));
  const all = await prisma.candidate.findMany({
    where: { eventId: round.eventId },
    orderBy: { number: 'asc' },
    select: { id: true, number: true, name: true, picturePath: true, status: true },
  });
  const dto = (c: { id: number; number: number; name: string; picturePath: string | null; status: string }) => ({
    candidateId: c.id,
    number: c.number,
    name: c.name,
    thumbUrl: pictureUrls(c.picturePath).thumbUrl,
    status: c.status,
  });
  // What the round before says about a candidate: its result there, and the cut basis ranking when the
  // cut is based on more rounds than that.
  const context = (candidateId: number) => {
    const prev = prevByCandidate.get(candidateId);
    const basis = basisByCandidate.get(candidateId);
    return {
      prevScore: prev && prev.score !== null ? Number(prev.score) : null,
      prevRank: prev?.rank ?? null,
      basisScore: basis?.score ?? null,
      basisRank: basis?.rank ?? null,
    };
  };
  res.json({
    round: { id: round.id, name: round.name, order: round.order, status: round.status, kind: round.kind, advanceCount: round.advanceCount },
    editable: round.status !== 'CLOSED',
    previous: previous
      ? { id: previous.id, name: previous.name, closed: previous.status === 'CLOSED', basisNames: prevTab?.basis?.names ?? null }
      : null,
    entries: round.entries
      .slice()
      .sort((a, b) => a.candidate.number - b.candidate.number)
      .map((e) => ({ ...dto(e.candidate), ...context(e.candidateId), score: e.score === null ? null : Number(e.score), rank: e.rank, advanced: e.advanced })),
    pool: all.filter((c) => !inRound.has(c.id)).map((c) => ({ ...dto(c), ...context(c.id) })),
  });
});

/** The round before says who went on: keep its "went on" flags in step with this round's field. */
async function syncPreviousFlags(round: { id: number; eventId: number; order: number }) {
  const previous = await prisma.round.findFirst({ where: { eventId: round.eventId, order: { lt: round.order } }, orderBy: { order: 'desc' } });
  if (!previous || previous.status !== 'CLOSED') return;
  const nextIds = new Set((await prisma.roundEntry.findMany({ where: { roundId: round.id }, select: { candidateId: true } })).map((e) => e.candidateId));
  const prevEntries = await prisma.roundEntry.findMany({ where: { roundId: previous.id }, select: { candidateId: true, advanced: true } });
  await prisma.$transaction(
    prevEntries
      .filter((e) => e.advanced !== nextIds.has(e.candidateId))
      .map((e) =>
        prisma.roundEntry.update({
          where: { roundId_candidateId: { roundId: previous.id, candidateId: e.candidateId } },
          data: { advanced: nextIds.has(e.candidateId) },
        }),
      ),
  );
}

roundsRouter.post('/rounds/:id/entries', admin, async (req, res) => {
  const roundId = id.parse(req.params.id);
  const { candidateIds } = z.object({ candidateIds: z.array(z.number().int().positive()).min(1).max(500) }).parse(req.body);
  const round = await prisma.round.findUniqueOrThrow({ where: { id: roundId }, select: { id: true, eventId: true, name: true, status: true, order: true } });
  if (round.status === 'CLOSED') return res.status(409).json({ error: `Reopen ${round.name} before changing who competes in it` });
  const unique = [...new Set(candidateIds)];
  const found = await prisma.candidate.findMany({ where: { id: { in: unique }, eventId: round.eventId }, select: { id: true } });
  if (found.length !== unique.length) return res.status(400).json({ error: 'A candidate is not part of this event' });
  await prisma.roundEntry.createMany({ data: unique.map((candidateId) => ({ roundId, candidateId })), skipDuplicates: true });
  await syncPreviousFlags(round);
  await audit(round.eventId, req.user!.name, 'field.add', { roundId, name: round.name, count: unique.length });
  publish(round.eventId, { type: 'round', roundId });
  res.json({ added: unique.length });
});

roundsRouter.delete('/rounds/:id/entries/:candidateId', admin, async (req, res) => {
  const roundId = id.parse(req.params.id);
  const candidateId = id.parse(req.params.candidateId);
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { categories: { include: { criteria: { select: { id: true } } } } },
  });
  if (round.status === 'CLOSED') return res.status(409).json({ error: `Reopen ${round.name} before changing who competes in it` });
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { number: true, name: true } });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  const who = `No. ${candidate.number} ${candidate.name}`;
  const criterionIds = round.categories.flatMap((c) => c.criteria.map((cr) => cr.id));
  const [scores, votes] = await Promise.all([
    prisma.score.count({ where: { candidateId, criterionId: { in: criterionIds } } }),
    prisma.pairVote.count({ where: { pair: { roundId, OR: [{ candidateAId: candidateId }, { candidateBId: candidateId }] } } }),
  ]);
  if (scores > 0) return res.status(409).json({ error: `${who} already has scores in ${round.name}. Reset the scores first.` });
  if (votes > 0) return res.status(409).json({ error: `${who} already has votes in ${round.name}. Reset the scores first.` });
  // Dropping an entry drops its pairs too (with no votes on them, as checked above), so the round is
  // left needing its pairs drawn again - exactly what a changed field needs.
  await prisma.$transaction([
    prisma.roundEntry.deleteMany({ where: { roundId, candidateId } }),
    prisma.pair.deleteMany({ where: { roundId, OR: [{ candidateAId: candidateId }, { candidateBId: candidateId }] } }),
  ]);
  await syncPreviousFlags(round);
  await audit(round.eventId, req.user!.name, 'field.remove', { roundId, name: round.name, candidateId });
  publish(round.eventId, { type: 'round', roundId });
  res.json({ removed: true });
});

// Points added to or taken off a candidate's score after tabulation: guideline penalties (an automatic
// 5-point deduction and the like) and last-minute fixes. Counted at full value in the round's score,
// so with its weight in any cut the round is part of.
roundsRouter.get('/rounds/:id/adjustments', admin, async (req, res) => {
  const rows = await prisma.adjustment.findMany({
    where: { roundId: id.parse(req.params.id) },
    orderBy: { id: 'asc' },
    include: { candidate: { select: { id: true, number: true, name: true } } },
  });
  res.json(rows.map((a) => ({ id: a.id, points: Number(a.points), reason: a.reason, actor: a.actor, candidate: a.candidate })));
});

roundsRouter.post('/rounds/:id/adjustments', admin, async (req, res) => {
  const roundId = id.parse(req.params.id);
  const body = z
    .object({
      candidateId: z.number().int().positive(),
      points: z.number().refine((n) => n !== 0, 'Give points to add or take off'),
      reason: z.string().trim().max(200).optional(),
    })
    .parse(req.body);
  const round = await prisma.round.findUniqueOrThrow({ where: { id: roundId }, select: { eventId: true, name: true, status: true } });
  if (round.status === 'CLOSED') return res.status(409).json({ error: `${round.name} is closed; reopen it before adjusting scores` });
  const entry = await prisma.roundEntry.findUnique({
    where: { roundId_candidateId: { roundId, candidateId: body.candidateId } },
    select: { candidateId: true },
  });
  if (!entry) return res.status(400).json({ error: 'That candidate does not compete in this round' });
  const created = await prisma.adjustment.create({
    data: { roundId, candidateId: body.candidateId, points: body.points, reason: body.reason || null, actor: req.user!.name },
  });
  await audit(round.eventId, req.user!.name, 'adjustment.add', { roundId, candidateId: body.candidateId, points: body.points, reason: body.reason ?? null });
  publish(round.eventId, { type: 'round', roundId });
  res.status(201).json({ id: created.id, points: Number(created.points), reason: created.reason });
});

roundsRouter.delete('/adjustments/:id', admin, async (req, res) => {
  const adjustmentId = id.parse(req.params.id);
  const existing = await prisma.adjustment.findUnique({
    where: { id: adjustmentId },
    include: { round: { select: { eventId: true, name: true, status: true } } },
  });
  if (!existing) return res.status(404).json({ error: 'Adjustment not found' });
  if (existing.round.status === 'CLOSED') return res.status(409).json({ error: `${existing.round.name} is closed; reopen it before changing adjustments` });
  await prisma.adjustment.delete({ where: { id: adjustmentId } });
  await audit(existing.round.eventId, req.user!.name, 'adjustment.remove', { roundId: existing.roundId, adjustmentId });
  publish(existing.round.eventId, { type: 'round', roundId: existing.roundId });
  res.status(204).end();
});
