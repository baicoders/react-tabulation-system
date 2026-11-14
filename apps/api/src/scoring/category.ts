import { assignRanks, averageScores, type CandidateScore, type JudgeTotal } from './index';

export interface CategoryCriterion {
  id: number;
  maxPoints: number;
  weight: number | null;
}

export interface CategoryScore {
  judgeId: number;
  candidateId: number;
  criterionId: number;
  points: number;
  status: 'DRAFT' | 'SUBMITTED';
}

/** Explicit cut percentages must be complete and add up to 100; all blank means equal shares. */
export function categoryWeightError(weights: (number | null)[]): string | null {
  if (weights.every((w) => w === null)) return null;
  if (weights.some((w) => w === null)) return 'Set a cut weight for every category, or leave all weights blank for equal shares.';
  const total = weights.reduce<number>((sum, w) => sum + (w ?? 0), 0);
  return Math.abs(total - 100) < 0.000001 ? null : `Category cut weights add up to ${total}%; they must total 100%.`;
}

/** Compute one category independently, using only complete submissions by assigned judges. */
export function categoryResults(input: {
  candidateIds: number[];
  activeCandidateIds: number[];
  judgeIds: number[];
  criteria: CategoryCriterion[];
  scores: CategoryScore[];
  dropExtremes?: boolean;
}) {
  const { candidateIds, judgeIds, criteria } = input;
  const candidateSet = new Set(candidateIds);
  const judgeSet = new Set(judgeIds);
  const criterionSet = new Set(criteria.map((c) => c.id));
  const byKey = new Map<string, number>();
  for (const s of input.scores) {
    if (s.status === 'SUBMITTED' && candidateSet.has(s.candidateId) && judgeSet.has(s.judgeId) && criterionSet.has(s.criterionId)) {
      byKey.set(`${s.judgeId}:${s.candidateId}:${s.criterionId}`, s.points);
    }
  }
  const submittedJudgeIds = judgeIds.filter((judgeId) => candidateIds.length > 0 && criteria.length > 0 &&
    candidateIds.every((candidateId) => criteria.every((c) => byKey.has(`${judgeId}:${candidateId}:${c.id}`))));
  const equalWeights = criteria.every((c) => c.weight === null);
  const totals: JudgeTotal[] = [];
  for (const judgeId of submittedJudgeIds) {
    for (const candidateId of candidateIds) {
      const total = criteria.reduce((sum, c) => {
        const share = equalWeights ? 100 / criteria.length : (c.weight ?? 0);
        return sum + (byKey.get(`${judgeId}:${candidateId}:${c.id}`)! / c.maxPoints) * share;
      }, 0);
      totals.push({ judgeId, candidateId, total });
    }
  }
  const averages = averageScores(totals, { dropExtremes: input.dropExtremes });
  const active = new Set(input.activeCandidateIds);
  return {
    submittedJudgeIds,
    complete: judgeIds.length > 0 && submittedJudgeIds.length === judgeIds.length,
    scores: averages,
    ranking: assignRanks(averages.filter((s) => active.has(s.candidateId)), 'desc'),
  };
}

/** Combine category averages, not judge totals; every weighted category must have a result. */
export function combineCategoryAverages(candidateIds: number[], categories: { weight: number; scores: CandidateScore[] }[]): CandidateScore[] {
  const weighted = categories.filter((c) => c.weight > 0).map((c) => ({ ...c, byCandidate: new Map(c.scores.map((s) => [s.candidateId, s.score])) }));
  const totalWeight = weighted.reduce((sum, c) => sum + c.weight, 0);
  return candidateIds.flatMap((candidateId) =>
    totalWeight > 0 && weighted.every((c) => c.byCandidate.has(candidateId))
      ? [{ candidateId, score: weighted.reduce((sum, c) => sum + c.byCandidate.get(candidateId)! * c.weight, 0) / totalWeight }]
      : [],
  );
}
