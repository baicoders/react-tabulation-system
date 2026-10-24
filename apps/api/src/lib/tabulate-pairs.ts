import { prisma } from './prisma';
import { pictureUrls } from './images';
import { topN, type RankedCandidate } from '../scoring';
import type { JudgeProgress, StandingRow } from './tabulate';

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
 * A pair's winner has the most submitted votes. The field is ranked pair winners first, then by votes received,
 * then by rank in the round before, so with N pairs and Top N the pair winners are exactly who go on.
 */
export async function tabulatePairRound(roundId: number) {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      event: { select: { testingMode: true } },
      entries: { include: { candidate: { select: { id: true, number: true, name: true, picturePath: true } } } },
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

  // Rank in the round before breaks ties in votes received.
  const previous = await prisma.round.findFirst({
    where: { eventId: round.eventId, order: { lt: round.order }, status: 'CLOSED' },
    orderBy: { order: 'desc' },
    include: { entries: { select: { candidateId: true, rank: true } } },
  });
  const previousRank = new Map(previous?.entries.map((e) => [e.candidateId, e.rank ?? Number.MAX_SAFE_INTEGER]) ?? []);

  const paired = new Set(pairs.flatMap((p) => [p.a.id, p.b.id]));
  const rows = round.entries
    .filter((e) => paired.has(e.candidateId))
    .map((e) => {
      const pair = pairs.find((p) => p.a.id === e.candidateId || p.b.id === e.candidateId)!;
      const votes = pair.a.id === e.candidateId ? pair.votesA : pair.votesB;
      return { candidate: e.candidate, won: pair.winnerId === e.candidateId ? 1 : 0, votes, prev: previousRank.get(e.candidateId) ?? Number.MAX_SAFE_INTEGER };
    })
    .sort((x, y) => y.won - x.won || y.votes - x.votes || x.prev - y.prev);

  const ranked: RankedCandidate[] = [];
  rows.forEach((r, i) => {
    const before = rows[i - 1];
    const same = before && before.won === r.won && before.votes === r.votes && before.prev === r.prev;
    ranked.push({ candidateId: r.candidate.id, score: r.votes, rank: same ? ranked[i - 1].rank : i + 1 });
  });

  const standings: StandingRow[] = rows.map((r, i) => ({
    candidateId: r.candidate.id,
    number: r.candidate.number,
    name: r.candidate.name,
    thumbUrl: pictureUrls(r.candidate.picturePath).thumbUrl,
    score: r.votes,
    rank: ranked[i].rank,
    deduction: 0,
  }));
  const cut = round.advanceCount ? topN(ranked, round.advanceCount) : { advancing: ranked, tieAtCutLine: [] };

  return {
    round: { id: round.id, name: round.name, order: round.order, status: round.status, kind: round.kind, scoreMethod: round.scoreMethod, advanceCount: round.advanceCount },
    entries: round.entries.length,
    judges: progress,
    complete: complete && pairs.every((p) => !p.tied),
    standings,
    direction: 'desc' as const,
    advancingIds: cut.advancing.map((r) => r.candidateId),
    tieAtCutLine: cut.tieAtCutLine.map((r) => r.candidateId),
    pairs,
    pairTies: pairs.filter((p) => p.tied).map((p) => p.id),
    unpaired: round.entries.filter((e) => !paired.has(e.candidateId)).length,
  };
}
