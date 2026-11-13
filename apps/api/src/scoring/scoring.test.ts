import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAdjustments,
  applyCarryOver,
  assignRanks,
  averageScores,
  combineBasis,
  IncompatibleMeasurementsError,
  measurementDirection,
  roundMeasurement,
  rankSum,
  rankTitle,
  topN,
  type JudgeTotal,
} from './index';

// The worked example from the PRD: one generous judge decides the winner under averaging, not under rank-sum.
const prdExample: JudgeTotal[] = [
  { judgeId: 1, candidateId: 1, total: 95 },
  { judgeId: 2, candidateId: 1, total: 80 },
  { judgeId: 3, candidateId: 1, total: 82 },
  { judgeId: 1, candidateId: 2, total: 85 },
  { judgeId: 2, candidateId: 2, total: 86 },
  { judgeId: 3, candidateId: 2, total: 85 },
];

test('average: candidate A wins the PRD example', () => {
  const ranked = assignRanks(averageScores(prdExample), 'desc');
  assert.equal(ranked[0].candidateId, 1);
  assert.equal(ranked[0].score.toFixed(1), '85.7');
});

test('category-first scenario: independent averages produce independent winners', () => {
  // These are separate category inputs, not the current round tabulator's combined judge totals.
  const production = averageScores([
    { judgeId: 1, candidateId: 1, total: 90 },
    { judgeId: 1, candidateId: 2, total: 80 },
    { judgeId: 2, candidateId: 1, total: 90 },
    { judgeId: 2, candidateId: 2, total: 80 },
  ]);
  const costume = averageScores([
    { judgeId: 3, candidateId: 1, total: 70 },
    { judgeId: 3, candidateId: 2, total: 90 },
  ]);
  assert.deepEqual(assignRanks(production, 'desc').map((r) => r.candidateId), [1, 2]);
  assert.deepEqual(assignRanks(costume, 'desc').map((r) => r.candidateId), [2, 1]);

  // Equal category shares, regardless of the number of judges in either category.
  const equal = combineBasis([{ measurement: 'SCORED_POINTS', weight: 0.5, scores: production }, { measurement: 'SCORED_POINTS', weight: 0.5, scores: costume }]);
  assert.deepEqual(assignRanks(equal, 'desc').map((r) => [r.candidateId, r.score]), [[2, 85], [1, 80]]);
  const weighted = combineBasis([{ measurement: 'SCORED_POINTS', weight: 0.75, scores: production }, { measurement: 'SCORED_POINTS', weight: 0.25, scores: costume }]);
  assert.deepEqual(assignRanks(weighted, 'desc').map((r) => [r.candidateId, r.score]), [[1, 85], [2, 82.5]]);
});

test('rank-sum: candidate B wins the PRD example', () => {
  const ranked = assignRanks(rankSum(prdExample), 'asc');
  assert.deepEqual(
    ranked.map((r) => [r.candidateId, r.score]),
    [
      [2, 4],
      [1, 5],
    ],
  );
});

test('rank-sum: tied totals share the average rank', () => {
  const sums = rankSum([
    { judgeId: 1, candidateId: 1, total: 90 },
    { judgeId: 1, candidateId: 2, total: 90 },
    { judgeId: 1, candidateId: 3, total: 80 },
  ]);
  assert.deepEqual(new Map(sums.map((s) => [s.candidateId, s.score])), new Map([[1, 1.5], [2, 1.5], [3, 3]]));
});

test('average: dropExtremes removes highest and lowest with 5+ judges', () => {
  const totals = [70, 80, 80, 80, 100].map((total, i) => ({ judgeId: i + 1, candidateId: 1, total }));
  assert.equal(averageScores(totals, { dropExtremes: true })[0].score, 80);
  assert.equal(averageScores(totals.slice(0, 4), { dropExtremes: true })[0].score, 77.5);
});

test('carry-over blends earlier and current scores', () => {
  const result = applyCarryOver([{ candidateId: 1, score: 90 }], [{ candidateId: 1, score: 80 }], 0.3);
  assert.equal(result[0].score, 87);
});

test('assignRanks shares ranks on ties and skips the next', () => {
  const ranked = assignRanks(
    [
      { candidateId: 1, score: 90 },
      { candidateId: 2, score: 90 },
      { candidateId: 3, score: 85 },
    ],
    'desc',
  );
  assert.deepEqual(ranked.map((r) => r.rank), [1, 1, 3]);
});

test('topN flags a tie at the cut line', () => {
  const ranked = assignRanks(
    [
      { candidateId: 1, score: 95 },
      { candidateId: 2, score: 90 },
      { candidateId: 3, score: 90 },
      { candidateId: 4, score: 80 },
    ],
    'desc',
  );
  const { advancing, tieAtCutLine } = topN(ranked, 2);
  assert.equal(advancing.length, 3);
  assert.deepEqual(tieAtCutLine.map((r) => r.candidateId), [2, 3]);
});

test('adjustments add and deduct at full value, ignoring candidates without a score', () => {
  const adjusted = applyAdjustments(
    [
      { candidateId: 1, score: 90 },
      { candidateId: 2, score: 85 },
    ],
    [
      { candidateId: 1, points: -5 },
      { candidateId: 1, points: -5 },
      { candidateId: 3, points: 10 },
    ],
  );
  assert.deepEqual(adjusted, [
    { candidateId: 1, score: 80 },
    { candidateId: 2, score: 85 },
  ]);
});

test('combineBasis adds each round score times its weight', () => {
  // Both inputs are scored points; weights cannot make different units comparable.
  const combined = combineBasis([
    { measurement: 'SCORED_POINTS', weight: 5, scores: [{ candidateId: 1, score: 80 }, { candidateId: 2, score: 85 }] },
    { measurement: 'SCORED_POINTS', weight: 1, scores: [{ candidateId: 1, score: 90 }, { candidateId: 2, score: 60 }] },
  ]);
  assert.deepEqual(new Map(combined.map((c) => [c.candidateId, c.score])), new Map([[1, 490], [2, 485]]));
});

test('combineBasis: a missed round contributes nothing and the rest still count', () => {
  const combined = combineBasis([
    { measurement: 'SCORED_POINTS', weight: 1, scores: [{ candidateId: 1, score: 70 }] },
    { measurement: 'SCORED_POINTS', weight: 1, scores: [{ candidateId: 1, score: 70 }, { candidateId: 2, score: 95 }] },
  ]);
  assert.deepEqual(new Map(combined.map((c) => [c.candidateId, c.score])), new Map([[1, 140], [2, 95]]));
});

test('combineBasis keeps ties tied so the cut line sees them', () => {
  const combined = combineBasis([
    { measurement: 'SCORED_POINTS', weight: 2, scores: [{ candidateId: 1, score: 80 }, { candidateId: 2, score: 80 }] },
    { measurement: 'SCORED_POINTS', weight: 1, scores: [{ candidateId: 1, score: 60 }, { candidateId: 2, score: 60 }] },
  ]);
  const ranked = assignRanks(combined, 'desc');
  assert.deepEqual(ranked.map((r) => r.rank), [1, 1]);
});

test('combining results rejects incompatible units even when a source has no scores', () => {
  for (const measurement of ['PAIR_VOTES', 'RANK_POINTS'] as const) {
    assert.throws(() => combineBasis([
      { measurement: 'SCORED_POINTS', weight: 1, scores: [{ candidateId: 1, score: 90 }] },
      { measurement, weight: 1, scores: [] },
    ]), IncompatibleMeasurementsError);
  }
  assert.throws(() => combineBasis([
    { measurement: 'PAIR_VOTES', weight: 1, scores: [] },
    { measurement: 'RANK_POINTS', weight: 1, scores: [] },
  ]), /different units or ranking directions/);
});

test('round measurement keeps units and ranking direction distinct', () => {
  assert.equal(roundMeasurement({ kind: 'SCORED', scoreMethod: 'AVERAGE' }), 'SCORED_POINTS');
  assert.equal(roundMeasurement({ kind: 'SCORED', scoreMethod: 'RANK_SUM' }), 'RANK_POINTS');
  assert.equal(roundMeasurement({ kind: 'PAIR_VOTE', scoreMethod: 'RANK_SUM' }), 'PAIR_VOTES');
  assert.equal(measurementDirection('RANK_POINTS'), 'asc');
  assert.equal(measurementDirection('PAIR_VOTES'), 'desc');
});

test('rankTitle names the top four', () => {
  assert.equal(rankTitle(1), 'Champion');
  assert.equal(rankTitle(4), '3rd Runner-up');
  assert.equal(rankTitle(5), 'Rank 5');
});
