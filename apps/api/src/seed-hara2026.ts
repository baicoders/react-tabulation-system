import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import JSZip from 'jszip';
import { saveCandidatePicture } from './lib/images';
import { prisma } from './lib/prisma';
import { tabulateRound } from './lib/tabulate';

/**
 * Seeds the real HARA NG ACLC ORMOC: QUEEN OF ALL NATIONS 2026 event (Ormoc, 31 Oct 2026) so the whole
 * tabulation can be rehearsed in this system with the same candidates, stages, categories and judges.
 *
 * The candidates, criteria, judges and ballots are transcribed from the old system's
 * Hara_2026_United_Nations seeder and its post-event database dump (Hara2026Results.zip).
 *
 * Stages follow the category-first model: a stage holds the categories judged over one field. The
 * opening segments ran at the same time over the same 52 candidates, so they are three categories of
 * one stage rather than three rounds. Each category keeps its own ranking and award; the stage only
 * decides the cut.
 *
 * Modes:
 *
 *   (default)       Clean event in "Setting up": run the whole night yourself.
 *   --replay        A second event holding the 2,940 real ballots as confirmed scores, closed exactly
 *                   as the night ran - rosters as they actually were, including the hand-picked top 20.
 *   --emit-imports  Also write hara2026-import/candidates.csv + photos.zip, to rehearse the admin
 *                   Candidates import screen instead of clicking the roster in by hand.
 *   --replace       Replace an event of the same name instead of refusing to touch it.
 *   --zip / --flags Where to find Hara2026Results.zip and the old system's flag photos
 *                   (Tabulation-System/public/flags). Missing flags just mean candidates without photos.
 *
 * Run with Docker:
 *   docker compose cp Hara2026Results.zip api:/app/apps/api/
 *   docker compose cp ../Tabulation-System/public/flags api:/app/apps/api/flags
 *   docker compose exec api node dist/seed-hara2026.js --emit-imports
 *   docker compose exec api node dist/seed-hara2026.js --replay
 *   docker compose cp api:/app/apps/api/hara2026-import ./hara2026-import
 *
 * Or from the repo with the dev stack: npm run seed:hara2026 -w apps/api -- --replay
 * See docs/hara2026-manual-setup.md for setting the event up by hand through the admin screens.
 */

const EVENT_NAME = 'HARA NG ACLC ORMOC: QUEEN OF ALL NATIONS 2026';
const REPLAY_EVENT_NAME = 'HARA NG ACLC ORMOC 2026 — replay (from old system data)';
const EVENT_DATE = new Date('2026-10-31T18:00:00+08:00');
const VENUE = 'ACLC Ormoc Open Stage';

/** One independently judged category. Criteria names are the organizers' own, spellings included. */
interface CategorySpec {
  /** The old system's category code (101-108); maps the replay ballots and rosters. */
  code: string;
  name: string;
  criteria: [name: string, max: number][];
  /** Share of the stage's cut, in percent. Null or omitted: equal shares. */
  cutWeight?: number;
}

/** One stage: the categories judged over one field of candidates, then an optional cut. */
interface StageSpec {
  name: string;
  /** Top N that go on to the next stage. Null: the cut is decided by hand, or this is the final stage. */
  advanceCount: number | null;
  /**
   * The debate challenge. Judges vote in pairs when the event is run live. The old night graded one
   * "Win or Lose" criterion instead, so replaying its ballots uses the scored category below.
   */
  pairVote?: boolean;
  categories: CategorySpec[];
}

const STAGES: StageSpec[] = [
  {
    // Production Number and National Costume were judged at the same time, in costume, over the same
    // 52 candidates; Chukchak followed in the same opening segment. All three share one field.
    name: 'OPENING STAGE',
    // Not a computed cut: 10 chosen by the judges on overall performance across all three categories,
    // plus 10 drawn by lot on stage (guideline 9). The tabulator enters the 20 by hand.
    advanceCount: null,
    categories: [
      {
        code: '101',
        name: 'PRODUCTION NUMBER',
        criteria: [
          ['Charisma', 10],
          ['Stage Presences and Confidence', 10],
          ['Choreography and Execution', 10],
          ['Energy and Showmanship', 10],
          ['Audience Impact and Overall Appeal', 10],
        ],
      },
      {
        code: '102',
        name: 'NATIONAL COSTUME',
        criteria: [
          ['Authenticity and Cultural Representation', 10],
          ['Creativity and Originality', 10],
          ['Craftmanship and Attention to Detail', 10],
          ['Visual Impact and Overall Appearance', 10],
          ['Stage Presentation and Poise', 10],
        ],
      },
      {
        code: '103',
        name: 'CHUKCHAK (SELF INTRODUCTION)',
        criteria: [
          ['Humor and Wit', 10],
          ['Creativity and Originality', 10],
          ['Confidence and Stage Presence', 10],
          ['Delivery and Timing', 10],
          ['Audience Impact and Entertainment Value', 10],
        ],
      },
    ],
  },
  {
    name: 'OPENING SPEECH',
    advanceCount: 10,
    categories: [
      {
        code: '104',
        name: 'OPENING SPEECH',
        criteria: [
          ['Content and Message', 10],
          ['Confidence and Stage Presence', 10],
          ['Communication and Articulation', 10],
          ['Personality and Charisma', 10],
          ['Overall Impact and Impression', 10],
        ],
      },
    ],
  },
  {
    name: 'GOWN',
    advanceCount: 10,
    categories: [
      {
        code: '105',
        name: 'GOWN',
        criteria: [
          ['Gown Presentation', 10],
          ['Creativity and Wit', 10],
          ['Confidence and Stage Presence', 10],
          ['Styling and Overall Apperance', 10],
          ['Audience Impact and Entertainment Value', 10],
        ],
      },
    ],
  },
  {
    // Gown and Deba Teh shared the same ten candidates. The historical Top 5 used both categories,
    // but its exact weighting needs verification; the replay preserves the actual next-stage roster.
    name: 'DEBA TEH (DEBATE CHALLENGE)',
    advanceCount: null,
    categories: [
      {
        code: '106',
        name: 'DEBA TEH (DEBATE CHALLENGE)',
        // The old run graded one "Win or Lose" criterion 0-10 per candidate; that shape holds the replay ballots.
        criteria: [['Win or Lose', 10]],
      },
    ],
  },
  {
    name: 'WITTY QUESTION (TOP 5)',
    advanceCount: 3,
    categories: [
      {
        code: '107',
        name: 'WITTY QUESTION (TOP 5)',
        criteria: [
          ['Wit and Humor', 10],
          ['Intellegence and Relevance', 10],
          ['Spontaneity and Quick Thinking', 10],
          ['Confidence and Composure', 10],
          ['Communication and Audience Impact', 10],
        ],
      },
    ],
  },
  {
    name: 'FINAL QUESTION (TOP 3)',
    advanceCount: null,
    categories: [
      {
        code: '108',
        name: 'FINAL QUESTION (TOP 3)',
        criteria: [
          ['Content and Relevancce', 10],
          ['Depth of Thought and Wisdom', 10],
          ['Confidence and Composure', 10],
          ['Communication and Articulation', 10],
          ['Impact and Authenticity', 10],
        ],
      },
    ],
  },
];

/** number, country (the old "Name" column), person (the old "Department" column), flag photo file */
const CANDIDATES: [number, string, string, string][] = [
  [1, 'ANGOLA', 'CASSY MONTES', 'ao'],
  [2, 'ARGENTINA', 'KIANNA KAYE NOYNAY', 'ar'],
  [3, 'ARMENIA', 'VASTY GARRIDO', 'am'],
  [4, 'AUSTRALIA', 'CHEALSE TAGSIP', 'au'],
  [5, 'BAHAMAS', 'ANTON ESPINOSA SUICAN', 'bs'],
  [6, 'BANGLADESH', 'DIEONNE VELOSO MARQUEZ', 'bd'],
  [7, 'BELGIUM', 'JAY RENIEL BETUCO', 'be'],
  [8, 'BELIZE', 'VEXIS KAISEN', 'bz'],
  [9, 'BRAZIL', 'JUDE GABRIEL BUCABUCA', 'br'],
  [10, 'CHILE', 'NEIL ALVIN QUIJANO', 'cl'],
  [11, 'COTE DIVOIRE', 'JESHLY ALCALA JACINTO', 'ci'],
  [12, 'CUBA', 'JOSH ANDRIE SUDARIA', 'cu'],
  [13, 'DOMINICAN REPUBLIC', 'KLYF RAYNE REGANON', 'do'],
  [14, 'EGYPT', 'REYMART PIAMONTE', 'eg'],
  [15, 'GREECE', 'PETER PAUL SANTOS', 'gr'],
  [16, 'HONDURAS', 'BRYCE RESTITUTO', 'hn'],
  [17, 'HUNGARY', 'JHON PAUL CORTAL', 'hu'],
  [18, 'INDIA', 'REXLIE FEDELIS', 'in'],
  [19, 'ISRAEL', 'MARK JHAY BAGUION', 'il'],
  [20, 'JAMAICA', 'TIRSO TAMAYO', 'jm'],
  [21, 'JAPAN', 'JUDE MACARAYA', 'jp'],
  [22, 'KAZAKHSTAN', 'RJHAY BELIC', 'kz'],
  [23, 'KENYA', 'CLARK BALOTE', 'ke'],
  [24, 'LEBANON', 'FRANCKLIN GONZALES', 'lb'],
  [25, 'MALAYSIA', 'CALVIN LAURENTE', 'my'],
  [26, 'MEXICO', 'JESHRYL CAPUYAN', 'mx'],
  [27, 'MONGOLIA', 'ISAIAH CANON', 'mn'],
  [28, 'MOROCCO', 'KATHIANA GARCIA', 'ma'],
  [29, 'MYANMAR', 'TANYA FACUNDO', 'mm'],
  [30, 'NEPAL', 'JAY POY ANDREI POTOY', 'np'],
  [31, 'NIGERIA', 'VJ EJARES', 'ng'],
  [32, 'NETHERLANDS', 'JOSEPH', 'nl'],
  [33, 'NEW ZEALAND', 'SHANE GARCIA', 'nz'],
  [34, 'NORWAY', 'ANTHONY NOYA', 'no'],
  [35, 'PAKISTAN', 'MHIEKYLE TARRA', 'pk'],
  [36, 'PANAMA', 'KIMMY ESTRELLAR', 'pa'],
  [37, 'PARAGUAY', 'MARCO JOHN PEROLINO', 'py'],
  [38, 'PERO', 'REANAH', 'pe'],
  [39, 'PHILIPPINES', 'KURT LEE UBANA', 'ph'],
  [40, 'PORTUGAL', 'KIM BRLTRAN', 'pt'],
  [41, 'KOREA', 'FRANCE AARON', 'kr'],
  [42, 'ROMANIA', 'LOUIE SERDON', 'ro'],
  [43, 'SINGAPORE', 'KENNY MUANA', 'sg'],
  [44, 'SLOVAKIA', 'NATHAN JAMES', 'sk'],
  [45, 'SPAIN', 'JOSHUA ESMERO', 'es'],
  [46, 'SWEDEN', 'JAKE DADIS', 'se'],
  [47, 'THAILAND', 'ANGEL DELA RAMA', 'th'],
  [48, 'TURKIYE', 'REX CASTRO', 'tr'],
  [49, 'UKRAINE', 'RAFHY TURRION', 'ua'],
  [50, 'URAGUAY', 'EGUENE RUNA', 'uy'],
  [51, 'USA', 'JANCY SEMEROS', 'us'],
  [52, 'VIETNAM', 'JAYSON BENTOZAL', 'vn'],
];

/** The three judges of the real night. Login is the judge's name. */
const JUDGES: [name: string, password: string][] = [
  ['INDAY RYZA', 'judge1'],
  ['ROXY BANDEJO', 'judge2'],
  ['JOHN LEONARD MALAZARTE', 'judge3'],
];

// ---------- reading the old system's dump ----------

/** Pulls the VALUES tuples out of one table's mysqldump file. A parser just good enough for those dumps. */
function insertRows(sql: string, table: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  const needle = `INSERT INTO \`${table}\` VALUES `;
  let at = 0;
  while ((at = sql.indexOf(needle, at)) !== -1) {
    let i = at + needle.length;
    const n = sql.length;
    while (i < n && sql[i] !== '(') i += 1;
    while (i < n && sql[i] === '(') {
      const tuple: (string | null)[] = [];
      i += 1;
      for (;;) {
        while (i < n && ' \n\r\t'.includes(sql[i])) i += 1;
        if (sql[i] === ')') {
          i += 1;
          break;
        }
        if (sql[i] === "'") {
          i += 1;
          let buf = '';
          while (i < n) {
            const ch = sql[i];
            if (ch === '\\' && i + 1 < n) {
              const next = sql[i + 1];
              buf += next === 'n' ? '\n' : next === 'r' ? '\r' : next === 't' ? '\t' : next === '0' ? '' : next;
              i += 2;
              continue;
            }
            if (ch === "'") {
              if (sql[i + 1] === "'") {
                buf += "'";
                i += 2;
                continue;
              }
              i += 1;
              break;
            }
            buf += ch;
            i += 1;
          }
          tuple.push(buf);
        } else {
          let j = i;
          while (j < n && sql[j] !== ',' && sql[j] !== ')') j += 1;
          const token = sql.slice(i, j).trim();
          tuple.push(token === 'NULL' ? null : token);
          i = j;
        }
        while (i < n && ' \n\r\t'.includes(sql[i])) i += 1;
        if (sql[i] === ',') {
          i += 1;
          continue;
        }
        if (sql[i] === ')') {
          i += 1;
          break;
        }
      }
      rows.push(tuple);
      while (i < n && ' \n\r\t'.includes(sql[i])) i += 1;
      if (sql[i] === ',') {
        i += 1;
        while (i < n && ' \n\r\t'.includes(sql[i])) i += 1;
      }
    }
    at = i;
  }
  return rows;
}

async function findFile(haystacks: string[], label: string): Promise<string | null> {
  for (const candidate of haystacks) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // keep looking
    }
  }
  console.warn(`(no ${label} found in ${haystacks.join(', ')} - continuing without it)`);
  return null;
}

/**
 * The real ballots and the real per-category rosters from Hara2026Results.zip.
 * Score rows: id, judge name, candidate no, category code, old criterion id, points, is_testing, ...
 * Category membership rows: id, candidate no, category code, ...
 */
async function readOldDump(zipPath: string) {
  const zip = await JSZip.loadAsync(await fs.readFile(zipPath));
  const table = async (name: string) => {
    const key = Object.keys(zip.files).find((k) => k.endsWith(`tabulation_app_db_${name}.sql`));
    if (!key) throw new Error(`${zipPath} has no ${name} table`);
    return insertRows(await zip.files[key].async('string'), name);
  };

  const criteriaNameById = new Map<string, [code: string, name: string]>();
  for (const r of await table('criterias')) criteriaNameById.set(String(r[0]), [String(r[1]), String(r[2])]);

  const scores = (await table('scores'))
    .filter((r) => r[1] !== 'Admin' && r[6] === '0')
    .map((r) => {
      const criterion = criteriaNameById.get(String(r[4]));
      if (!criterion) throw new Error(`Old score ${r[0]} points at unknown criterion ${r[4]}`);
      return { judge: String(r[1]), candidateNo: Number(r[2]), code: String(r[3]), criterion, points: String(r[5]) };
    });

  const codes = STAGES.flatMap((stage) => stage.categories.map((category) => category.code));
  const rosters = new Map<string, Set<number>>();
  for (const code of codes) rosters.set(code, new Set());
  for (const r of await table('candidate_category_lists')) rosters.get(String(r[2]))!.add(Number(r[1]));

  return { scores, rosters };
}

// ---------- the event ----------

interface Structure {
  eventId: number;
  roundIds: number[];
  categoryIds: number[];
  judgeIds: Map<string, number>;
  candidateIds: Map<number, number>;
}

async function createStructure(name: string, replay: boolean, flagsDir: string | null): Promise<Structure> {
  const event = await prisma.event.create({ data: { name, date: EVENT_DATE, venue: VENUE } });

  const country = await prisma.group.create({
    data: { eventId: event.id, name: 'Country', values: { create: [...new Set(CANDIDATES.map((c) => c[1]))].map((n) => ({ name: n })) } },
    include: { values: true },
  });
  const countryByName = new Map(country.values.map((v) => [v.name, v.id]));

  const candidateIds = new Map<number, number>();
  for (const [number, nation, person, flag] of CANDIDATES) {
    const candidate = await prisma.candidate.create({
      data: {
        eventId: event.id,
        number,
        name: person,
        groupValues: { create: [{ groupValueId: countryByName.get(nation)! }] },
      },
    });
    candidateIds.set(number, candidate.id);
    if (flagsDir) {
      const photo = await fs.readFile(path.join(flagsDir, `${flag}.png`)).catch(() => null);
      if (photo) {
        await prisma.candidate.update({ where: { id: candidate.id }, data: { picturePath: await saveCandidatePicture(candidate.id, photo) } });
      } else {
        console.warn(`(no flag ${flag}.png - candidate ${number} ${person} has no photo)`);
      }
    }
  }

  const roundIds: number[] = [];
  const categoryIds: number[] = [];
  for (const [index, spec] of STAGES.entries()) {
    const isPairVote = Boolean(spec.pairVote) && !replay;
    const round = await prisma.round.create({
      data: {
        eventId: event.id,
        order: index + 1,
        name: spec.name,
        kind: isPairVote ? 'PAIR_VOTE' : 'SCORED',
        // A hand-decided cut leaves the field to the tabulator; the final stage sends nobody on.
        advanceCount: spec.advanceCount,
      },
    });
    roundIds.push(round.id);
    if (isPairVote) continue;
    for (const [order, category] of spec.categories.entries()) {
      const created = await prisma.category.create({
        data: {
          roundId: round.id,
          name: category.name,
          order,
          // Explicit shares only where the categories do not split the cut equally.
          weight: category.cutWeight ?? null,
          criteria: { create: category.criteria.map(([criterion, max], i) => ({ name: criterion, minPoints: 0, maxPoints: max, order: i })) },
        },
      });
      categoryIds.push(created.id);
    }
  }

  const judgeIds = new Map<string, number>();
  for (const [judgeName, password] of JUDGES) {
    const judge = await prisma.judge.create({
      data: { eventId: event.id, name: judgeName, passwordHash: await bcrypt.hash(password, 10), categories: { create: categoryIds.map((categoryId) => ({ categoryId })) } },
    });
    judgeIds.set(judgeName, judge.id);
  }

  return { eventId: event.id, roundIds, categoryIds, judgeIds, candidateIds };
}

async function replaceEvent(name: string, replace: boolean) {
  const existing = await prisma.event.findFirst({ where: { name }, select: { id: true } });
  if (!existing) return;
  if (!replace) throw new Error(`An event named "${name}" already exists. Re-run with --replace to start it over.`);
  await prisma.event.delete({ where: { id: existing.id } }); // everything under it cascades
}

/** The clean event: full structure, no scores. Everything starts as it would before the pageant. */
async function seedClean(flagsDir: string | null) {
  await replaceEvent(EVENT_NAME, FLAGS.replace);
  const structure = await createStructure(EVENT_NAME, false, flagsDir);
  await prisma.roundEntry.createMany({
    data: CANDIDATES.map(([number]) => ({ roundId: structure.roundIds[0], candidateId: structure.candidateIds.get(number)! })),
    skipDuplicates: true,
  });
  console.log(`\nClean event "${EVENT_NAME}" is ready (status "Setting up"):`);
  console.log(`  ${CANDIDATES.length} candidates with Country groups, ${STAGES.length} stages, ${JUDGES.length} judges`);
  console.log(`  Judges log in with their name and: ${JUDGES.map(([n, p]) => `${n}=${p}`).join(', ')}`);
  console.log('  The opening stage holds three categories judged over the same 52: PRODUCTION NUMBER,');
  console.log('  NATIONAL COSTUME and CHUKCHAK. Judges switch between them on one score sheet.');
  console.log('  Historical Top 20 and Top 5 cuts require manual field selection; automatic cuts do not reproduce them.');
  console.log('  Activate it on the Events screen when the rehearsal night starts.');
}

/**
 * The replay event: the real 2,940 ballots as confirmed scores and every stage closed exactly as the
 * night ran - including the top 20 for OPENING SPEECH, which the organizers picked by hand and no
 * score rule reproduces. Ranks come from this system's own tabulation so the reports are self-consistent.
 */
async function seedReplay(zipPath: string, flagsDir: string | null) {
  await replaceEvent(REPLAY_EVENT_NAME, FLAGS.replace);
  const { scores, rosters } = await readOldDump(zipPath);
  const structure = await createStructure(REPLAY_EVENT_NAME, true, flagsDir);

  // Old criterion identity (category code + name) to the new criterion ids.
  const newCriterionIds = new Map<string, number>();
  const categories = await prisma.category.findMany({
    where: { roundId: { in: structure.roundIds } },
    include: { criteria: true },
  });
  for (const category of categories) {
    const spec = STAGES.flatMap((s) => s.categories).find((c) => c.name === category.name && c.code)!;
    for (const criterion of category.criteria) newCriterionIds.set(`${spec.code}|${criterion.name}`, criterion.id);
  }

  const rows = scores.map((s) => {
    const judgeId = structure.judgeIds.get(s.judge);
    const candidateId = structure.candidateIds.get(s.candidateNo);
    const criterionId = newCriterionIds.get(`${s.code}|${s.criterion[1]}`);
    if (!judgeId || !candidateId || !criterionId) throw new Error(`Old score for ${s.judge} / no. ${s.candidateNo} / ${s.criterion[1]} does not map onto the new event`);
    return { judgeId, candidateId, criterionId, points: s.points, status: 'SUBMITTED' as const, isTest: false };
  });
  for (let i = 0; i < rows.length; i += 500) await prisma.score.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });

  // Close every stage in order, but keep the rosters the night actually had.
  for (const [index, spec] of STAGES.entries()) {
    const roundId = structure.roundIds[index];
    const codes = spec.categories.map((category) => category.code);
    const rosterNos = rosters.get(codes[0])!;
    for (const code of codes.slice(1)) {
      const other = rosters.get(code)!;
      if (other.size !== rosterNos.size || [...other].some((no) => !rosterNos.has(no))) {
        throw new Error(`Categories ${codes.join(', ')} were expected to share one field but their old rosters differ`);
      }
    }
    await prisma.roundEntry.createMany({
      data: [...rosterNos].map((no) => ({ roundId, candidateId: structure.candidateIds.get(no)! })),
      skipDuplicates: true,
    });
    const tab = await tabulateRound(roundId);
    if (tab.standings.length === 0) throw new Error(`No standings for ${spec.name}; the imported ballots are incomplete`);
    // The next stage's roster is the night's own: the top 20 was partly drawn by lot, and the top 5
    // followed the organizers' Gown + Deba Teh rule. Neither is a computed cut here.
    const nextNos = index + 1 < STAGES.length ? rosters.get(STAGES[index + 1].categories[0].code)! : null;
    const nextIds = nextNos ? new Set([...nextNos].map((no) => structure.candidateIds.get(no)!)) : null;
    await prisma.$transaction(
      tab.standings.map((s) =>
        prisma.roundEntry.update({
          where: { roundId_candidateId: { roundId, candidateId: s.candidateId } },
          data: { score: s.score, rank: s.rank, advanced: nextIds ? nextIds.has(s.candidateId) : null },
        }),
      ),
    );
    await prisma.round.update({ where: { id: roundId }, data: { status: 'CLOSED' } });
  }
  await prisma.event.update({ where: { id: structure.eventId }, data: { status: 'CLOSED' } });

  console.log(`\nReplay event "${REPLAY_EVENT_NAME}" is ready (finished):`);
  console.log(`  ${rows.length} real ballots imported as confirmed scores, rosters as the night ran (52 -> 52 -> 52 -> 20 -> 10 -> 10 -> 5 -> 3).`);
  console.log('  Check its category reports against the old printouts. Old raw sums out of their maxima:');
  console.log('    101 PRODUCTION        #21 JUDE MACARAYA 108.70 | #35 MHIEKYLE TARRA 107.50 | #20 TIRSO TAMAYO 106.80');
  console.log('    102 NATIONAL COSTUME  #21 JUDE MACARAYA 113.80 | #20 TIRSO TAMAYO 111.30 | #40 KIM BRLTRAN 110.00');
  console.log('    103 CHUKCHAK          #18 REXLIE FEDELIS 105.60 | #21 JUDE MACARAYA 104.60 | #20 TIRSO TAMAYO 104.30');
  console.log('    104 OPENING SPEECH    #21 JUDE MACARAYA 115.30 | #16 BRYCE RESTITUTO 107.10 | #22 RJHAY BELIC 106.70');
  console.log('    105 GOWN              #21 JUDE MACARAYA 130.30 | #22 RJHAY BELIC 123.80 | #20 TIRSO TAMAYO 121.50');
  console.log('    106 DEBA TEH          #28 KATHIANA GARCIA 26.50 | #16 BRYCE RESTITUTO 26.10 | #21 JUDE MACARAYA 25.80');
  console.log('    107 WITTY QUESTION    #21 JUDE MACARAYA 131.10 | #24 FRANCKLIN GONZALES 125.30 | #20 TIRSO TAMAYO 123.80');
  console.log('    108 FINAL QUESTION    #21 JUDE MACARAYA 129.90 | #24 FRANCKLIN GONZALES 117.60 | #20 TIRSO TAMAYO 65.70');
  console.log('  This system ranks each category out of 100 (the same orderings, different scale).');
}

/** CSV and photo ZIP shaped for the admin Candidates import screen (its template columns). */
async function emitImportFiles(flagsDir: string | null) {
  const dir = 'hara2026-import';
  await fs.mkdir(dir, { recursive: true });
  const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = ['Number,Name,Photo file,Country', ...CANDIDATES.map(([number, nation, person, flag]) => [number, person, `${flag}.png`, nation].map(cell).join(','))].join('\n');
  await fs.writeFile(path.join(dir, 'candidates.csv'), `${csv}\n`);

  const zip = new JSZip();
  let photos = 0;
  for (const [, , , flag] of CANDIDATES) {
    const photo = flagsDir ? await fs.readFile(path.join(flagsDir, `${flag}.png`)).catch(() => null) : null;
    if (photo) {
      zip.file(`${flag}.png`, photo);
      photos += 1;
    }
  }
  await fs.writeFile(path.join(dir, 'photos.zip'), await zip.generateAsync({ type: 'nodebuffer' }));
  console.log(`\nImport rehearsal files in ${dir}/: candidates.csv (${CANDIDATES.length} rows) and photos.zip (${photos} photos).`);
  console.log('Use them on the event\'s Candidates screen ("Import") and its "Photos from a ZIP" box.');
}

// ---------- entry point ----------

function parseArgs(argv: string[]) {
  const opts = { replay: false, emitImports: false, replace: false, zip: 'Hara2026Results.zip', flags: 'flags' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--replay') opts.replay = true;
    else if (arg === '--emit-imports') opts.emitImports = true;
    else if (arg === '--replace') opts.replace = true;
    else if (arg === '--zip') opts.zip = argv[++i];
    else if (arg === '--flags') opts.flags = argv[++i];
    else if (arg.startsWith('--zip=')) opts.zip = arg.slice('--zip='.length);
    else if (arg.startsWith('--flags=')) opts.flags = arg.slice('--flags='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: seed-hara2026 [--replay] [--emit-imports] [--replace] [--zip FILE] [--flags DIR]');
      console.log('See the header of src/seed-hara2026.ts and docs/hara2026-manual-setup.md.');
      process.exit(0);
    } else throw new Error(`Unknown option ${arg} (try --help)`);
  }
  return opts;
}

const FLAGS = parseArgs(process.argv.slice(2));

async function main() {
  // The dump and the flag photos live outside the API (repo root, the old system's folder); accept the
  // obvious places for both so the script works in Docker and from the repo.
  const zipPath = FLAGS.replay
    ? await findFile(
        [FLAGS.zip, path.resolve(FLAGS.zip), '../../Hara2026Results.zip', '../../../Hara2026Results.zip', '../../../react-tabulation-system/Hara2026Results.zip'],
        'old database dump (--zip)',
      )
    : null;
  const flagsDir = await findFile([FLAGS.flags, path.resolve(FLAGS.flags), '../../../Tabulation-System/public/flags'], 'flag photos (--flags)');
  if (FLAGS.replay && !zipPath) throw new Error('Replay needs Hara2026Results.zip. In Docker: docker compose cp Hara2026Results.zip api:/app/apps/api/');

  if (FLAGS.emitImports) await emitImportFiles(flagsDir);
  await seedClean(flagsDir);
  if (FLAGS.replay && zipPath) await seedReplay(zipPath, flagsDir);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
