# ACLC Ormoc Tabulation System

The tabulation system of ACLC College of Ormoc City for its pageants and contests. Judges score candidates from their own PCs over the campus LAN, and the server computes rankings and reports as soon as scores come in. Hara ng ACLC Ormoc 2026 is the first event run on it.

Nothing is hardcoded to one event. Each event sets its own rounds, cut-offs (Top N), candidate groups, criteria and scoring method. The school's name, seal and colour are set once in **Settings** and appear on every screen and every event's printed reports. The software itself is called Tally, and another school could run it with its own branding.

The flow is kept simple: **judges input scores, the system calculates, the admin shows the report.**

**Setting it up?** Follow the [setup guide](#setup-guide-fresh-windows-pc): from installing the prerequisites on a fresh Windows PC to the first login.

**Product requirements:** [docs/PRD.md](docs/PRD.md) covers the goals, roles, scoring rules, reports, the first event (Hara ng ACLC Ormoc 2026) as an example configuration, and the open questions.

## Preview

| | |
| --- | --- |
| ![Login with the school's seal](docs/screenshots/34-login-branded.png) | ![Printed report with the school's letterhead](docs/screenshots/25b-report-printed.png) |
| **Login**: the school's seal and the event that is live now. | **Printed reports**: the school's letterhead, then the event. |
| ![Admin overview with live standings](docs/screenshots/18-overview-all-submitted.png) | ![Judge score sheet](docs/screenshots/15-judge-sheet-typing.png) |
| **Admin overview**: live standings and who has submitted, no page reload. | **Judge score sheet**: totals out of 100 as scores are typed. |
| ![Pair vote](docs/screenshots/22-judge-pair-voted.png) | ![Overall ranking report](docs/screenshots/25-report-overall.png) |
| **Pair vote**: the judge picks a winner in each pair. | **Reports**: overall ranking with titles, print or Excel. |
| ![Candidates with photos](docs/screenshots/05-candidates.png) | ![Rounds and criteria](docs/screenshots/10-rounds.png) |
| **Candidates**: paginated, searchable, with photos. | **Rounds and criteria**: cut-offs, points and weights. |

Every screen, arranged by user journey (admin setup, judge scoring, running the event, results), taken by the Playwright end-to-end test: [docs/screenshots.md](docs/screenshots.md).

## Features

- **Admin**: manage events, candidates (with pictures), rounds, categories, criteria and judges; bulk import from CSV or Excel; reports by candidate, judge, category and overall.
- **Judge**: log in with their name and a password set by the Admin, then score candidates by category.
- **General scoring engine**: average or rank-sum scoring, weights, carry-over between rounds, drop highest and lowest, tie detection at the cut line. See [docs/scoring.md](docs/scoring.md).
- **Built for large fields**: server-side pagination, debounced search, WebP thumbnails, lazy-loaded images and memoized score rows keep screens smooth with hundreds of candidates. See [docs/performance.md](docs/performance.md).
- **Testing mode**: rehearse with fake scores. Judges get `Shift + J` (random scores) and `Shift + P` (perfect scores) shortcuts, and **Start over** clears the rehearsal.
- **Go live / Finish event**: judges can log in only to the one live event.
- **School branding**: the school's seal, name and colour, set once in Settings, on the login page, every screen, the browser tab and the letterhead of every printed report.
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

## Setup guide (fresh Windows PC)

These steps take a new Windows PC to the first login. They need internet; the event itself does not. Do them on the PC that will be the **server**: the one that runs the system. Judges' PCs need nothing installed, only a browser.

**What you need**

- Windows 10 (version 22H2) or Windows 11, 64-bit, with an administrator account
- 8 GB RAM or more, and about 10 GB of free disk space
- Virtualization turned on in the BIOS (most PCs have it on; step 1 tells you if it is not)
- A wired connection to the same network (router or switch) as the judges' PCs

All commands below are typed in **PowerShell**. To open it as administrator: press Start, type `PowerShell`, right-click **Windows PowerShell**, choose **Run as administrator**.

### Step 1. Turn on WSL 2

Docker runs on WSL 2 (Windows Subsystem for Linux). In PowerShell as administrator:

```powershell
wsl --install
```

Restart the PC when it finishes, then check it:

```powershell
wsl --status
```

It should say the default version is 2. If it says virtualization is not enabled, restart into the BIOS (usually F2, F10 or Del at power on) and turn on **Intel VT-x** or **AMD SVM**, then run `wsl --install` again.

### Step 2. Install Docker Desktop

1. Download **Docker Desktop for Windows** from https://www.docker.com/products/docker-desktop/
2. Run the installer and keep **Use WSL 2 instead of Hyper-V** ticked. Sign out and back in (or restart) when it asks.
3. Open Docker Desktop from the Start menu and accept its terms. Wait until it says **Engine running**.
4. In Docker Desktop, open **Settings > General** and tick **Start Docker Desktop when you sign in**, so the system comes back by itself after a restart.

Check it in a new PowerShell window:

```powershell
docker --version
```

```powershell
docker compose version
```

```powershell
docker run --rm hello-world
```

The last one prints "Hello from Docker!" when everything works.

### Step 3. Install Git

Download **Git for Windows** from https://git-scm.com/download/win and install it with the default options. Check it in a new PowerShell window:

```powershell
git --version
```

No Git? You can skip this step and download the code as a ZIP in step 4 instead.

### Step 4. Get the code

```powershell
cd C:\
```

```powershell
git clone https://github.com/baicoders/react-tabulation-system.git
```

```powershell
cd C:\react-tabulation-system
```

Without Git: on https://github.com/baicoders/react-tabulation-system press **Code > Download ZIP**, extract it to `C:\react-tabulation-system`, and `cd` into that folder.

### Step 5. Create the settings file (`.env`)

```powershell
Copy-Item .env.example .env
```

Make three random secrets. Run this three times and copy each result somewhere safe:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
```

Open the file:

```powershell
notepad .env
```

Change these lines, then save and close Notepad:

| Setting | What to put |
| --- | --- |
| `POSTGRES_PASSWORD` | The first random secret. The database password; nobody types it. |
| `JWT_SECRET` | The second random secret. Signs logins; nobody types it. |
| `ADMIN_USERNAME` | The admin's login name, for example `admin` |
| `ADMIN_PASSWORD` | The admin's password. Pick one the tabulator can type; you can use the third secret. |
| `WEB_PORT` | Leave `80` unless another program uses port 80 (see Troubleshooting). |

Use letters and numbers only in the passwords: symbols such as `@`, `:` or `/` break the database address. The admin account is created from `ADMIN_USERNAME` and `ADMIN_PASSWORD` the first time the system starts; changing them later does not change an existing account.

### Step 6. Start the system

```powershell
docker compose up -d --build
```

The first run downloads and builds everything, which takes 5 to 15 minutes. Then check that all three parts are up:

```powershell
docker compose ps
```

`db`, `api` and `web` should all show `running` (or `Up`). The API's log should say it created the admin:

```powershell
docker compose logs api
```

Open http://localhost on the server PC. The login page should appear.

### Step 7. Give the server a fixed IP address

Judges' PCs reach the server by its IP address, so it must not change. Find the current one:

```powershell
ipconfig
```

Note the **IPv4 Address** of the wired adapter, for example `192.168.1.10`. Then keep it fixed in one of two ways:

- **In the router (best):** open the router's admin page and add a **DHCP reservation** for the server PC with that address.
- **On the PC:** Settings > Network & internet > Ethernet > IP assignment > **Edit** > Manual, IPv4 on, and enter the same IP, subnet mask (usually `255.255.255.0`), gateway (the router, usually ending in `.1`) and DNS.

### Step 8. Let judges' PCs in through the firewall

Windows blocks incoming connections by default. First make sure the network is set to **Private**:

```powershell
Get-NetConnectionProfile
```

If `NetworkCategory` says `Public`, change it (use the `InterfaceAlias` shown, often `Ethernet`), in PowerShell as administrator:

```powershell
Set-NetConnectionProfile -InterfaceAlias "Ethernet" -NetworkCategory Private
```

Then allow the web port (change `80` if you changed `WEB_PORT`):

```powershell
New-NetFirewallRule -DisplayName "ACLC Ormoc Tabulation" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Private
```

### Step 9. Check from a judge's PC

On another PC on the same network, open a browser and go to the server's address, for example `http://192.168.1.10` (add `:8080` or your port if `WEB_PORT` is not 80). The login page should appear. Bookmark it on every judge's PC.

### Step 10. First login and branding

1. On the login page choose **Admin** and log in with `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `.env`.
2. Open **Settings** and set the system name, the school's full name, the seal (a square PNG with a transparent background prints best) and the brand colour.
3. Open **All events > New event** and set up the first event. The checklist in [docs/deployment.md](docs/deployment.md) walks through groups, candidates, rounds, judges, a rehearsal in testing mode and the event day itself.

Want sample data to practise on first? This adds a demo event with 60 candidates, 6 rounds and 5 judges (password `judge1234`):

```powershell
docker compose exec api node dist/seed-demo.js
```

### Troubleshooting

| Problem | Fix |
| --- | --- |
| `docker` is not recognized | Docker Desktop is not installed or the PowerShell window was opened before installing. Open a new window; start Docker Desktop and wait for **Engine running**. |
| `error during connect` or `cannot find the file specified` | Docker Desktop is not running. Start it from the Start menu and wait for **Engine running**. |
| WSL says virtualization is not enabled | Turn on Intel VT-x or AMD SVM in the BIOS (step 1). |
| `port is already allocated` or `address already in use` | Another program uses port 80 (often IIS or Skype). Set `WEB_PORT=8080` in `.env`, run `docker compose up -d` again, use port 8080 in the firewall rule, and open `http://<server-ip>:8080`. |
| `Set POSTGRES_PASSWORD in .env` (or `JWT_SECRET`, `ADMIN_PASSWORD`) | That line in `.env` is missing or empty. Fill it in (step 5) and start again. |
| Judges' PCs cannot open the page | Check the IP with `ipconfig`, that the network is Private and the firewall rule exists (step 8), and that both PCs are on the same network. Try `http://<server-ip>` from the server PC itself first. |
| `api` keeps restarting | Run `docker compose logs api`. Usually a password with a symbol in `.env`; use letters and numbers only. |
| Cannot log in as admin | The account was created with the values from the first start. Check `.env`; if the password was changed afterwards, set a new `ADMIN_USERNAME` and run `docker compose up -d` to create that admin. |

### Updating to a new version

```powershell
cd C:\react-tabulation-system
```

```powershell
git pull
```

```powershell
docker compose up -d --build
```

Database changes are applied automatically when the API starts, and the data stays. Take a backup first (see [docs/deployment.md](docs/deployment.md)).

### On Linux

Install Docker Engine and the Compose plugin (https://docs.docker.com/engine/install/), then follow steps 4 to 10 with `cp .env.example .env` instead of `Copy-Item`, `openssl rand -hex 20` for the secrets, and your distribution's firewall (for example `sudo ufw allow 80/tcp`).

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
| `cd e2e && npx playwright test` | End-to-end test of a running stack, refreshes the screenshots ([e2e/README.md](e2e/README.md)) |
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
e2e/                   Playwright end-to-end tests
docs/                  architecture, scoring, performance, deployment, API, screenshots
docker-compose.yml     production stack for the event server
docker-compose.dev.yml development stack with hot reload
```

## Documentation

- [Product requirements (PRD)](docs/PRD.md)
- [Screenshots and user journeys](docs/screenshots.md)
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
