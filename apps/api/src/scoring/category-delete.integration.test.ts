import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

test('category deletion is limited to unscored categories in pending rounds', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.JWT_SECRET = 'integration-test-secret-not-for-production';
  const [{ createApp }, { prisma }, { signToken }] = await Promise.all([import('../app'), import('../lib/prisma'), import('../middleware/auth')]);
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP test server');
  const token = signToken({ id: 1, role: 'admin', name: 'Test admin' });
  const call = (path: string, method: string, body?: object) => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let eventId: number | undefined;
  try {
    const event = await prisma.event.create({ data: { name: 'Category deletion test' } });
    eventId = event.id;
    const round = await prisma.round.create({ data: { eventId, name: 'Opening', order: 1 } });
    const [first, removable, last] = await Promise.all([0, 1, 2].map((order) => prisma.category.create({ data: { roundId: round.id, name: `Category ${order}`, order } })));
    const criterion = await prisma.criterion.create({ data: { categoryId: removable.id, name: 'Criterion', minPoints: 0, maxPoints: 10 } });
    const judge = await prisma.judge.create({ data: { eventId, name: 'Judge', passwordHash: 'unused' } });
    await prisma.judgeCategory.create({ data: { judgeId: judge.id, categoryId: removable.id } });
    assert.equal((await call(`/categories/${removable.id}`, 'DELETE')).status, 204);
    assert.equal(await prisma.criterion.count({ where: { id: criterion.id } }), 0);
    assert.equal(await prisma.judgeCategory.count({ where: { judgeId: judge.id, categoryId: removable.id } }), 0);
    assert.equal(await prisma.category.count({ where: { id: { in: [first.id, last.id] } } }), 2);
    assert.equal((await call(`/categories/${removable.id}`, 'DELETE')).status, 404);
    const added = await call(`/rounds/${round.id}/categories`, 'POST', { name: 'New category' });
    assert.equal(added.status, 201);
    assert.equal((await added.json() as any).order, 3);

    const scoredCriterion = await prisma.criterion.create({ data: { categoryId: first.id, name: 'Scored', minPoints: 0, maxPoints: 10 } });
    const candidate = await prisma.candidate.create({ data: { eventId, number: 1, name: 'Candidate' } });
    await prisma.score.create({ data: { judgeId: judge.id, candidateId: candidate.id, criterionId: scoredCriterion.id, points: 7 } });
    assert.equal((await call(`/categories/${first.id}`, 'DELETE')).status, 409);
    assert.equal(await prisma.score.count({ where: { criterionId: scoredCriterion.id } }), 1);
    for (const status of ['OPEN', 'CLOSED'] as const) {
      await prisma.round.update({ where: { id: round.id }, data: { status } });
      assert.equal((await call(`/categories/${last.id}`, 'DELETE')).status, 409);
      assert.ok(await prisma.category.findUnique({ where: { id: last.id } }));
    }
  } finally {
    if (eventId) await prisma.event.delete({ where: { id: eventId } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }
});
