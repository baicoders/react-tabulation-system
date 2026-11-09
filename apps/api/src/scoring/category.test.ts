import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryResults, categoryWeightError, combineCategoryAverages, type CategoryScore } from './category';

test('category results use assigned complete submissions and keep full precision', () => {
  const scores: CategoryScore[] = [
    { judgeId: 1, candidateId: 1, criterionId: 1, points: 9, status: 'SUBMITTED' },
    { judgeId: 1, candidateId: 2, criterionId: 1, points: 8, status: 'SUBMITTED' },
    { judgeId: 2, candidateId: 1, criterionId: 1, points: 10, status: 'SUBMITTED' },
    { judgeId: 2, candidateId: 2, criterionId: 1, points: 10, status: 'DRAFT' },
    { judgeId: 3, candidateId: 1, criterionId: 1, points: 1, status: 'SUBMITTED' },
    { judgeId: 3, candidateId: 2, criterionId: 1, points: 10, status: 'SUBMITTED' },
  ];
  const result = categoryResults({ candidateIds: [1, 2], activeCandidateIds: [1, 2], judgeIds: [1, 2], criteria: [{ id: 1, maxPoints: 10, weight: null }], scores });
  assert.deepEqual(result.submittedJudgeIds, [1]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.ranking.map((r) => [r.candidateId, r.score, r.rank]), [[1, 90, 1], [2, 80, 2]]);
});

test('category ranking compares unrounded values and excludes withdrawn candidates', () => {
  const result = categoryResults({
    candidateIds: [1, 2, 3], activeCandidateIds: [1, 2], judgeIds: [1],
    criteria: [{ id: 1, maxPoints: 1000, weight: null }],
    scores: [
      { judgeId: 1, candidateId: 1, criterionId: 1, points: 866.64, status: 'SUBMITTED' },
      { judgeId: 1, candidateId: 2, criterionId: 1, points: 866.65, status: 'SUBMITTED' },
      { judgeId: 1, candidateId: 3, criterionId: 1, points: 999, status: 'SUBMITTED' },
    ],
  });
  assert.equal(result.complete, true);
  assert.deepEqual(result.ranking.map((r) => [r.candidateId, r.rank]), [[2, 1], [1, 2]]);
  assert.equal(result.scores.length, 3);
});

test('no judges or no criteria cannot constitute a completed category', () => {
  assert.equal(categoryResults({ candidateIds: [1], activeCandidateIds: [1], judgeIds: [], criteria: [], scores: [] }).complete, false);
  assert.equal(categoryResults({ candidateIds: [1], activeCandidateIds: [1], judgeIds: [1], criteria: [], scores: [] }).complete, false);
});

test('cut combines category averages with equal or configured weights and no missing-category totals', () => {
  const production = [{ candidateId: 1, score: 90 }, { candidateId: 2, score: 80 }];
  const costume = [{ candidateId: 1, score: 70 }, { candidateId: 2, score: 90 }];
  assert.deepEqual(combineCategoryAverages([1, 2], [{ weight: 1, scores: production }, { weight: 1, scores: costume }]), [
    { candidateId: 1, score: 80 }, { candidateId: 2, score: 85 },
  ]);
  assert.deepEqual(combineCategoryAverages([1, 2], [{ weight: 3, scores: production }, { weight: 1, scores: costume }]), [
    { candidateId: 1, score: 85 }, { candidateId: 2, score: 82.5 },
  ]);
  assert.deepEqual(combineCategoryAverages([1, 2], [{ weight: 1, scores: production }, { weight: 1, scores: [] }]), []);
});

test('category cut weights are either all equal or complete percentages', () => {
  assert.equal(categoryWeightError([null, null]), null);
  assert.equal(categoryWeightError([75, 25]), null);
  assert.match(categoryWeightError([75, null])!, /every category/);
  assert.match(categoryWeightError([75, 20])!, /95%/);
});
