import { Router } from 'express';
import { z } from 'zod';
import { pictureUrls } from '../lib/images';
import { prisma } from '../lib/prisma';
import { shares, tabulateRound } from '../lib/tabulate';
import { requireRole } from '../middleware/auth';
import { rankTitle } from '../scoring';

// Reports read what judges submitted and what closing a round saved. Nothing here changes data.
export const reportsRouter = Router();
const admin = requireRole('admin');
const id = z.coerce.number().int().positive();
const groupQuery = z.object({ groupValueId: z.coerce.number().int().positive().optional() });

const candidateSelect = {
  id: true,
  number: true,
  name: true,
  picturePath: true,
  groupValues: { select: { groupValue: { select: { id: true, name: true, groupId: true } } } },
} as const;

type CandidateRow = { id: number; number: number; name: string; picturePath: string | null; groupValues: { groupValue: { id: number; name: string; groupId: number } }[] };

function candidateDto(c: CandidateRow) {
  return { id: c.id, number: c.number, name: c.name, thumbUrl: pictureUrls(c.picturePath).thumbUrl, groups: c.groupValues.map((g) => g.groupValue) };
}

/** Competition positions (1, 1, 3) from a sorted list and a "same as the one before" test. */
function positions<T>(rows: T[], same: (a: T, b: T) => boolean): number[] {
  const out: number[] = [];
  rows.forEach((r, i) => out.push(i > 0 && same(rows[i - 1], r) ? out[i - 1] : i + 1));
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Overall placing: how far each candidate got, then their rank in that round. The final round's top places get titles.
reportsRouter.get('/events/:eventId/reports/overall', admin, async (req, res) => {
  const eventId = id.parse(req.params.eventId);
  const { groupValueId } = groupQuery.parse(req.query);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { id: true, name: true, date: true, venue: true, testingMode: true } });
  const rounds = await prisma.round.findMany({ where: { eventId }, orderBy: { order: 'asc' }, select: { id: true, name: true, order: true, status: true, kind: true, advanceCount: true } });
  const finalRound = rounds.at(-1) ?? null;
  const candidates = await prisma.candidate.findMany({
    where: { eventId, ...(groupValueId ? { groupValues: { some: { groupValueId } } } : {}) },
    select: { ...candidateSelect, roundEntries: { select: { roundId: true, rank: true, score: true, advanced: true } } },
  });

  const order = new Map(rounds.map((r) => [r.id, r]));
  const rows = candidates
    .map((c) => {
      // The furthest round the candidate entered, and their result there (null while that round is still open).
      const entered = c.roundEntries.map((e) => ({ ...e, round: order.get(e.roundId)! })).sort((a, b) => b.round.order - a.round.order);
      const furthest = entered[0];
      // While the furthest round is open, the last closed round orders its candidates (shown as provisional).
      const lastClosed = entered.find((e) => e.round.status === 'CLOSED');
      return {
        candidate: candidateDto(c),
        reached: furthest ? { id: furthest.round.id, name: furthest.round.name, order: furthest.round.order, kind: furthest.round.kind, closed: furthest.round.status === 'CLOSED' } : null,
        roundRank: furthest?.rank ?? null,
        score: furthest?.score === null || furthest?.score === undefined ? null : Number(furthest.score),
        lastClosedRank: lastClosed?.rank ?? null,
      };
    })
    .sort(
      (a, b) =>
        (b.reached?.order ?? 0) - (a.reached?.order ?? 0) ||
        (a.roundRank ?? Number.MAX_SAFE_INTEGER) - (b.roundRank ?? Number.MAX_SAFE_INTEGER) ||
        (a.lastClosedRank ?? Number.MAX_SAFE_INTEGER) - (b.lastClosedRank ?? Number.MAX_SAFE_INTEGER) ||
        a.candidate.number - b.candidate.number,
    );

  const pos = positions(
    rows,
    (a, b) => a.reached?.order === b.reached?.order && a.roundRank === b.roundRank && (a.roundRank !== null || (a.lastClosedRank !== null && a.lastClosedRank === b.lastClosedRank)),
  );
  const finalClosed = finalRound?.status === 'CLOSED';
  res.json({
    event,
    finalRound: finalRound ? { id: finalRound.id, name: finalRound.name, closed: finalClosed } : null,
    rows: rows.map((r, i) => ({ ...r, position: pos[i], title: finalClosed && pos[i] <= 4 ? rankTitle(pos[i]) : null })),
  });
});

// One round: each candidate's score per category (average of the judges, out of 100), the round score and rank.
reportsRouter.get('/rounds/:id/report', admin, async (req, res) => {
  const roundId = id.parse(req.params.id);
  const { groupValueId } = groupQuery.parse(req.query);
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      event: { select: { id: true, name: true, testingMode: true } },
      categories: { orderBy: { order: 'asc' }, include: { criteria: { orderBy: { order: 'asc' } } } },
      entries: { include: { candidate: { select: candidateSelect } } },
    },
  });
  const tab = await tabulateRound(roundId);
  const live = new Map(tab.standings.map((s) => [s.candidateId, s]));
  const inGroup = (c: CandidateRow) => !groupValueId || c.groupValues.some((g) => g.groupValue.id === groupValueId);

  const criterionIds = round.categories.flatMap((c) => c.criteria.map((cr) => cr.id));
  const scores = await prisma.score.findMany({
    where: { criterionId: { in: criterionIds }, status: 'SUBMITTED', ...(round.event.testingMode ? {} : { isTest: false }) },
    select: { judgeId: true, candidateId: true, criterionId: true, points: true },
  });

  const categoryAverage = (candidateId: number, categoryId: number): number | null => {
    const cat = round.categories.find((c) => c.id === categoryId)!;
    const crShares = shares(cat.criteria);
    const byJudge = new Map<number, number>();
    for (const s of scores) {
      const i = cat.criteria.findIndex((cr) => cr.id === s.criterionId);
      if (s.candidateId !== candidateId || i < 0) continue;
      byJudge.set(s.judgeId, (byJudge.get(s.judgeId) ?? 0) + (Number(s.points) / Number(cat.criteria[i].maxPoints)) * crShares[i]);
    }
    if (byJudge.size === 0) return null;
    return r2([...byJudge.values()].reduce((a, b) => a + b, 0) / byJudge.size);
  };

  const rows = round.entries
    .filter((e) => inGroup(e.candidate))
    .map((e) => {
      const closed = round.status === 'CLOSED';
      const standing = live.get(e.candidateId);
      const pair = tab.pairs.find((p) => p.a.id === e.candidateId || p.b.id === e.candidateId);
      return {
        candidate: candidateDto(e.candidate),
        categories: Object.fromEntries(round.categories.map((c) => [c.id, categoryAverage(e.candidateId, c.id)])),
        score: closed ? (e.score === null ? null : Number(e.score)) : (standing?.score ?? null),
        rank: closed ? e.rank : (standing?.rank ?? null),
        advanced: e.advanced,
        pair: pair
          ? {
              opponent: pair.a.id === e.candidateId ? pair.b : pair.a,
              votesFor: pair.a.id === e.candidateId ? pair.votesA : pair.votesB,
              votesAgainst: pair.a.id === e.candidateId ? pair.votesB : pair.votesA,
              won: pair.winnerId === e.candidateId,
            }
          : null,
      };
    })
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.candidate.number - b.candidate.number);

  // Within a group, positions are recounted from 1 so each group gets its own order.
  const groupPos = positions(rows, (a, b) => a.rank !== null && a.rank === b.rank);
  res.json({
    event: round.event,
    round: { id: round.id, name: round.name, kind: round.kind, status: round.status, scoreMethod: round.scoreMethod, advanceCount: round.advanceCount },
    categories: round.categories.map((c) => ({ id: c.id, name: c.name, weight: c.weight === null ? null : Number(c.weight) })),
    judgesSubmitted: tab.judges.filter((j) => j.done).length,
    judges: tab.judges.filter((j) => j.required > 0 || round.kind === 'PAIR_VOTE').length,
    rows: rows.map((r, i) => ({ ...r, position: groupValueId ? (r.rank === null ? null : groupPos[i]) : r.rank })),
  });
});

// One candidate across every round they entered: each judge's points per criterion, and their round results.
reportsRouter.get('/candidates/:id/report', admin, async (req, res) => {
  const candidateId = id.parse(req.params.id);
  const candidate = await prisma.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    select: { ...candidateSelect, eventId: true, event: { select: { id: true, name: true, testingMode: true } } },
  });
  const judges = await prisma.judge.findMany({ where: { eventId: candidate.eventId }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const entries = await prisma.roundEntry.findMany({
    where: { candidateId },
    include: { round: { include: { categories: { orderBy: { order: 'asc' }, include: { criteria: { orderBy: { order: 'asc' } } } } } } },
    orderBy: { round: { order: 'asc' } },
  });
  const scores = await prisma.score.findMany({
    where: { candidateId, status: 'SUBMITTED', ...(candidate.event.testingMode ? {} : { isTest: false }) },
    select: { judgeId: true, criterionId: true, points: true },
  });
  const votes = await prisma.pair.findMany({
    where: { OR: [{ candidateAId: candidateId }, { candidateBId: candidateId }] },
    include: {
      candidateA: { select: { id: true, number: true, name: true } },
      candidateB: { select: { id: true, number: true, name: true } },
      votes: { where: { status: 'SUBMITTED', ...(candidate.event.testingMode ? {} : { isTest: false }) }, select: { judgeId: true, winnerId: true } },
    },
  });

  res.json({
    event: candidate.event,
    candidate: candidateDto(candidate),
    judges,
    rounds: entries.map((e) => {
      const pair = votes.find((p) => p.roundId === e.roundId);
      return {
        id: e.round.id,
        name: e.round.name,
        kind: e.round.kind,
        status: e.round.status,
        rank: e.rank,
        score: e.score === null ? null : Number(e.score),
        advanced: e.advanced,
        categories: e.round.categories.map((c) => ({
          id: c.id,
          name: c.name,
          criteria: c.criteria.map((cr) => ({
            id: cr.id,
            name: cr.name,
            max: Number(cr.maxPoints),
            weight: cr.weight === null ? null : Number(cr.weight),
            points: Object.fromEntries(scores.filter((s) => s.criterionId === cr.id).map((s) => [s.judgeId, Number(s.points)])),
          })),
        })),
        pair: pair
          ? {
              opponent: pair.candidateAId === candidateId ? pair.candidateB : pair.candidateA,
              votes: Object.fromEntries(pair.votes.map((v) => [v.judgeId, v.winnerId === candidateId])),
            }
          : null,
      };
    }),
  });
});

// One judge in one round: every score they gave, as a check sheet the judge can sign.
reportsRouter.get('/rounds/:id/judges/:judgeId/report', admin, async (req, res) => {
  const roundId = id.parse(req.params.id);
  const judgeId = id.parse(req.params.judgeId);
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      event: { select: { id: true, name: true, testingMode: true } },
      categories: { orderBy: { order: 'asc' }, include: { criteria: { orderBy: { order: 'asc' } } } },
      entries: { include: { candidate: { select: candidateSelect } } },
      pairs: { orderBy: { order: 'asc' }, include: { votes: { where: { judgeId } } } },
    },
  });
  const judge = await prisma.judge.findUniqueOrThrow({ where: { id: judgeId }, select: { id: true, name: true } });
  const testFilter = round.event.testingMode ? {} : { isTest: false };
  const criteria = round.categories.flatMap((c) => c.criteria.map((cr) => ({ id: cr.id, name: cr.name, category: c.name, max: Number(cr.maxPoints) })));
  const scores = await prisma.score.findMany({
    where: { judgeId, criterionId: { in: criteria.map((c) => c.id) }, ...testFilter },
    select: { candidateId: true, criterionId: true, points: true, status: true, updatedAt: true },
  });

  const rows = round.entries
    .map((e) => {
      const mine = scores.filter((s) => s.candidateId === e.candidateId);
      const pair = round.pairs.find((p) => p.candidateAId === e.candidateId || p.candidateBId === e.candidateId);
      const vote = pair?.votes[0];
      // The judge's total out of 100, the same way tabulation computes it.
      let total: number | null = null;
      if (round.kind === 'SCORED' && mine.length === criteria.length && criteria.length > 0) {
        const catShares = shares(round.categories);
        total = r2(
          round.categories.reduce((sum, c, ci) => {
            const crShares = shares(c.criteria);
            const cat = c.criteria.reduce((s, cr, i) => s + (Number(mine.find((m) => m.criterionId === cr.id)!.points) / Number(cr.maxPoints)) * crShares[i], 0);
            return sum + (cat * catShares[ci]) / 100;
          }, 0),
        );
      }
      return {
        candidate: candidateDto(e.candidate),
        points: Object.fromEntries(mine.map((m) => [m.criterionId, Number(m.points)])),
        total,
        submitted: round.kind === 'PAIR_VOTE' ? vote?.status === 'SUBMITTED' : mine.length > 0 && mine.every((m) => m.status === 'SUBMITTED'),
        updatedAt: mine.length ? new Date(Math.max(...mine.map((m) => m.updatedAt.getTime()))).toISOString() : null,
        vote: pair ? (vote ? (vote.winnerId === e.candidateId ? 'won' : 'lost') : null) : undefined,
      };
    })
    .sort((a, b) => a.candidate.number - b.candidate.number);

  res.json({ event: round.event, round: { id: round.id, name: round.name, kind: round.kind, status: round.status }, judge, criteria, rows });
});
