# Roadmap

## Done (scaffold)

- [x] Monorepo with React + Vite web app and Express + Prisma API
- [x] Docker Compose for production and for development with hot reload
- [x] Full database schema and first migration
- [x] Admin and judge login with JWT
- [x] Events CRUD
- [x] Candidates CRUD with server-side pagination, search and picture upload (WebP thumbnails)
- [x] Scoring engine: average, rank-sum, carry-over, drop extremes, deductions, ranks, Top N with tie detection
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
- [x] By round (category breakdown, deductions, who went on), by candidate (every judge's points) and by judge (check sheet)
- [x] Split any ranking by group value (a champion per house, level or type)
- [x] Print layout with signature lines, and Excel export

## Next

- [ ] Assign judges to some categories only (the API supports it; the screen gives every judge every category)
- [ ] Bulk import from CSV and Excel with preview, plus pictures from a ZIP matched by file name
- [ ] Deduction rules and deductions screen
- [ ] Testing mode banner and score reset (all, by category, by judge, test only) with audit log
- [ ] Live report refresh while judges submit
- [ ] One-click backup from the Admin screen
