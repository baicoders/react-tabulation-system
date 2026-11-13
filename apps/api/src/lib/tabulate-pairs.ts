import { prisma } from './prisma';
import { pictureUrls } from './images';
import { loadAdjustments, loadBasis } from './cut';
import { PairVoteRankingError } from '../scoring';
import type { CutBasis, JudgeProgress, StandingRow } from './tabulate';

export interface PairCandidate {
  id: number;
  number: number;
  name: string;
  thumbUrl: string | null;
}

export interface PairTally {
  id: number;
  order: number;
  a: PairCandidate;
  b: PairCandidate;
  /** Every vote cast so far, submitted or not: the live tally the tabulator watches. */
  castA: number;
  castB: number;
  /** Submitted votes only: these decide the winner. */
  votesA: number;
  votesB: number;
  winnerId: number | null;
  tied: boolean;
}

/**
 * A pair-vote round (for example Deba Teh): each judge picks one winner per pair.
 * A pair's winner has the most submitted votes. There is no ranking across different pairs.
 */
export async function tabulatePairRound(roundId: number) {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      event: { select: { testingMode: true } },
      entries: { include: { candidate: { select: { id: true, number: true, name: true, picturePath: true, status: true } } } },
      pairs: {
        orderBy: { order: 'asc' },
        include: {
          candidateA: { select: { id: true, number: true, name: true, picturePath: true } },
          candidateB: { select: { id: true, number: true, name: true, picturePath: true } },
          votes: true,
        },
      },
    },
  });

  const countsVote = (v: { isTest: boolean }) => round.event.testingMode || !v.isTest;
  const toCandidate = (c: { id: number; number: number; name: string; picturePath: string | null }): PairCandidate => ({
    id: c.id,
    number: c.number,
    name: c.name,
    thumbUrl: pictureUrls(c.picturePath).thumbUrl,
  });

  // Every judge in the event votes in a pair round. A pair is decided only once all of them have submitted.
  const judges = await prisma.judge.findMany({ where: { eventId: round.eventId }, orderBy: { name: 'asc' }, select: { id: true, name: true } });

  const pairs: PairTally[] = round.pairs.map((p) => {
    const votes = p.votes.filter(countsVote);
    const submitted = votes.filter((v) => v.status === 'SUBMITTED');
    const votesA = submitted.filter((v) => v.winnerId === p.candidateAId).length;
    const votesB = submitted.filter((v) => v.winnerId === p.candidateBId).length;
    const decided = judges.length > 0 && submitted.length >= judges.length;
    const tied = decided && votesA === votesB;
    return {
      id: p.id,
      order: p.order,
      a: toCandidate(p.candidateA),
      b: toCandidate(p.candidateB),
      castA: votes.filter((v) => v.winnerId === p.candidateAId).length,
      castB: votes.filter((v) => v.winnerId === p.candidateBId).length,
      votesA,
      votesB,
      winnerId: !decided || tied ? null : votesA > votesB ? p.candidateAId : p.candidateBId,
      tied,
    };
  });

  const allVotes = round.pairs.flatMap((p) => p.votes).filter(countsVote);
  const progress: JudgeProgress[] = judges.map((j) => {
    const mine = allVotes.filter((v) => v.judgeId === j.id);
    const submitted = mine.filter((v) => v.status === 'SUBMITTED').length;
    const required = pairs.length;
    return { id: j.id, name: j.name, categoryIds: [], required, scored: mine.length, submittedCategoryIds: [], done: required > 0 && submitted >= required };
  });
  const complete = pairs.length > 0 && progress.length > 0 && progress.every((p) => p.done);

  const paired = new Set(pairs.flatMap((p) => [p.a.id, p.b.id]));
  // Adjustments are points added to or taken off the votes a candidate earned (guideline penalties).
  const adjustments = await loadAdjustments(round.id);
  const adjustById = new Map<number, number>();
  for (const a of adjustments) adjustById.set(a.candidateId, (adjustById.get(a.candidateId) ?? 0) + a.points);
  const rows = round.entries
    .filter((e) => paired.has(e.candidateId))
    .map((e) => {
      const pair = pairs.find((p) => p.a.id === e.candidateId || p.b.id === e.candidateId)!;
      const votes = pair.a.id === e.candidateId ? pair.votesA : pair.votesB;
      return {
        candidate: e.candidate,
        votes: votes + (adjustById.get(e.candidateId) ?? 0),
      };
    });

  // Candidate number is only a stable display order, never an overall pair-vote ranking.
  const activeRows = rows.filter((r) => r.candidate.status === 'ACTIVE').sort((x, y) => x.candidate.number - y.candidate.number);
  const withdrawnRows = rows.filter((r) => r.candidate.status !== 'ACTIVE');

  const toRow = (r: (typeof rows)[number], rank: number | null): StandingRow => ({
    candidateId: r.candidate.id,
    number: r.candidate.number,
    name: r.candidate.name,
    thumbUrl: pictureUrls(r.candidate.picturePath).thumbUrl,
    score: r.votes,
    rank,
    ...(r.candidate.status === 'ACTIVE' ? {} : { withdrawn: true }),
  });
  const standings: StandingRow[] = [...activeRows.map((r) => toRow(r, null)), ...withdrawnRows.map((r) => toRow(r, null))];

  const sources = await loadBasis(round.id);
  if (sources.some((source) => source.roundId !== round.id)) throw new PairVoteRankingError();
  const activeIds = new Set(activeRows.map((r) => r.candidate.id));
  const winners = pairs.flatMap((p) => p.winnerId !== null && activeIds.has(p.winnerId) ? [p.winnerId] : []);
  const manualAdvancement = round.advanceCount === null || round.advanceCount !== pairs.length || (complete && winners.length !== pairs.length);

  return {
    round: { id: round.id, name: round.name, order: round.order, status: round.status, kind: round.kind, scoreMethod: round.scoreMethod, advanceCount: round.advanceCount },
    entries: round.entries.length,
    judges: progress,
    complete: complete && pairs.every((p) => !p.tied),
    standings,
    direction: 'desc' as const,
    advancingIds: manualAdvancement ? [] : winners,
    manualAdvancement,
    tieAtCutLine: [] as number[],
    basis: null as CutBasis | null,
    adjustments,
    pairs,
    pairTies: pairs.filter((p) => p.tied).map((p) => p.id),
    unpaired: round.entries.filter((e) => !paired.has(e.candidateId)).length,
  };
}
