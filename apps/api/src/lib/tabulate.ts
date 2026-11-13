import { prisma } from './prisma';
import { pictureUrls } from './images';
import { tabulatePairRound, type PairTally } from './tabulate-pairs';
import { combineCutBasis, loadAdjustments, loadBasis, type AdjustmentRow, type BasisSource } from './cut';
import { categoryResults, combineCategoryAverages } from '../scoring/category';
import {
  applyAdjustments,
  applyCarryOver,
  assignRanks,
  measurementDirection,
  rankSum,
  topN,
  type CandidateScore,
  type JudgeTotal,
  type RankedCandidate,
} from '../scoring';

export interface JudgeProgress {
  id: number;
  name: string;
  categoryIds: number[];
  /** Scores this judge must give in the round: entries x criteria of their categories. */
  required: number;
  /** Scores given so far, draft or submitted. */
  scored: number;
  /** Categories this judge has submitted (every score in them locked). */
  submittedCategoryIds: number[];
  categories?: { id: number; name: string; required: number; scored: number; submitted: boolean }[];
  done: boolean;
}

export interface StandingRow {
  candidateId: number;
  number: number;
  name: string;
  thumbUrl: string | null;
  score: number | null;
  rank: number | null;
  /** A withdrawn candidate stays on the sheet, out of the ranks and the cut. */
  withdrawn?: boolean;
}

/** The cut's combined ranking when a round's cut is based on more rounds than itself. */
export interface CutBasis {
  sources: BasisSource[];
  names: string[];
  standings: StandingRow[];
}

/** Share of a criterion inside its category, in percent: its weight, or an equal split when no weights are set. */
export function shares<T extends { weight: unknown }>(items: T[]): number[] {
  const weights = items.map((i) => (i.weight === null ? null : Number(i.weight)));
  if (weights.every((w) => w === null)) return items.map(() => 100 / Math.max(1, items.length));
  return weights.map((w) => w ?? 0);
}

/**
 * Everything about a round's tabulation: who still has to score, and the standings from submitted scores.
 * A judge's total for a candidate is out of 100: each criterion's points divided by its max, times its share of the
 * category, then the categories the judge scored weighted the same way.
 */
export async function tabulateRound(roundId: number) {
  const { kind } = await prisma.round.findUniqueOrThrow({ where: { id: roundId }, select: { kind: true } });
  if (kind === 'PAIR_VOTE') return tabulatePairRound(roundId);
  return tabulateScoredRound(roundId);
}

async function tabulateScoredRound(roundId: number) {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      event: { select: { id: true, testingMode: true } },
      categories: { orderBy: { order: 'asc' }, include: { criteria: { orderBy: { order: 'asc' } }, judges: true } },
      entries: { include: { candidate: { select: { id: true, number: true, name: true, picturePath: true, status: true } } } },
    },
  });

  const entryIds = round.entries.map((e) => e.candidateId);
  const activeIds = new Set(round.entries.filter((e) => e.candidate.status === 'ACTIVE').map((e) => e.candidateId));
  const criteria = round.categories.flatMap((c) => c.criteria);
  const testFilter = round.event.testingMode ? {} : { isTest: false };

  const scores = await prisma.score.findMany({
    where: { criterionId: { in: criteria.map((c) => c.id) }, candidateId: { in: entryIds }, ...testFilter },
    select: { judgeId: true, candidateId: true, criterionId: true, points: true, status: true },
  });

  const judges = await prisma.judge.findMany({
    where: { eventId: round.eventId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, categories: { select: { categoryId: true } } },
  });

  const progress: JudgeProgress[] = judges.map((j) => {
    const categoryIds = j.categories.map((c) => c.categoryId).filter((id) => round.categories.some((c) => c.id === id));
    const myCriteria = round.categories.filter((c) => categoryIds.includes(c.id)).flatMap((c) => c.criteria.map((cr) => cr.id));
    const mine = scores.filter((s) => s.judgeId === j.id && myCriteria.includes(s.criterionId));
    const submittedCategoryIds = categoryIds.filter((cid) => {
      const cat = round.categories.find((c) => c.id === cid)!;
      const need = cat.criteria.length * entryIds.length;
      const done = mine.filter((s) => s.status === 'SUBMITTED' && cat.criteria.some((cr) => cr.id === s.criterionId)).length;
      return need > 0 && done >= need;
    });
    const required = myCriteria.length * entryIds.length;
    const categories = round.categories.filter((c) => categoryIds.includes(c.id)).map((cat) => {
      const ids = new Set(cat.criteria.map((c) => c.id));
      return { id: cat.id, name: cat.name, required: cat.criteria.length * entryIds.length,
        scored: mine.filter((s) => ids.has(s.criterionId)).length, submitted: submittedCategoryIds.includes(cat.id) };
    });
    return {
      id: j.id,
      name: j.name,
      categoryIds,
      required,
      scored: mine.length,
      submittedCategoryIds,
      categories,
      done: required > 0 && submittedCategoryIds.length === categoryIds.length,
    };
  });
  const scoring = progress.filter((p) => p.required > 0);
  const complete = round.kind === 'SCORED' && scoring.length > 0 && scoring.every((p) => p.done) &&
    round.categories.length > 0 && round.categories.every((cat) => cat.criteria.length > 0 && cat.judges.length > 0);

  // Judge totals from submitted scores only.
  const submitted = scores.filter((s) => s.status === 'SUBMITTED');
  const totals: JudgeTotal[] = [];
  const catShares = shares(round.categories);
  for (const judge of scoring) {
    for (const candidateId of entryIds) {
      let total = 0;
      let weightUsed = 0;
      round.categories.forEach((cat, ci) => {
        if (!judge.submittedCategoryIds.includes(cat.id)) return;
        const crShares = shares(cat.criteria);
        let catScore = 0;
        cat.criteria.forEach((cr, i) => {
          const s = submitted.find((x) => x.judgeId === judge.id && x.candidateId === candidateId && x.criterionId === cr.id);
          if (s) catScore += (Number(s.points) / Number(cr.maxPoints)) * crShares[i];
        });
        total += catScore * catShares[ci];
        weightUsed += catShares[ci];
      });
      if (weightUsed > 0) totals.push({ judgeId: judge.id, candidateId, total: total / weightUsed });
    }
  }

  const direction = round.scoreMethod === 'RANK_SUM' ? 'asc' : 'desc';
  // Average each category independently before combining it for the cut. Combining per-judge
  // totals first would give categories with more assigned judges an unintended larger share.
  const categoryAverages = round.categories.map((cat) => categoryResults({
    candidateIds: entryIds,
    activeCandidateIds: [...activeIds],
    judgeIds: cat.judges.map((j) => j.judgeId),
    criteria: cat.criteria.map((cr) => ({ id: cr.id, maxPoints: Number(cr.maxPoints), weight: cr.weight === null ? null : Number(cr.weight) })),
    scores: scores.map((s) => ({ ...s, points: Number(s.points) })),
    dropExtremes: round.dropExtremes,
  }));
  const categoryCombined = combineCategoryAverages(entryIds, categoryAverages.map((c, i) => ({ weight: catShares[i], scores: c.scores })));
  let results: CandidateScore[] = round.scoreMethod === 'RANK_SUM' ? rankSum(totals) : categoryCombined;

  if (round.scoreMethod === 'AVERAGE') {
    if (round.carryOverWeight !== null) {
      const previous = await prisma.round.findFirst({
        where: { eventId: round.eventId, order: { lt: round.order }, status: 'CLOSED', kind: 'SCORED' },
        orderBy: { order: 'desc' },
        include: { entries: { where: { candidateId: { in: entryIds } }, select: { candidateId: true, score: true } } },
      });
      if (previous) {
        const earlier = previous.entries.filter((e) => e.score !== null).map((e) => ({ candidateId: e.candidateId, score: Number(e.score) }));
        results = applyCarryOver(results, earlier, Number(round.carryOverWeight));
      }
    }
  }

  const adjustments = await loadAdjustments(round.id);
  results = applyAdjustments(
    results,
    adjustments.map((a) => ({ candidateId: a.candidateId, points: a.points })),
  );

  // Withdrawn candidates keep their scores on the sheet but out of the ranks and the cut.
  const ranked = assignRanks(results.filter((r) => activeIds.has(r.candidateId)), direction);
  const byId = new Map(round.entries.map((e) => [e.candidateId, e.candidate]));
  const toRow = (candidateId: number, score: number | null, rank: number | null, withdrawn = false): StandingRow => {
    const c = byId.get(candidateId)!;
    return {
      candidateId,
      number: c.number,
      name: c.name,
      thumbUrl: pictureUrls(c.picturePath).thumbUrl,
      // Keep the calculated value for persistence and later calculations; clients format for display.
      score,
      rank,
      ...(withdrawn ? { withdrawn: true } : {}),
    };
  };
  const scoreById = new Map(results.map((r) => [r.candidateId, r.score]));
  const standings: StandingRow[] = [
    ...ranked.map((r) => toRow(r.candidateId, r.score, r.rank)),
    ...round.entries.filter((e) => !activeIds.has(e.candidateId)).map((e) => toRow(e.candidateId, scoreById.get(e.candidateId) ?? null, null, true)),
  ];

  // The cut: this round alone, or the combined basis the rules call for ("Basis of Top 5 = Gown and Deba Teh").
  const basis = await combineCutBasis(await loadBasis(round.id), results, round.id);
  let cutRanked: RankedCandidate[] = ranked;
  let cutStandings: StandingRow[] | null = null;
  if (basis) {
    cutRanked = assignRanks(basis.combined.filter((r) => activeIds.has(r.candidateId)), measurementDirection(basis.sources[0].measurement));
    cutStandings = cutRanked.map((r) => toRow(r.candidateId, r.score, r.rank));
  }
  const cut = round.advanceCount ? topN(cutRanked, round.advanceCount) : { advancing: cutRanked, tieAtCutLine: [] };

  return {
    round: { id: round.id, name: round.name, order: round.order, status: round.status, kind: round.kind, scoreMethod: round.scoreMethod, advanceCount: round.advanceCount },
    entries: entryIds.length,
    judges: progress,
    complete,
    standings,
    direction,
    advancingIds: cut.advancing.map((r) => r.candidateId),
    tieAtCutLine: cut.tieAtCutLine.map((r) => r.candidateId),
    basis: basis && cutStandings ? ({ sources: basis.sources, names: basis.sources.map((s) => s.name), standings: cutStandings } as CutBasis) : (null as CutBasis | null),
    adjustments,
    pairs: [] as PairTally[],
    pairTies: [] as number[],
    unpaired: 0,
  };
}
