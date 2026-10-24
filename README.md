# React Tabulation System

A general, web-based tabulation system for pageants and contests. Judges score candidates from their own PCs over the venue LAN, and the server computes rankings and reports as soon as scores come in.

Nothing is hardcoded to one pageant. Each event sets its own rounds, cut-offs (Top N), candidate groups, criteria and scoring method.

The flow is kept simple: **judges input scores, the system calculates, the admin shows the report.**

**Product requirements:** [docs/PRD.md](docs/PRD.md) covers the goals, roles, scoring rules, reports, the first event (Hara ng ACLC Ormoc 2026) as an example configuration, and the open questions.

## Features

- **Admin**: manage events, candidates (with pictures), rounds, categories, criteria and judges; bulk import from CSV or Excel; reports by candidate, judge, category and overall.
- **Judge**: log in with their name and a password set by the Admin, then score candidates by category.
- **General scoring engine**: average or rank-sum scoring, weights, carry-over between rounds, drop highest and lowest, tie detection at the cut line. See [docs/scoring.md](docs/scoring.md).
- **Built for large fields**: server-side pagination, debounced search, WebP thumbnails, lazy-loaded images and memoized score rows keep screens smooth with hundreds of candidates. See [docs/performance.md](docs/performance.md).
- **Testing mode**: rehearse with fake scores. Judges get `Shift + J` (random scores) and `Shift + P` (perfect scores) shortcuts, and **Start over** clears the rehearsal.
- **Go live / Finish event**: judges can log in only to the one live event.
- **Runs offline**: one server PC runs everything in Docker; client PCs only need a browser.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router |
| Backend | Node.js, Express, TypeScript, Zod |
| Database | PostgreSQL 16 with Prisma ORM |
| Images | Multer uploads, Sharp resizing to WebP |
| Deployment | Docker Compose: nginx (web), Node (api), PostgreSQL (db) |

## Database

Everything belongs to an **event**. The core of the data is a **score**: one judge's points for one candidate on one criterion. Rounds narrow the field through `RoundEntry`, and pair-vote rounds (such as Deba Teh) use `Pair` and `PairVote` instead of scores.

![Tally database relationships, animated](docs/erd.svg)

<details>
<summary>Full entity relationship diagram (every table and key field)</summary>

```mermaid
erDiagram
  Event ||--o{ Group : "groups candidates by"
  Group ||--o{ GroupValue : has
  Event ||--o{ Candidate : enters
  Candidate ||--o{ CandidateGroupValue : "belongs to"
  GroupValue ||--o{ CandidateGroupValue : "is held by"
  Event ||--o{ Round : runs
  Round ||--o{ RoundEntry : "fields"
  Candidate ||--o{ RoundEntry : "competes in"
  Round ||--o{ Category : contains
  Category ||--o{ Criterion : "scored on"
  Event ||--o{ Judge : seats
  Judge ||--o{ JudgeCategory : "assigned to"
  Category ||--o{ JudgeCategory : "judged by"
  Judge ||--o{ Score : gives
  Candidate ||--o{ Score : receives
  Criterion ||--o{ Score : "measured by"
  Round ||--o{ Pair : "pairs up"
  Candidate ||--o{ Pair : "is paired in"
  Pair ||--o{ PairVote : "decided by"
  Judge ||--o{ PairVote : casts
  Event ||--o{ AuditLog : records

  Event {
    int id PK
    string name
    datetime date
    string venue
    enum status "DRAFT, ACTIVE, CLOSED"
    boolean testingMode
  }
  Group {
    int id PK
    int eventId FK
    string name
  }
  GroupValue {
    int id PK
    int groupId FK
    string name
  }
  Candidate {
    int id PK
    int eventId FK
    int number "unique per event"
    string name
    string picturePath
  }
  CandidateGroupValue {
    int candidateId PK, FK
    int groupValueId PK, FK
  }
  Round {
    int id PK
    int eventId FK
    int order
    string name
    enum kind "SCORED, PAIR_VOTE"
    enum scoreMethod "AVERAGE, RANK_SUM"
    int advanceCount "Top N"
    decimal carryOverWeight
    boolean dropExtremes
    enum tieBreak
    enum status "PENDING, OPEN, CLOSED"
  }
  RoundEntry {
    int roundId PK, FK
    int candidateId PK, FK
    boolean advanced
    decimal score
    int rank
  }
  Category {
    int id PK
    int roundId FK
    string name
    decimal weight
  }
  Criterion {
    int id PK
    int categoryId FK
    string name
    decimal minPoints
    decimal maxPoints
    decimal weight
  }
  Judge {
    int id PK
    int eventId FK
    string name "also the username"
    string passwordHash
  }
  JudgeCategory {
    int judgeId PK, FK
    int categoryId PK, FK
  }
  Score {
    int id PK
    int judgeId FK
    int candidateId FK
    int criterionId FK
    decimal points
    enum status "DRAFT, SUBMITTED"
    boolean isTest
  }
  Pair {
    int id PK
    int roundId FK
    int candidateAId FK
    int candidateBId FK
  }
  PairVote {
    int id PK
    int pairId FK
    int judgeId FK
    int winnerId FK
    enum status "DRAFT, SUBMITTED"
    boolean isTest
  }
  AuditLog {
    int id PK
    int eventId FK
    string actor
    string action
    json details
  }
  AdminUser {
    int id PK
    string username
    string passwordHash
  }
```

</details>

More detail: [docs/data-model.md](docs/data-model.md) and the schema in [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma).

## Quick start (event server)

Requirements: Docker Desktop (Windows uses WSL2) or Docker Engine on Linux.

```bash
cp .env.example .env
```

Edit `.env` and set real values for `POSTGRES_PASSWORD`, `JWT_SECRET` and `ADMIN_PASSWORD`.

```bash
docker compose up -d --build
```

Open `http://<server-ip>` from any PC on the same network and log in as the admin from `.env`. Full event-day steps, firewall and backups are in [docs/deployment.md](docs/deployment.md).

## Development (hot reload)

### Option A: Node on your machine

Requirements: Node.js 20 or newer, and a PostgreSQL database (the `db` service from the dev compose file works).

```bash
npm install
```

```bash
docker compose -f docker-compose.dev.yml up -d db
```

```bash
cp .env.example .env
```

Set `DATABASE_URL=postgresql://tabulation:devpassword@localhost:5432/tabulation` and `POSTGRES_PASSWORD=devpassword` in `.env`, then:

```bash
npm run db:deploy -w apps/api
```

```bash
npm run seed -w apps/api
```

```bash
npm run dev
```

The web app runs at http://localhost:5173 with Vite hot module reload, and the API restarts on every save.

### Option B: everything in Docker

```bash
docker compose -f docker-compose.dev.yml up
```

Source is mounted into the container and file changes are picked up by polling, so hot reload works on Windows too. Open http://localhost:5173 and log in as `admin` / `admin12345`.

More detail: [docs/development.md](docs/development.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API and web together with hot reload |
| `npm run build` | Production build of both apps |
| `npm test` | Scoring engine unit tests |
| `npm run typecheck` | TypeScript checks for both apps |
| `npm run db:migrate -w apps/api` | Create a migration after editing `schema.prisma` |
| `npm run db:deploy -w apps/api` | Apply migrations |
| `npm run db:studio -w apps/api` | Browse the database in Prisma Studio |

## Project structure

```text
apps/
  api/                 Express + Prisma REST API
    prisma/            schema.prisma and migrations
    src/scoring/       pure scoring engine with unit tests
    src/routes/        auth, events, candidates
    src/lib/           Prisma client, image processing
  web/                 React + Vite frontend
    src/pages/         login, admin screens, judge score sheet
    src/components/    Pagination, CandidatePhoto
    src/hooks/         usePaginated, useDebounced, useAutoInputShortcuts
docs/                  architecture, scoring, performance, deployment, API
docker-compose.yml     production stack for the event server
docker-compose.dev.yml development stack with hot reload
```

## Documentation

- [Product requirements (PRD)](docs/PRD.md)
- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Scoring methods](docs/scoring.md)
- [Performance with many candidates](docs/performance.md)
- [API reference](docs/api.md)
- [Deployment and event day](docs/deployment.md)
- [Development guide](docs/development.md)
- [Design](docs/design.md)
- [Roadmap](docs/roadmap.md)

## Demo data

Load a sample event shaped like Hara ng ACLC Ormoc 2026 (60 candidates in 3 houses and 2 levels, 6 rounds, 5 judges with password `judge1234`):

```bash
npm run seed:demo -w apps/api
```

In the Docker dev stack:

```bash
docker compose -f docker-compose.dev.yml exec app npm run seed:demo -w apps/api
```

All names, houses, criteria and weights in it are sample data.

## Status

Working today: login; the admin screens for events, the event overview with its cut ladder, candidates (photos, groups, pagination), groups, rounds and criteria, and judges; judges scoring with auto-save and submit; pair-vote rounds such as Deba Teh; and opening, watching and closing rounds so the Top N move on. Reports cover the overall ranking with titles, each round, each candidate and each judge, split by any group, printable and exportable to Excel. Deductions are handled on paper, outside the system. Candidates import from CSV or Excel, with photos from a ZIP. See the [roadmap](docs/roadmap.md) and the [design notes](docs/design.md).
