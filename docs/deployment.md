# Deployment and event day

The whole system runs on one server PC with Docker Compose. Client PCs connect over the venue LAN; no internet is needed during the event.

## Server PC requirements

- Windows 10/11 with Docker Desktop (WSL2 backend), or Linux with Docker Engine
- 8 GB RAM or more, wired LAN connection
- A fixed LAN IP address (set it in the router or the network adapter), e.g. `192.168.1.10`

## First setup (before event day, with internet)

1. Clone the repository on the server PC.
2. Create the environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env`: set strong values for `POSTGRES_PASSWORD`, `JWT_SECRET` (32+ random characters) and `ADMIN_PASSWORD`. Change `WEB_PORT` if port 80 is already used.
4. Build and start:

   ```bash
   docker compose up -d --build
   ```

   This downloads and builds all images, so do it while you still have internet.
5. On Windows, allow inbound TCP on the web port (80 by default) in Windows Defender Firewall for private networks.
6. From another PC, open `http://192.168.1.10` (your server IP) and log in as the admin.

## On event day

```bash
docker compose up -d
```

The containers use `restart: unless-stopped`, so they also come back on their own after a reboot once Docker starts.

The whole night is three steps: **judges input scores, the system calculates, the admin shows the report.** Deductions are not entered in the system; the organizers handle them on paper.

### The day before: set up

- [ ] Create the event (date, venue).
- [ ] **Event details**: the organization's name, its logo (a square PNG with a transparent background prints best) and its colour. Print one report to check the letterhead.
- [ ] Groups: for example House and Level.
- [ ] Candidates: Import, then Download template, fill it in, import it, then the photo ZIP. Check the count and the photos.
- [ ] Rounds in order with their Top N, and each round's criteria. Every round must show "Weights add up to 100%".
- [ ] Judges with their passwords. On the Judges screen no round may show "None".
- [ ] On the event overview, press **Go live** so judges can log in.

### One hour before: rehearse

- [ ] **Turn on testing mode** and **Open** the first round.
- [ ] Each judge logs in on their own PC and presses Shift + J, then Submit.
- [ ] Check that progress and standings show on the overview.
- [ ] Press **Start over**, then **Turn off testing mode**. The "Testing mode on" badge must be gone.
- [ ] Take a backup (see Backups below).

### During the show: each round

- [ ] **Open** the round when its segment starts. For a pair-vote round (Deba Teh), set the pairs first.
- [ ] Wait until every judge shows "Submitted".
- [ ] **Close** the round. If candidates tie at the cut, the screen asks whether all of them go on.
- [ ] Announce who goes on from the standings or the round report.

### After the final round

- [ ] Reports, Overall ranking: check it says "Final", then **Print** for the judges to sign.
- [ ] **Download Excel** of the overall ranking and each round.
- [ ] Press **Finish event**, then take a last backup and copy out the photos.

### If something goes wrong

| Problem | What to do |
| --- | --- |
| A judge's PC freezes | Scores are saved every half second. Log in on any other PC and carry on |
| A judge typed a wrong score and already submitted | On the overview, press **Allow changes** under their name; they fix it and submit again |
| A round was closed too early | **Reopen** it, as long as the next round has not started |
| The server PC restarts | The app comes back by itself once Docker is running |

## Backups

Start the nightly backup service (writes to `./backups`):

```bash
docker compose --profile backup up -d backup
```

Take a backup right now:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F c' > backups/manual.dump
```

Restore a backup (replaces current data):

```bash
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < backups/manual.dump
```

Candidate pictures live in the `uploads` Docker volume. Copy them out with:

```bash
docker compose cp api:/app/apps/api/uploads ./backups/uploads
```

## Updating

```bash
git pull
```

```bash
docker compose up -d --build
```

Database migrations run automatically when the API container starts.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `port is already allocated` | Another app uses the port. Set `WEB_PORT` in `.env`, e.g. `8090` |
| Clients cannot connect | Check the server IP, the firewall rule, and that all PCs are on the same network |
| API keeps restarting | `docker compose logs api`; usually a wrong value in `.env` |
| Forgot admin password | Change `ADMIN_USERNAME` to a new name and restart; the seed creates that admin |
| Photo upload says "over 25 MB" | Use a smaller copy; the server shrinks every photo anyway |
| Want sample data for a rehearsal | `docker compose exec api node dist/seed-demo.js` adds a demo event with 60 candidates |
