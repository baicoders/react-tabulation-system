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

Checklist:

- [ ] Server PC on wired LAN, sleep disabled
- [ ] Every judge PC opens the login page
- [ ] Testing mode rehearsal done, then turned off and test scores reset
- [ ] Backup taken before the first round

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
