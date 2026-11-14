import { prisma } from './prisma';
import { pictureUrls } from './images';
import { tabulatePairRound, type PairTally } from './tabulate-pairs';
import { categoryResults, categoryWeightError, combineCategoryAverages } from '../scoring/category';
import { SCORED_POINTS } from '../scoring/measurement';
import {
  applyCarryOver,
  assignRanks,
  topN,
  type CandidateScore,
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
  done: boolean;
}

export interface StandingRow {
  candidateId: number;
  number: number;
  name: string;
  thumbUrl: string | null;
  score: number;
  rank: number | null;
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
      entries: { include: { candidate: { select: { id: true, number: true, name: true, picturePath: true } } } },
    },
  });

  const entryIds = round.entries.map((e) => e.candidateId);
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
    return {
      id: j.id,
      name: j.name,
      categoryIds,
      required,
      scored: mine.length,
      submittedCategoryIds,
      done: required > 0 && submittedCategoryIds.length === categoryIds.length,
    };
  });
  const scoring = progress.filter((p) => p.required > 0);
  const configurationErrors: string[] = [];
  const weightError = categoryWeightError(round.categories.map((category) => category.weight === null ? null : Number(category.weight)));
  if (weightError) configurationErrors.push(weightError);
  if (round.categories.length === 0) configurationErrors.push('Add at least one category.');
  for (const category of round.categories) {
    if (category.criteria.length === 0) configurationErrors.push(`Add criteria for ${category.name}.`);
    if (category.judges.length === 0) configurationErrors.push(`Assign at least one judge to ${category.name}.`);
  }
  const complete = round.kind === 'SCORED' && scoring.length > 0 && scoring.every((p) => p.done) &&
    configurationErrors.length === 0;

  const catShares = shares(round.categories);
  const direction = 'desc' as const;
  const categoryAverages = round.categories.map((category) => categoryResults({
    candidateIds: entryIds,
    activeCandidateIds: entryIds,
    judgeIds: category.judges.map((judge) => judge.judgeId),
    criteria: category.criteria.map((criterion) => ({ id: criterion.id, maxPoints: Number(criterion.maxPoints), weight: criterion.weight === null ? null : Number(criterion.weight) })),
    scores: scores.map((score) => ({ ...score, points: Number(score.points) })),
    dropExtremes: round.dropExtremes,
  }));
  const categoryCombined = weightError ? [] : combineCategoryAverages(entryIds, categoryAverages.map((category, index) => ({ measurement: SCORED_POINTS, weight: catShares[index], scores: category.scores })));
  let results: CandidateScore[] = categoryCombined;

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

  const ranked = assignRanks(results, direction);
  const byId = new Map(round.entries.map((e) => [e.candidateId, e.candidate]));
  const standings: StandingRow[] = ranked.map((r) => {
    const c = byId.get(r.candidateId)!;
    return {
      candidateId: r.candidateId,
      number: c.number,
      name: c.name,
      thumbUrl: pictureUrls(c.picturePath).thumbUrl,
      score: r.score,
      rank: r.rank,
    };
  });
  const cut = round.advanceCount ? topN(ranked, round.advanceCount) : { advancing: ranked, tieAtCutLine: [] };

  return {
    round: { id: round.id, name: round.name, order: round.order, status: round.status, kind: round.kind, advanceCount: round.advanceCount },
    entries: entryIds.length,
    judges: progress,
    complete,
    configurationErrors,
    standings,
    direction,
    advancingIds: cut.advancing.map((r) => r.candidateId),
    tieAtCutLine: cut.tieAtCutLine.map((r) => r.candidateId),
    pairs: [] as PairTally[],
    pairTies: [] as number[],
    unpaired: 0,
  };
}
