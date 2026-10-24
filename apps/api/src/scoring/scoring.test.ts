import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCarryOver,
  applyDeductions,
  assignRanks,
  averageScores,
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

test('deductions subtract after tabulation', () => {
  const result = applyDeductions([{ candidateId: 1, score: 88 }], new Map([[1, 5]]));
  assert.equal(result[0].score, 83);
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

test('rankTitle names the top four', () => {
  assert.equal(rankTitle(1), 'Champion');
  assert.equal(rankTitle(4), '3rd Runner-up');
  assert.equal(rankTitle(5), 'Rank 5');
});
