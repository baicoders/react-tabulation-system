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

## Next

- [ ] Groups and group values screen (Type, House, Level, ...)
- [ ] Rounds, categories and criteria screens with weights and cut-offs
- [ ] Judges CRUD with category assignment
- [ ] Bulk import from CSV and Excel with preview, plus pictures from a ZIP matched by file name
- [ ] Score API: draft auto-save (debounced), submit and lock per category
- [ ] Wire the judge score sheet to the API, with testing mode from the event
- [ ] Pair-vote round screen (e.g. Deba Teh) with live tally
- [ ] Deduction rules and deductions screen
- [ ] Close round: rank, show Top N and ties, confirm who advances
- [ ] Reports: by candidate, judge, category and overall, split by any group; PDF and Excel export
- [ ] Testing mode banner and score reset (all, by category, by judge, test only) with audit log
- [ ] Live report refresh while judges submit
- [ ] One-click backup from the Admin screen
