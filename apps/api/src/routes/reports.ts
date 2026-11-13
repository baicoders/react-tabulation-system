import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { pictureUrls } from '../lib/images';
import { prisma } from '../lib/prisma';
import { shares, tabulateRound } from '../lib/tabulate';
import { requireRole } from '../middleware/auth';
import { rankTitle } from '../scoring';
import { categoryResults } from '../scoring/category';

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
  withdrawn: true,
  groupValues: { select: { groupValue: { select: { id: true, name: true, groupId: true } } } },
} as const;

type CandidateRow = { id: number; number: number; name: string; picturePath: string | null; withdrawn: boolean; groupValues: { groupValue: { id: number; name: string; groupId: number } }[] };

function candidateDto(c: CandidateRow) {
  return { id: c.id, number: c.number, name: c.name, withdrawn: c.withdrawn, thumbUrl: pictureUrls(c.picturePath).thumbUrl, groups: c.groupValues.map((g) => g.groupValue) };
}

/** Competition positions (1, 1, 3) from a sorted list and a "same as the one before" test. */
function positions<T>(rows: T[], same: (a: T, b: T) => boolean): number[] {
  const out: number[] = [];
  rows.forEach((r, i) => out.push(i > 0 && same(rows[i - 1], r) ? out[i - 1] : i + 1));
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Category scores and ranks are independent of the round's combined cut result.
reportsRouter.get('/categories/:id/report', admin, async (req, res) => {
  const { groupValueId } = groupQuery.parse(req.query);
  const category = await prisma.category.findUniqueOrThrow({
    where: { id: id.parse(req.params.id) },
    include: {
      criteria: { orderBy: { order: 'asc' } },
      judges: { select: { judgeId: true } },
      round: { include: { event: { select: { testingMode: true } }, entries: { include: { candidate: { select: candidateSelect } } } } },
    },
  });
  const entries = category.round.entries;
  const eventJudges = await prisma.judge.findMany({ where: { eventId: category.round.eventId }, orderBy: { id: 'asc' }, select: { name: true } });
  const candidateIds = entries.filter((entry) => !entry.withdrawn).map((entry) => entry.candidateId);
  const judgeIds = category.judges.map((judge) => judge.judgeId);
  const scores = await prisma.score.findMany({
    where: { criterionId: { in: category.criteria.map((c) => c.id) }, candidateId: { in: candidateIds }, judgeId: { in: judgeIds },
      ...(category.round.event.testingMode ? {} : { isTest: false }) },
    select: { judgeId: true, candidateId: true, criterionId: true, points: true, status: true },
  });
  const visible = entries.filter((entry) => !groupValueId || entry.candidate.groupValues.some((group) => group.groupValue.id === groupValueId));
  const result = categoryResults({
    candidateIds,
    activeCandidateIds: visible.filter((entry) => !entry.withdrawn).map((entry) => entry.candidateId),
    judgeIds,
    criteria: category.criteria.map((c) => ({ id: c.id, maxPoints: Number(c.maxPoints), weight: c.weight === null ? null : Number(c.weight) })),
    scores: scores.map((score) => ({ ...score, points: Number(score.points) })),
    dropExtremes: category.round.dropExtremes,
  });
  const ranks = new Map(result.ranking.map((row) => [row.candidateId, row.rank]));
  const averages = new Map(result.scores.map((row) => [row.candidateId, row.score]));
  const submitted = new Set(result.submittedJudgeIds);
  const rawTotals = new Map<number, number>();
  for (const score of scores) {
    if (score.status === 'SUBMITTED' && submitted.has(score.judgeId)) {
      rawTotals.set(score.candidateId, (rawTotals.get(score.candidateId) ?? 0) + Number(score.points));
    }
  }
  const rawMaximum = category.criteria.reduce((sum, c) => sum + Number(c.maxPoints), 0) * judgeIds.length;
  res.json({
    category: { id: category.id, name: category.name },
    round: { id: category.round.id, name: category.round.name, status: category.round.status },
    groupValueId: groupValueId ?? null,
    judges: judgeIds.length,
    judgeNames: eventJudges.map((judge) => judge.name),
    totalJudges: eventJudges.length,
    judgesSubmitted: result.submittedJudgeIds.length,
    complete: result.complete,
    rawMayDiffer: category.round.dropExtremes || category.criteria.some((c) => c.weight !== null) || new Set(category.criteria.map((c) => String(c.maxPoints))).size > 1,
    rows: visible.map((entry) => ({ candidate: candidateDto(entry.candidate), withdrawn: entry.withdrawn, score: averages.get(entry.candidateId) ?? null, rawTotal: rawTotals.get(entry.candidateId) ?? null, rawPercentage: rawTotals.has(entry.candidateId) && rawMaximum > 0 ? rawTotals.get(entry.candidateId)! / rawMaximum * 100 : null, rank: ranks.get(entry.candidateId) ?? null }))
      .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.candidate.number - b.candidate.number),
  });
});

// An ad-hoc raw-points report, independent from advancement and normalized stage scores.
reportsRouter.get('/events/:eventId/reports/combined-categories', admin, async (req, res) => {
  const eventId = id.parse(req.params.eventId);
  const query = z.object({ categoryIds: z.string().min(1), weights: z.string().optional(), groupValueId: z.coerce.number().int().positive().optional() }).parse(req.query);
  const ids = query.categoryIds.split(',').map(Number);
  const weightStrings = query.weights ? query.weights.split(',') : ids.map(() => '1');
  const weights = weightStrings.map(Number);
  if (ids.length > 50 || ids.some((n) => !Number.isSafeInteger(n) || n <= 0) || new Set(ids).size !== ids.length || weights.length !== ids.length || weights.some((n, i) => !/^\d+(\.\d{1,4})?$/.test(weightStrings[i]) || !Number.isFinite(n) || n <= 0 || n > 10000)) {
    return res.status(400).json({ error: 'Choose distinct categories and a positive multiplier for each.' });
  }
  const categories = await prisma.category.findMany({
    where: { id: { in: ids }, round: { eventId } },
    include: { criteria: true, judges: true, round: { include: { event: { select: { testingMode: true } }, entries: { include: { candidate: { select: candidateSelect } } } } } },
  });
  if (categories.length !== ids.length) return res.status(400).json({ error: 'A selected category is not in this event.' });
  if (categories.some((c) => c.round.kind !== 'SCORED')) return res.status(400).json({ error: 'Votes and scores are different units — no conversion rule exists.' });
  if (categories.some((c) => c.round.status !== 'CLOSED')) return res.status(409).json({ error: 'Close every selected category’s stage before combining results.' });
  if (categories.some((c) => c.criteria.length === 0 || c.judges.length === 0)) return res.status(409).json({ error: 'Every selected category needs criteria and assigned judges.' });
  const ordered = ids.map((categoryId) => categories.find((c) => c.id === categoryId)!);
  const scores = await prisma.score.findMany({
    where: { criterionId: { in: ordered.flatMap((c) => c.criteria.map((cr) => cr.id)) }, status: 'SUBMITTED', ...(ordered[0].round.event.testingMode ? {} : { isTest: false }) },
    select: { candidateId: true, judgeId: true, criterionId: true, points: true },
  });
  const cells = new Map(scores.map((s) => [`${s.candidateId}:${s.judgeId}:${s.criterionId}`, s.points]));
  const candidates = new Map<number, CandidateRow>();
  for (const c of ordered) for (const entry of c.round.entries) candidates.set(entry.candidateId, entry.candidate);
  const maximum = ordered.reduce((sum, c, i) => sum.plus(c.criteria.reduce((s, cr) => s.plus(cr.maxPoints), new Prisma.Decimal(0)).times(c.judges.length).times(weightStrings[i])), new Prisma.Decimal(0));
  const rows = [...candidates.values()].filter((c) => !query.groupValueId || c.groupValues.some((g) => g.groupValue.id === query.groupValueId)).map((candidate) => {
    const values = ordered.map((c) => {
      if (!c.round.entries.some((entry) => entry.candidateId === candidate.id)) return null;
      const points = c.judges.flatMap((j) => c.criteria.map((cr) => cells.get(`${candidate.id}:${j.judgeId}:${cr.id}`)));
      return points.some((p) => p === undefined) ? null : points.reduce<Prisma.Decimal>((sum, p) => sum.plus(p!), new Prisma.Decimal(0));
    });
    const total = values.some((value) => value === null) ? null : values.reduce<Prisma.Decimal>((sum, value, i) => sum.plus(value!.times(weightStrings[i])), new Prisma.Decimal(0));
    return { candidate: candidateDto(candidate), values, total };
  });
  const ranked = rows.filter((r) => r.total !== null).sort((a, b) => b.total!.comparedTo(a.total!) || a.candidate.number - b.candidate.number);
  const rankById = new Map<number, number>();
  ranked.forEach((r, i) => rankById.set(r.candidate.id, i > 0 && r.total!.equals(ranked[i - 1].total!) ? rankById.get(ranked[i - 1].candidate.id)! : i + 1));
  res.json({ categories: ordered.map((c, i) => ({ id: c.id, name: c.name, roundName: c.round.name, weight: weights[i] })), rows: [...ranked, ...rows.filter((r) => r.total === null).sort((a, b) => a.candidate.number - b.candidate.number)].map((r) => ({ candidate: r.candidate, values: r.values.map((v) => v === null ? null : Number(v)), total: r.total === null ? null : Number(r.total), percentage: r.total === null || maximum.isZero() ? null : Number(r.total.dividedBy(maximum).times(100)), rank: rankById.get(r.candidate.id) ?? null })) });
});

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

  // Pair outcomes do not establish places across different pairs.
  const rankedRows = rows.filter((row) => !row.candidate.withdrawn && row.reached?.kind !== 'PAIR_VOTE' && (row.roundRank !== null || row.lastClosedRank !== null));
  const pos = positions(
    rankedRows,
    (a, b) => a.reached?.order === b.reached?.order && a.roundRank === b.roundRank && (a.roundRank !== null || (a.lastClosedRank !== null && a.lastClosedRank === b.lastClosedRank)),
  );
  const positionsByCandidate = new Map(rankedRows.map((row, index) => [row.candidate.id, pos[index]]));
  const finalClosed = finalRound?.status === 'CLOSED';
  res.json({
    event,
    finalRound: finalRound ? { id: finalRound.id, name: finalRound.name, closed: finalClosed } : null,
    rows: rows.map((r) => {
      const position = positionsByCandidate.get(r.candidate.id) ?? null;
      return { ...r, position, title: finalClosed && position !== null && position <= 4 ? rankTitle(position) : null };
    }),
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
      categories: { orderBy: { order: 'asc' }, include: { criteria: { orderBy: { order: 'asc' } }, judges: true } },
      entries: { include: { candidate: { select: candidateSelect } } },
    },
  });
  const tab = await tabulateRound(roundId);
  const live = new Map(tab.standings.map((s) => [s.candidateId, s]));
  const inGroup = (c: CandidateRow) => !groupValueId || c.groupValues.some((g) => g.groupValue.id === groupValueId);

  const criterionIds = round.categories.flatMap((c) => c.criteria.map((cr) => cr.id));
  const scores = await prisma.score.findMany({
    where: { criterionId: { in: criterionIds }, status: 'SUBMITTED', ...(round.event.testingMode ? {} : { isTest: false }) },
    select: { judgeId: true, candidateId: true, criterionId: true, points: true, status: true },
  });

  const categoryAverages = new Map(round.categories.map((cat) => {
    const result = categoryResults({
      candidateIds: round.entries.filter((entry) => !entry.withdrawn).map((entry) => entry.candidateId),
      activeCandidateIds: round.entries.filter((entry) => !entry.withdrawn).map((entry) => entry.candidateId),
      judgeIds: cat.judges.map((judge) => judge.judgeId),
      criteria: cat.criteria.map((c) => ({ id: c.id, maxPoints: Number(c.maxPoints), weight: c.weight === null ? null : Number(c.weight) })),
      scores: scores.map((score) => ({ ...score, points: Number(score.points) })),
      dropExtremes: round.dropExtremes,
    });
    return [cat.id, new Map(result.scores.map((score) => [score.candidateId, score.score]))] as const;
  }));

  const rows = round.entries
    .filter((e) => inGroup(e.candidate))
    .map((e) => {
      const closed = round.status === 'CLOSED';
      const standing = live.get(e.candidateId);
      const pair = tab.pairs.find((p) => p.a.id === e.candidateId || p.b.id === e.candidateId);
      return {
        candidate: candidateDto(e.candidate),
        withdrawn: e.withdrawn,
        categories: Object.fromEntries(round.categories.map((c) => [c.id, categoryAverages.get(c.id)?.get(e.candidateId) ?? null])),
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
    round: { id: round.id, name: round.name, kind: round.kind, status: round.status, advanceCount: round.advanceCount },
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
