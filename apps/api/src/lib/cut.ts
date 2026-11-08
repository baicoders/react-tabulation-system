import { prisma } from './prisma';
import { combineBasis, type CandidateScore } from '../scoring';

// What shapes a round's cut beyond the judges' scores: the adjustments against them, and the earlier
// rounds a cut can be based on ("Basis of Top 5 = Gown and Deba Teh"). Shared by both tabulators.

export interface AdjustmentRow {
  id: number;
  candidateId: number;
  points: number;
  reason: string | null;
}

/** The adjustments against a round's scores: guideline penalties and last-minute fixes, at full value. */
export async function loadAdjustments(roundId: number): Promise<AdjustmentRow[]> {
  const rows = await prisma.adjustment.findMany({ where: { roundId }, orderBy: { id: 'asc' } });
  return rows.map((a) => ({ id: a.id, candidateId: a.candidateId, points: Number(a.points), reason: a.reason }));
}

export interface BasisSource {
  roundId: number;
  name: string;
  weight: number;
  closed: boolean;
}

/** What this round's cut is based on. Empty means the cut is this round alone. */
export async function loadBasis(roundId: number): Promise<BasisSource[]> {
  const rows = await prisma.roundBasis.findMany({
    where: { roundId },
    orderBy: { id: 'asc' },
    include: { sourceRound: { select: { id: true, name: true, status: true } } },
  });
  return rows.map((r) => ({ roundId: r.sourceRound.id, name: r.sourceRound.name, weight: Number(r.weight), closed: r.sourceRound.status === 'CLOSED' }));
}

/** The scores a closed round saved (each already includes that round's own adjustments). */
export async function loadStoredScores(roundId: number): Promise<CandidateScore[]> {
  const entries = await prisma.roundEntry.findMany({ where: { roundId }, select: { candidateId: true, score: true } });
  return entries.filter((e) => e.score !== null).map((e) => ({ candidateId: e.candidateId, score: Number(e.score) }));
}

/**
 * The combined scores a cut is based on, or null when the cut is the round's own scores alone.
 * This round's own scores come from the live tabulation; earlier rounds contribute what they saved.
 */
export async function combineCutBasis(
  sources: BasisSource[],
  ownScores: CandidateScore[],
  ownRoundId: number,
): Promise<{ sources: BasisSource[]; combined: CandidateScore[] } | null> {
  if (sources.length === 0) return null;
  const parts = await Promise.all(
    sources.map(async (s) => ({
      weight: s.weight,
      scores: s.roundId === ownRoundId ? ownScores : await loadStoredScores(s.roundId),
    })),
  );
  return { sources, combined: combineBasis(parts) };
}
