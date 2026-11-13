# Development guide

## Setup

See the README for the two ways to run with hot reload: Node on your machine (`npm run dev`) or everything in Docker (`docker compose -f docker-compose.dev.yml up`).

What reloads:

- **web**: Vite hot module reload. Saving a component updates the browser without losing page state.
- **api**: `tsx watch` restarts the server on every save (about 1 second).
- In Docker on Windows, file events do not reach the container, so both use polling (`USE_POLLING`, `CHOKIDAR_USEPOLLING`).

If port 3000 is already used on your machine, set `API_PORT` (for example `3001`) in `.env` and in your shell before `npm run dev`. The Vite proxy follows `API_PORT`.

## Workspace layout

This is an npm workspaces monorepo. Run commands for one app with `-w`:

```bash
npm run test -w apps/api
```

Add a dependency to one app:

```bash
npm install <package> -w apps/web
```

npm 11 asks before running package install scripts. Approved ones are listed under `allowScripts` in the root `package.json` (Prisma and esbuild need theirs).

## Database changes

1. Edit `apps/api/prisma/schema.prisma`.
2. Create and apply a migration:

   ```bash
   npm run db:migrate -w apps/api -- --name short_description
   ```

3. Commit the new folder in `apps/api/prisma/migrations`.

## Adding an admin resource

Follow the candidates feature:

1. **Route**: `apps/api/src/routes/candidates.ts`. Validate with Zod, protect with `requireRole`, paginate lists.
2. **Mount** it in `apps/api/src/app.ts`.
3. **Screen**: `apps/web/src/pages/admin/CandidatesPage.tsx`, using `usePaginated` and `Pagination`.
4. **Route** it in `apps/web/src/App.tsx` and add a link in `AdminLayout.tsx`.
5. **Document** the endpoints in `docs/api.md`.

## Scoring engine

All tabulation math lives in `apps/api/src/scoring/index.ts` as pure functions. Add a unit test in `scoring.test.ts` for every new rule:

```bash
npm test
```

Database-backed API tests are opt-in and must use a dedicated disposable PostgreSQL database with
the migrations already applied. They create and remove their own test event; never point them at a
real event database:

```bash
TEST_DATABASE_URL='postgresql://user:password@localhost:5432/dedicated_test_db' npm test
```

The judge category-switching browser test uses mocked API responses and does not modify event data.
Install the `e2e/` dependencies and run it against a running web app:

```bash
cd e2e
BASE_URL=http://localhost:5173 npx playwright test tests/category-switch.spec.ts
```

## Conventions

- TypeScript strict mode in both apps.
- Validate every request body and query with Zod.
- Plain language in UI text and docs.
- Keep pageant-specific rules out of code; make them event settings.
