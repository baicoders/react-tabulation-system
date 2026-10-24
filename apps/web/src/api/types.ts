export type EventStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
export type RoundKind = 'SCORED' | 'PAIR_VOTE';
export type ScoreMethod = 'AVERAGE' | 'RANK_SUM';
export type TieBreak = 'SHARED_RANK' | 'CATEGORY_SCORE' | 'FIRST_PLACE_COUNT' | 'ADMIN_DECIDES';
export type RoundStatus = 'PENDING' | 'OPEN' | 'CLOSED';

export interface EventListItem {
  id: number;
  name: string;
  date: string | null;
  venue: string | null;
  status: EventStatus;
  testingMode: boolean;
  _count: { candidates: number; judges: number; rounds: number };
}

export interface GroupValue {
  id: number;
  name: string;
  groupId: number;
  _count?: { candidates: number };
}

export interface Group {
  id: number;
  name: string;
  values: GroupValue[];
}

export interface RoundSummary {
  id: number;
  order: number;
  name: string;
  kind: RoundKind;
  scoreMethod: ScoreMethod;
  advanceCount: number | null;
  carryOverWeight: number | null;
  dropExtremes: boolean;
  tieBreak: TieBreak;
  status: RoundStatus;
  _count: { entries: number; categories?: number };
}

export interface EventDetail extends EventListItem {
  rounds: RoundSummary[];
  groups: Group[];
}

export interface Criterion {
  id: number;
  name: string;
  minPoints: number;
  maxPoints: number;
  weight: number | null;
  order: number;
}

export interface Category {
  id: number;
  name: string;
  weight: number | null;
  criteria: Criterion[];
}

export interface Round extends RoundSummary {
  categories: Category[];
}

export interface Judge {
  id: number;
  name: string;
  categoryIds: number[];
  submittedScores: number;
}

export const STATUS_LABEL: Record<EventStatus, string> = { DRAFT: 'Setting up', ACTIVE: 'Live', CLOSED: 'Finished' };
export const METHOD_LABEL: Record<ScoreMethod, string> = { AVERAGE: 'Average of scores', RANK_SUM: 'Rank-sum' };
export const TIE_LABEL: Record<TieBreak, string> = {
  SHARED_RANK: 'Shared rank',
  CATEGORY_SCORE: 'Higher category score',
  FIRST_PLACE_COUNT: 'More first places',
  ADMIN_DECIDES: 'Admin decides',
};
