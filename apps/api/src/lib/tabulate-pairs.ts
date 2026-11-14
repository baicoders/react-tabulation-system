import { prisma } from './prisma';
import { pictureUrls } from './images';
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
  voided: boolean;
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
  const withdrawn = new Set(round.entries.filter((e) => e.withdrawn).map((e) => e.candidateId));

  const pairs: PairTally[] = round.pairs.map((p) => {
    const votes = p.votes.filter(countsVote);
    const submitted = votes.filter((v) => v.status === 'SUBMITTED');
    const votesA = submitted.filter((v) => v.winnerId === p.candidateAId).length;
    const votesB = submitted.filter((v) => v.winnerId === p.candidateBId).length;
    const decided = judges.length > 0 && submitted.length >= judges.length;
    const voided = withdrawn.has(p.candidateAId) || withdrawn.has(p.candidateBId);
    const tied = !voided && decided && votesA === votesB;
    return {
      id: p.id,
      order: p.order,
      a: toCandidate(p.candidateA),
      b: toCandidate(p.candidateB),
      castA: votes.filter((v) => v.winnerId === p.candidateAId).length,
      castB: votes.filter((v) => v.winnerId === p.candidateBId).length,
      votesA,
      votesB,
      winnerId: voided || !decided || tied ? null : votesA > votesB ? p.candidateAId : p.candidateBId,
      tied,
      voided,
    };
  });

  const activePairIds = new Set(pairs.filter((p) => !p.voided).map((p) => p.id));
  const allVotes = round.pairs.filter((p) => activePairIds.has(p.id)).flatMap((p) => p.votes).filter(countsVote);
  const progress: JudgeProgress[] = judges.map((j) => {
    const mine = allVotes.filter((v) => v.judgeId === j.id);
    const submitted = mine.filter((v) => v.status === 'SUBMITTED').length;
    const required = activePairIds.size;
    return { id: j.id, name: j.name, categoryIds: [], required, scored: mine.length, submittedCategoryIds: [], done: submitted >= required };
  });
  const complete = pairs.length > 0 && progress.length > 0 && progress.every((p) => p.done);

  const paired = new Set(pairs.flatMap((p) => [p.a.id, p.b.id]));
  const rows = round.entries
    .filter((e) => !e.withdrawn && paired.has(e.candidateId))
    .map((e) => {
      const pair = pairs.find((p) => p.a.id === e.candidateId || p.b.id === e.candidateId)!;
      const votes = pair.a.id === e.candidateId ? pair.votesA : pair.votesB;
      return { candidate: e.candidate, votes };
    })
    .sort((x, y) => x.candidate.number - y.candidate.number);

  const standings: StandingRow[] = rows.map((r) => ({
    candidateId: r.candidate.id,
    number: r.candidate.number,
    name: r.candidate.name,
    thumbUrl: pictureUrls(r.candidate.picturePath).thumbUrl,
    score: r.votes,
    rank: null,
  }));
  const winners = pairs.flatMap((pair) => pair.winnerId === null ? [] : [pair.winnerId]);
  const manualAdvancement = pairs.some((p) => p.voided) || round.advanceCount === null || round.advanceCount !== pairs.length;

  return {
    round: { id: round.id, name: round.name, order: round.order, status: round.status, kind: round.kind, advanceCount: round.advanceCount },
    entries: round.entries.filter((e) => !e.withdrawn).length,
    judges: progress,
    complete: complete && pairs.every((p) => !p.tied),
    standings,
    direction: 'desc' as const,
    advancingIds: manualAdvancement ? [] : winners,
    manualAdvancement,
    tieAtCutLine: [] as number[],
    pairs,
    pairTies: pairs.filter((p) => p.tied).map((p) => p.id),
    unpaired: round.entries.filter((e) => !e.withdrawn && !paired.has(e.candidateId)).length,
  };
}
