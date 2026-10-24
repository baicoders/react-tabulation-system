# Roadmap

## Done (scaffold)

- [x] Monorepo with React + Vite web app and Express + Prisma API
- [x] Docker Compose for production and for development with hot reload
- [x] Full database schema and first migration
- [x] Admin and judge login with JWT
- [x] Events CRUD
- [x] Candidates CRUD with server-side pagination, search and picture upload (WebP thumbnails)
- [x] Scoring engine: average, rank-sum, carry-over, drop extremes, ranks, Top N with tie detection
- [x] Judge score sheet prototype with pagination, memoized rows and `Shift + J` / `Shift + P`

## Done (admin screens)

- [x] Tally shell: tinted frame, white sheet, event switcher, phone menu (taste-skill framed-sheet style, see [design](design.md))
- [x] Events list with status tabs and search
- [x] Event overview with the cut ladder, judge progress and candidates by group
- [x] Candidates per event with group columns, group filter, photo upload and pagination
- [x] Groups and group values (Type, House, Level, ...)
- [x] Rounds with cut, method, carry-over, tie-break; categories and criteria with weight check
- [x] Judges with password set by the Admin
- [x] Demo seed shaped like Hara ng ACLC Ormoc 2026 (`npm run seed:demo -w apps/api`)

## Done (judging)

- [x] Score API: debounced draft auto-save, range checks, submit and lock per category
- [x] Judge score sheet on the API: paginated, totals out of 100 per row, testing shortcuts that save
- [x] Open a round, live judge progress and standings (refresh every 5 seconds), close with Top N and tie check, reopen
- [x] Let a judge change submitted scores; delete test scores

- [x] Pair-vote rounds (Deba Teh): pairs by rank or random draw, judges pick winners and submit, live tally, close sends the pair winners on

## Done (reports)

- [x] Overall ranking with Champion and 1st to 3rd Runner-up, provisional until the final round closes
- [x] By round (category breakdown, who went on), by candidate (every judge's points) and by judge (check sheet)
- [x] Split any ranking by group value (a champion per house, level or type)
- [x] Print layout with signature lines, and Excel export

## Decided: deductions stay on paper

Deductions are done on paper by the organizers, not in the system. A judge or committee can argue over a deduction without touching a stored score; the system only holds the judges' scores. The screen was removed; the two database tables stay unused.

## Done (finishing touches)

- [x] Go live and Finish event on the event overview (one live event at a time)
- [x] Start over for rehearsals (testing mode only)
- [x] Round form shows only name, judging type and Top N; the rest is under More settings

## Done (import)

- [x] Bulk import of candidates from CSV or Excel with a checked preview and a template with the event's groups
- [x] Photos from a ZIP matched by photo column, number or name, uploaded with progress

## Done (judge assignment)

- [x] Judges screen grid: tick which rounds (categories) each judge scores, with a count per round and a warning when one has no judge
- [x] Locked for closed rounds; an unassigned judge sees which open round they sit out

## Next

- [ ] Reset real scores by judge or for a whole round from the screen (testing mode, its banner and the test-score reset are done)
- [ ] Live report refresh while judges submit
- [ ] One-click backup from the Admin screen
