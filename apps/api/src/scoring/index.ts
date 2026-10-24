// Pure scoring engine. No database access here so every rule is easy to unit test.

/** One judge's total points for one candidate in a round (criteria already summed and weighted). */
export interface JudgeTotal {
  judgeId: number;
  candidateId: number;
  total: number;
}

export interface CandidateScore {
  candidateId: number;
  score: number;
}

export interface RankedCandidate extends CandidateScore {
  rank: number;
}

/** "desc" when a higher score is better (averages), "asc" when lower is better (rank-sum). */
export type Direction = 'desc' | 'asc';

function groupBy<T>(items: T[], key: (item: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/**
 * Average of judges' totals per candidate. With dropExtremes, the highest and lowest
 * judge total are removed first (only when a candidate has 5 or more judge totals).
 */
export function averageScores(totals: JudgeTotal[], options: { dropExtremes?: boolean } = {}): CandidateScore[] {
  const byCandidate = groupBy(totals, (t) => t.candidateId);
  const results: CandidateScore[] = [];
  for (const [candidateId, rows] of byCandidate) {
    let values = rows.map((r) => r.total).sort((a, b) => a - b);
    if (options.dropExtremes && values.length >= 5) values = values.slice(1, -1);
    const sum = values.reduce((acc, v) => acc + v, 0);
    results.push({ candidateId, score: sum / values.length });
  }
  return results;
}

/**
 * Rank-sum: each judge's totals become ranks (1 = best, ties share the average rank),
 * then ranks are summed per candidate. Lower is better.
 */
export function rankSum(totals: JudgeTotal[]): CandidateScore[] {
  const sums = new Map<number, number>();
  for (const rows of groupBy(totals, (t) => t.judgeId).values()) {
    const sorted = [...rows].sort((a, b) => b.total - a.total);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].total === sorted[i].total) j++;
      const sharedRank = (i + 1 + (j + 1)) / 2;
      for (let k = i; k <= j; k++) {
        const id = sorted[k].candidateId;
        sums.set(id, (sums.get(id) ?? 0) + sharedRank);
      }
      i = j + 1;
    }
  }
  return [...sums].map(([candidateId, score]) => ({ candidateId, score }));
}

/** final = weight * earlier + (1 - weight) * current. Candidates missing an earlier score keep the current one. */
export function applyCarryOver(current: CandidateScore[], earlier: CandidateScore[], weight: number): CandidateScore[] {
  if (weight < 0 || weight > 1) throw new RangeError('carry-over weight must be between 0 and 1');
  const earlierById = new Map(earlier.map((e) => [e.candidateId, e.score]));
  return current.map(({ candidateId, score }) => {
    const prev = earlierById.get(candidateId);
    return { candidateId, score: prev === undefined ? score : weight * prev + (1 - weight) * score };
  });
}

/** Subtracts deduction points from point-based scores. Applied last, after tabulation. */
export function applyDeductions(scores: CandidateScore[], deductions: Map<number, number>): CandidateScore[] {
  return scores.map(({ candidateId, score }) => ({ candidateId, score: score - (deductions.get(candidateId) ?? 0) }));
}

/** Competition ranking: equal scores share a rank and the next rank is skipped (1, 1, 3). */
export function assignRanks(scores: CandidateScore[], direction: Direction): RankedCandidate[] {
  const sorted = [...scores].sort((a, b) => (direction === 'desc' ? b.score - a.score : a.score - b.score));
  const ranked: RankedCandidate[] = [];
  sorted.forEach((s, index) => {
    const prev = ranked[index - 1];
    const rank = prev && prev.score === s.score ? prev.rank : index + 1;
    ranked.push({ ...s, rank });
  });
  return ranked;
}

/** Top N cut. Reports a tie when candidates share the rank at the cut line, so the Admin can resolve it. */
export function topN(ranked: RankedCandidate[], n: number): { advancing: RankedCandidate[]; tieAtCutLine: RankedCandidate[] } {
  const advancing = ranked.filter((r) => r.rank <= n);
  if (advancing.length <= n) return { advancing, tieAtCutLine: [] };
  const cutRank = advancing[n - 1].rank;
  return { advancing, tieAtCutLine: advancing.filter((r) => r.rank === cutRank) };
}

const TITLES = ['Champion', '1st Runner-up', '2nd Runner-up', '3rd Runner-up'];

export function rankTitle(rank: number): string {
  return TITLES[rank - 1] ?? `Rank ${rank}`;
}
