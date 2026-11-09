import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

// Opt in only with a dedicated test database; never fall back to a development database.
test('independent category results and weighted cuts through the API', { skip: !process.env.TEST_DATABASE_URL }, async () => {
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
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
    await prisma.roundEntry.createMany({ data: [a, b].map((candidate) => ({ roundId: round.id, candidateId: candidate.id })) });
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
      { judgeId: judges[2].id, categoryId: costume.id },
    ] });
    await prisma.score.createMany({ data: [
      ...judges.slice(0, 2).flatMap((judge) => [
        { judgeId: judge.id, candidateId: a.id, criterionId: pc.id, points: 90, status: 'SUBMITTED' as const },
        { judgeId: judge.id, candidateId: b.id, criterionId: pc.id, points: 80, status: 'SUBMITTED' as const },
      ]),
      { judgeId: judges[2].id, candidateId: a.id, criterionId: cc.id, points: 70, status: 'SUBMITTED' as const },
      { judgeId: judges[2].id, candidateId: b.id, criterionId: cc.id, points: 90, status: 'SUBMITTED' as const },
    ] });
    const category = await request(`/categories/${costume.id}/report`);
    assert.equal(category.status, 200);
    assert.equal(category.data.complete, true);
    assert.deepEqual(category.data.rows.map((row: any) => [row.candidate.id, row.score, row.rank]), [[b.id, 90, 1], [a.id, 70, 2]]);
    const group = await prisma.group.create({ data: { eventId, name: 'House', values: { create: [{ name: 'Blue' }] } }, include: { values: true } });
    await prisma.candidateGroupValue.create({ data: { candidateId: a.id, groupValueId: group.values[0].id } });
    const filtered = await request(`/categories/${costume.id}/report?groupValueId=${group.values[0].id}`);
    assert.deepEqual(filtered.data.rows.map((row: any) => [row.candidate.id, row.rank]), [[a.id, 1]]);
    await prisma.score.update({ where: { judgeId_candidateId_criterionId: { judgeId: judges[2].id, candidateId: a.id, criterionId: cc.id } }, data: { status: 'DRAFT' } });
    const incomplete = await request(`/categories/${costume.id}/report`);
    assert.equal(incomplete.data.complete, false);
    assert.ok(incomplete.data.rows.every((row: any) => row.rank === null));
    assert.equal((await request(`/rounds/${round.id}/close`, 'POST', {})).status, 409);
    await prisma.score.update({ where: { judgeId_candidateId_criterionId: { judgeId: judges[2].id, candidateId: a.id, criterionId: cc.id } }, data: { status: 'SUBMITTED' } });
    const equal = await request(`/rounds/${round.id}/tabulation`);
    assert.deepEqual(equal.data.standings.map((row: any) => [row.candidateId, row.score]), [[b.id, 85], [a.id, 80]]);
    const unconfigured = await prisma.category.create({ data: { roundId: round.id, name: 'Unconfigured' } });
    const unconfiguredTab = await request(`/rounds/${round.id}/tabulation`);
    assert.equal(unconfiguredTab.data.complete, false);
    assert.ok(unconfiguredTab.data.configurationErrors.some((error: string) => error.includes('Unconfigured')));
    const blocked = await request(`/rounds/${round.id}/close`, 'POST', {});
    assert.equal(blocked.status, 409);
    assert.match(blocked.data.error, /Unconfigured/);
    await prisma.category.delete({ where: { id: unconfigured.id } });
    await prisma.category.update({ where: { id: production.id }, data: { weight: 75 } });
    const invalidTab = await request(`/rounds/${round.id}/tabulation`);
    assert.equal(invalidTab.data.complete, false);
    assert.deepEqual(invalidTab.data.standings, []);
    const invalid = await request(`/rounds/${round.id}/close`, 'POST', {});
    assert.equal(invalid.status, 409);
    assert.match(invalid.data.error, /every category/);
    await prisma.category.update({ where: { id: costume.id }, data: { weight: 25 } });
    const weighted = await request(`/rounds/${round.id}/tabulation`);
    assert.deepEqual(weighted.data.standings.map((row: any) => [row.candidateId, row.score]), [[a.id, 85], [b.id, 82.5]]);
    await prisma.score.update({ where: { judgeId_candidateId_criterionId: { judgeId: judges[0].id, candidateId: a.id, criterionId: pc.id } }, data: { points: 90.01 } });
    const exact = (await request(`/rounds/${round.id}/tabulation`)).data.standings.find((row: any) => row.candidateId === a.id).score as number;
    assert.ok(exact > 85 && exact < 85.01);
    assert.equal((await request(`/rounds/${round.id}/close`, 'POST', {})).status, 200);
    const stored = await prisma.roundEntry.findUniqueOrThrow({ where: { roundId_candidateId: { roundId: round.id, candidateId: a.id } } });
    assert.equal(Number(stored.score), exact);
  } finally {
    if (eventId !== undefined) await prisma.event.delete({ where: { id: eventId } });
    await prisma.$disconnect();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
