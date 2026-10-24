import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma';

// Sample event shaped like Hara ng ACLC Ormoc 2026 so every admin screen can be seen at full size.
// Everything here is sample data: house names, candidate names, judges, criteria and weights.
// Run: npm run seed:demo -w apps/api   (replaces the demo event if it exists)

const EVENT_NAME = 'Hara ng ACLC Ormoc 2026 (demo)';
const HOUSES = ['Red House', 'Blue House', 'Gold House'];
const LEVELS = ['SHS', 'College'];

const FIRST = ['Andrea', 'Bea', 'Carla', 'Dana', 'Erika', 'Faye', 'Gwen', 'Hazel', 'Ivy', 'Jessa', 'Kyla', 'Lyka', 'Mika', 'Nina', 'Olive', 'Pia', 'Queenie', 'Rhea', 'Sofia', 'Trixie'];
const LAST = ['Abellana', 'Bacalso', 'Cabahug', 'Dela Cruz', 'Espina', 'Flores', 'Gonzaga', 'Hermosa', 'Ilagan', 'Jumao-as'];

const ROUNDS = [
  { name: 'Production Number', advanceCount: 20, criteria: [['Stage presence', 40], ['National costume', 30], ['Poise and projection', 30]] },
  { name: 'One Minute Speech', advanceCount: 10, criteria: [['Content and theme', 50], ['Delivery', 30], ['Confidence', 20]] },
  { name: 'Gown Competition', advanceCount: 10, criteria: [['Elegance', 40], ['Fit and styling', 30], ['Walk and poise', 30]] },
  { name: 'Deba Teh', advanceCount: 5, kind: 'PAIR_VOTE' as const, criteria: [] },
  { name: 'Witty Questions', advanceCount: 3, criteria: [['Wit and humour', 40], ['Substance', 40], ['Composure', 20]] },
  { name: 'Final Question', advanceCount: null, criteria: [['Substance', 50], ['Delivery', 30], ['Composure', 20]] },
] as const;

const JUDGES = ['Marites Uy', 'Ramon Sabandal', 'Lorna Pacaña', 'Jun Tiu', 'Cecilia Ong'];

async function main() {
  await prisma.event.deleteMany({ where: { name: EVENT_NAME } });

  const event = await prisma.event.create({
    data: { name: EVENT_NAME, date: new Date('2026-11-14T18:00:00+08:00'), venue: 'ACLC College of Ormoc gymnasium', status: 'ACTIVE', testingMode: true },
  });

  const house = await prisma.group.create({
    data: { eventId: event.id, name: 'House', values: { create: HOUSES.map((name) => ({ name })) } },
    include: { values: true },
  });
  const level = await prisma.group.create({
    data: { eventId: event.id, name: 'Level', values: { create: LEVELS.map((name) => ({ name })) } },
    include: { values: true },
  });

  // Each house enters 20 candidates: 10 SHS and 10 College.
  const candidates = [];
  let number = 1;
  for (const [h, houseValue] of house.values.entries()) {
    for (let i = 0; i < 20; i++) {
      const levelValue = level.values[i < 10 ? 0 : 1];
      candidates.push(
        await prisma.candidate.create({
          data: {
            eventId: event.id,
            number: number++,
            // 20 first names x 10 last names, shifted per house, so all 60 names are different.
            name: `${FIRST[i]} ${LAST[(i + h * 3) % LAST.length]}`,
            groupValues: { create: [{ groupValueId: houseValue.id }, { groupValueId: levelValue.id }] },
          },
        }),
      );
    }
  }

  const categoryIds: number[] = [];
  for (const [index, r] of ROUNDS.entries()) {
    const round = await prisma.round.create({
      data: {
        eventId: event.id,
        order: index + 1,
        name: r.name,
        kind: 'kind' in r ? r.kind : 'SCORED',
        advanceCount: r.advanceCount,
        status: index === 0 ? 'OPEN' : 'PENDING',
      },
    });
    if (r.criteria.length) {
      const category = await prisma.category.create({
        data: {
          roundId: round.id,
          name: r.name,
          criteria: { create: r.criteria.map(([name, weight], order) => ({ name, minPoints: 1, maxPoints: 10, weight, order })) },
        },
      });
      categoryIds.push(category.id);
    }
    if (index === 0) {
      await prisma.roundEntry.createMany({ data: candidates.map((c) => ({ roundId: round.id, candidateId: c.id })) });
    }
  }

  const passwordHash = await bcrypt.hash('judge1234', 10);
  for (const name of JUDGES) {
    await prisma.judge.create({
      data: { eventId: event.id, name, passwordHash, categories: { create: categoryIds.map((categoryId) => ({ categoryId })) } },
    });
  }

  console.log(`Demo event "${EVENT_NAME}": ${candidates.length} candidates, ${ROUNDS.length} rounds, ${JUDGES.length} judges (password judge1234)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
