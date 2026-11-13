import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

// Opt in only with a dedicated test database. Never fall back to the development database.
test('category results, cut weighting and incompatible units through the API', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.JWT_SECRET = 'integration-test-secret-not-for-production';
  const [{ createApp }, { prisma }, { signToken }] = await Promise.all([
    import('../app'), import('../lib/prisma'), import('../middleware/auth'),
  ]);
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP test server');
  const token = signToken({ id: 1, role: 'admin', name: 'Integration test' });
  const request = async (path: string, method = 'GET', body?: object) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() as any };
  };

  let eventId: number | undefined;
  try {
    const event = await prisma.event.create({ data: { name: 'Category reconciliation integration test' } });
    eventId = event.id;
    const [a, b] = await Promise.all([
      prisma.candidate.create({ data: { eventId, number: 1, name: 'Candidate A' } }),
      prisma.candidate.create({ data: { eventId, number: 2, name: 'Candidate B' } }),
    ]);
    const round = await prisma.round.create({ data: { eventId, order: 1, name: 'Opening stage', status: 'OPEN', advanceCount: 1 } });
    await prisma.roundEntry.createMany({ data: [a, b].map((c) => ({ roundId: round.id, candidateId: c.id })) });
    const [production, costume] = await Promise.all([
      prisma.category.create({ data: { roundId: round.id, name: 'Production' } }),
      prisma.category.create({ data: { roundId: round.id, name: 'Costume' } }),
    ]);
    const [pc, cc] = await Promise.all([
      prisma.criterion.create({ data: { categoryId: production.id, name: 'Performance', minPoints: 0, maxPoints: 100 } }),
      prisma.criterion.create({ data: { categoryId: costume.id, name: 'Costume', minPoints: 0, maxPoints: 100 } }),
    ]);
    const judges = await Promise.all(['One', 'Two', 'Three'].map((name) => prisma.judge.create({ data: { eventId: event.id, name, passwordHash: 'unused' } })));
    await prisma.judgeCategory.createMany({ data: [
      { judgeId: judges[0].id, categoryId: production.id }, { judgeId: judges[1].id, categoryId: production.id },
      { judgeId: judges[0].id, categoryId: costume.id },
      { judgeId: judges[2].id, categoryId: costume.id },
    ] });
    await prisma.score.createMany({ data: [
      ...judges.slice(0, 2).flatMap((j) => [
        { judgeId: j.id, candidateId: a.id, criterionId: pc.id, points: 90, status: 'SUBMITTED' as const },
        { judgeId: j.id, candidateId: b.id, criterionId: pc.id, points: 80, status: 'SUBMITTED' as const },
      ]),
      { judgeId: judges[2].id, candidateId: a.id, criterionId: cc.id, points: 70, status: 'SUBMITTED' as const },
      { judgeId: judges[2].id, candidateId: b.id, criterionId: cc.id, points: 90, status: 'SUBMITTED' as const },
      { judgeId: judges[0].id, candidateId: a.id, criterionId: cc.id, points: 70, status: 'SUBMITTED' as const },
      { judgeId: judges[0].id, candidateId: b.id, criterionId: cc.id, points: 90, status: 'SUBMITTED' as const },
    ] });
    const category = await request(`/categories/${costume.id}/report`);
    assert.equal(category.status, 200);
    assert.equal(category.data.complete, true);
    assert.deepEqual(category.data.rows.map((r: any) => [r.candidate.id, r.score, r.rank]), [[b.id, 90, 1], [a.id, 70, 2]]);
    const tab = await request(`/rounds/${round.id}/tabulation`);
    assert.equal(tab.status, 200);
    assert.deepEqual(tab.data.standings.map((r: any) => [r.candidateId, r.score]), [[b.id, 85], [a.id, 80]]);
    assert.equal(tab.data.judges.find((j: any) => j.id === judges[0].id).categories.length, 2);
    const unlocked = await request(`/categories/${costume.id}/judges/${judges[0].id}/unlock`, 'POST', {});
    assert.equal(unlocked.status, 200);
    assert.equal(unlocked.data.unlocked, 2);
    assert.equal(await prisma.score.count({ where: { judgeId: judges[0].id, criterionId: pc.id, status: 'SUBMITTED' } }), 2);
    assert.equal(await prisma.score.count({ where: { judgeId: judges[0].id, criterionId: cc.id, status: 'DRAFT' } }), 2);
    await prisma.score.updateMany({ where: { judgeId: judges[0].id, criterionId: cc.id }, data: { status: 'SUBMITTED' } });
    const incompleteCategory = await prisma.category.create({ data: { roundId: round.id, name: 'Unconfigured' } });
    const blockedClose = await request(`/rounds/${round.id}/close`, 'POST', {});
    assert.equal(blockedClose.status, 409);
    assert.match(blockedClose.data.error, /Unconfigured/);
    await prisma.category.delete({ where: { id: incompleteCategory.id } });
    await prisma.category.update({ where: { id: production.id }, data: { weight: 75 } });
    const incompleteWeights = await request(`/rounds/${round.id}/close`, 'POST', {});
    assert.equal(incompleteWeights.status, 409);
    assert.match(incompleteWeights.data.error, /every category/);
    await prisma.category.update({ where: { id: costume.id }, data: { weight: 25 } });
    const weighted = await request(`/rounds/${round.id}/tabulation`);
    assert.deepEqual(weighted.data.standings.map((r: any) => [r.candidateId, r.score]), [[a.id, 85], [b.id, 82.5]]);
    const voteRound = await prisma.round.create({ data: { eventId, order: 2, name: 'Vote', kind: 'PAIR_VOTE' } });
    const rejectedBasis = await request(`/rounds/${voteRound.id}`, 'PATCH', { basis: [{ sourceRoundId: round.id, weight: 1 }, { sourceRoundId: null, weight: 1 }] });
    assert.equal(rejectedBasis.status, 400);
    assert.match(rejectedBasis.data.error, /different units/);
    assert.equal(await prisma.roundBasis.count({ where: { roundId: voteRound.id } }), 0);
    const rejectedReport = await request(`/events/${event.id}/reports/combined?roundIds=${round.id},${voteRound.id}&weights=1,1`);
    assert.equal(rejectedReport.status, 400);
    assert.match(rejectedReport.data.error, /different units/);
    const rejectedCreate = await request(`/events/${event.id}/rounds`, 'POST', {
      name: 'Invalid mixed basis', kind: 'SCORED', basis: [{ sourceRoundId: voteRound.id, weight: 1 }, { sourceRoundId: null, weight: 1 }],
    });
    assert.equal(rejectedCreate.status, 400);
    assert.equal(await prisma.round.count({ where: { eventId, name: 'Invalid mixed basis' } }), 0);
    const scoredRound = await prisma.round.create({ data: { eventId, order: 3, name: 'Later scored' } });
    const acceptedBasis = await request(`/rounds/${scoredRound.id}`, 'PATCH', { basis: [{ sourceRoundId: round.id, weight: 1 }, { sourceRoundId: null, weight: 1 }] });
    assert.equal(acceptedBasis.status, 200);
    const rejectedSourceChange = await request(`/rounds/${round.id}`, 'PATCH', { kind: 'PAIR_VOTE' });
    assert.equal(rejectedSourceChange.status, 400);
    assert.equal((await prisma.round.findUniqueOrThrow({ where: { id: round.id } })).kind, 'SCORED');
    await prisma.score.update({
      where: { judgeId_candidateId_criterionId: { judgeId: judges[0].id, candidateId: a.id, criterionId: pc.id } },
      data: { points: 90.01 },
    });
    const beforeClose = await request(`/rounds/${round.id}/tabulation`);
    const exactScore = beforeClose.data.standings.find((r: any) => r.candidateId === a.id).score as number;
    assert.ok(exactScore > 85 && exactScore < 85.01);
    const close = await request(`/rounds/${round.id}/close`, 'POST', {});
    assert.equal(close.status, 200);
    const stored = await prisma.roundEntry.findUniqueOrThrow({ where: { roundId_candidateId: { roundId: round.id, candidateId: a.id } } });
    assert.equal(Number(stored.score), exactScore);
    const [c, d] = await Promise.all([
      prisma.candidate.create({ data: { eventId, number: 3, name: 'Candidate C' } }),
      prisma.candidate.create({ data: { eventId, number: 4, name: 'Candidate D' } }),
    ]);
    await prisma.round.update({ where: { id: voteRound.id }, data: { status: 'OPEN', advanceCount: 2 } });
    await prisma.roundEntry.createMany({ data: [a, b, c, d].map((candidate) => ({ roundId: voteRound.id, candidateId: candidate.id })), skipDuplicates: true });
    const [pairOne, pairTwo] = await Promise.all([
      prisma.pair.create({ data: { roundId: voteRound.id, candidateAId: a.id, candidateBId: b.id, order: 1 } }),
      prisma.pair.create({ data: { roundId: voteRound.id, candidateAId: c.id, candidateBId: d.id, order: 2 } }),
    ]);
    await prisma.pairVote.createMany({ data: judges.flatMap((judge) => [
      { pairId: pairOne.id, judgeId: judge.id, winnerId: a.id, status: 'SUBMITTED' as const },
      { pairId: pairTwo.id, judgeId: judge.id, winnerId: d.id, status: 'SUBMITTED' as const },
    ]) });
    const votes = await request(`/rounds/${voteRound.id}/tabulation`);
    assert.equal(votes.status, 200);
    assert.ok(votes.data.standings.every((row: any) => row.rank === null));
    assert.deepEqual(votes.data.advancingIds, [a.id, d.id]);
    await prisma.round.update({ where: { id: voteRound.id }, data: { advanceCount: 1 } });
    const mismatch = await request(`/rounds/${voteRound.id}/tabulation`);
    assert.equal(mismatch.data.manualAdvancement, true);
    assert.deepEqual(mismatch.data.advancingIds, []);
    await prisma.round.update({ where: { id: voteRound.id }, data: { advanceCount: 2 } });
    const closeVotes = await request(`/rounds/${voteRound.id}/close`, 'POST', {});
    assert.equal(closeVotes.status, 200);
    assert.equal(closeVotes.data.manualAdvancement, false);
    const advanced = await prisma.roundEntry.findMany({ where: { roundId: scoredRound.id }, select: { candidateId: true } });
    assert.deepEqual(advanced.map((entry) => entry.candidateId).sort((x, y) => x - y), [a.id, d.id].sort((x, y) => x - y));
    const overall = await request(`/events/${event.id}/reports/overall`);
    assert.equal(overall.status, 200);
    assert.ok(overall.data.rows.filter((row: any) => row.reached?.kind === 'PAIR_VOTE').every((row: any) => row.position === null));
    const pairRanking = await request(`/events/${event.id}/reports/combined?roundIds=${voteRound.id}&weights=1`);
    assert.equal(pairRanking.status, 400);
    assert.match(pairRanking.data.error, /cannot be ranked across pairs/);
  } finally {
    if (eventId !== undefined) await prisma.event.delete({ where: { id: eventId } });
    await prisma.$disconnect();
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});
