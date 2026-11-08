import { prisma } from './prisma';
import { pictureUrls } from './images';
import { assignRanks, topN, type RankedCandidate } from '../scoring';
import { combineCutBasis, loadAdjustments, loadBasis } from './cut';
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
 * A pair's winner has the most submitted votes. The field is ranked pair winners first, then by votes received,
 * then by rank in the round before, so with N pairs and Top N the pair winners are exactly who go on.
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

  // Rank in the round before breaks ties in votes received.
  const previous = await prisma.round.findFirst({
    where: { eventId: round.eventId, order: { lt: round.order }, status: 'CLOSED' },
    orderBy: { order: 'desc' },
    include: { entries: { select: { candidateId: true, rank: true } } },
  });
  const previousRank = new Map(previous?.entries.map((e) => [e.candidateId, e.rank ?? Number.MAX_SAFE_INTEGER]) ?? []);

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
        won: pair.winnerId === e.candidateId ? 1 : 0,
        votes: votes + (adjustById.get(e.candidateId) ?? 0),
        prev: previousRank.get(e.candidateId) ?? Number.MAX_SAFE_INTEGER,
      };
    });

  // Withdrawn candidates keep their place on the sheet but out of the ranks and the cut.
  const activeRows = rows.filter((r) => r.candidate.status === 'ACTIVE').sort((x, y) => y.won - x.won || y.votes - x.votes || x.prev - y.prev);
  const withdrawnRows = rows.filter((r) => r.candidate.status !== 'ACTIVE');

  const ranked: RankedCandidate[] = [];
  activeRows.forEach((r, i) => {
    const before = activeRows[i - 1];
    const same = before && before.won === r.won && before.votes === r.votes && before.prev === r.prev;
    ranked.push({ candidateId: r.candidate.id, score: r.votes, rank: same ? ranked[i - 1].rank : i + 1 });
  });

  const toRow = (r: (typeof rows)[number], rank: number | null): StandingRow => ({
    candidateId: r.candidate.id,
    number: r.candidate.number,
    name: r.candidate.name,
    thumbUrl: pictureUrls(r.candidate.picturePath).thumbUrl,
    score: r.votes,
    rank,
    ...(r.candidate.status === 'ACTIVE' ? {} : { withdrawn: true }),
  });
  const standings: StandingRow[] = [...activeRows.map((r, i) => toRow(r, ranked[i].rank)), ...withdrawnRows.map((r) => toRow(r, null))];

  // The cut: this round alone, or the combined basis the rules call for ("Basis of Top 5 = Gown and Deba Teh").
  const basis = await combineCutBasis(
    await loadBasis(round.id),
    rows.map((r) => ({ candidateId: r.candidate.id, score: r.votes })),
    round.id,
  );
  let cutRanked: RankedCandidate[] = ranked;
  let cutStandings: StandingRow[] | null = null;
  if (basis) {
    const activeIds = new Set(activeRows.map((r) => r.candidate.id));
    cutRanked = assignRanks(basis.combined.filter((r) => activeIds.has(r.candidateId)), 'desc');
    cutStandings = cutRanked.map((r) => toRow(rows.find((x) => x.candidate.id === r.candidateId)!, r.rank));
  }
  const cut = round.advanceCount ? topN(cutRanked, round.advanceCount) : { advancing: cutRanked, tieAtCutLine: [] };

  return {
    round: { id: round.id, name: round.name, order: round.order, status: round.status, kind: round.kind, scoreMethod: round.scoreMethod, advanceCount: round.advanceCount },
    entries: round.entries.length,
    judges: progress,
    complete: complete && pairs.every((p) => !p.tied),
    standings,
    direction: 'desc' as const,
    advancingIds: cut.advancing.map((r) => r.candidateId),
    tieAtCutLine: cut.tieAtCutLine.map((r) => r.candidateId),
    basis: basis && cutStandings ? ({ sources: basis.sources, names: basis.sources.map((s) => s.name), standings: cutStandings } as CutBasis) : (null as CutBasis | null),
    adjustments,
    pairs,
    pairTies: pairs.filter((p) => p.tied).map((p) => p.id),
    unpaired: round.entries.filter((e) => !paired.has(e.candidateId)).length,
  };
}
