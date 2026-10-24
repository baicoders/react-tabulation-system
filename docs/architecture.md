# Architecture

The system is a web app served from one server PC on the venue LAN. Admin and judge PCs only need a browser.

```text
 Admin PC (browser) ─┐
                     ├── HTTP over LAN ──> Server PC (Docker Compose)
 Judge PCs (browser) ┘                      ├── web: nginx serves the React build, proxies /api and /uploads
                                            ├── api: Node.js + Express REST API, scoring engine, image processing
                                            └── db:  PostgreSQL 16 (named volume)
```

## Request flow

1. The browser loads the React app from nginx.
2. The app calls `/api/...`. nginx forwards those calls to the `api` container.
3. The API checks the JWT, validates input with Zod, and reads or writes PostgreSQL through Prisma.
4. Candidate pictures are stored on the `uploads` volume and served at `/uploads/...` with long cache headers.

## Roles

| Role | Can do |
| --- | --- |
| Admin | Everything: events, candidates, rounds, criteria, judges, reports, testing mode, score resets |
| Judge | Score candidates in the categories assigned to them, in the active event only |

Roles are checked on the server for every route (`requireRole` in `apps/api/src/middleware/auth.ts`). The frontend hides screens by role too, but that is only for convenience.

## Design rules

- **Rules are data.** Rounds, cut-offs, groups, criteria and scoring method are rows in the database, set per event. Adding a new pageant should never need a code change.
- **The scoring engine is pure.** `apps/api/src/scoring` has no database access, so every rule has a unit test.
- **The server does the heavy work.** Paging, filtering, ranking and image resizing happen on the server, so client PCs stay fast even if they are old.
- **Offline first.** No CDN or external service is needed during the event.

## Live updates

Screens update without reloading the page. When something changes in an event (a judge saves a score, the tabulator closes a round), the API pushes a short notice over Server-Sent Events to every screen open on that event, and each screen fetches only the data it shows:

| Screen | Updates live when |
| --- | --- |
| Event overview | A judge saves or submits, votes come in, a round opens or closes. Shows "Live, updated <time>" |
| Judges | Submissions and assignment changes |
| Reports | Any change; the old table stays on screen until the new numbers arrive |
| Judge's score sheet | A round opens or closes, testing mode changes, or the tabulator lets the judge change scores |

If the connection drops, the overview says "Reconnecting" and asks for fresh data every 15 seconds until the stream is back. The stream lives in one API process (an in-memory event bus), which fits one server PC.
