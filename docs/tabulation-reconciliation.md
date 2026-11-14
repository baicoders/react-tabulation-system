# Tabulation reconciliation

**Status: agreed direction, not yet implemented.** The current behavior is documented in
[scoring.md](scoring.md); this document records the intended changes and the PR sequence.
Where the two differ, neither should be mistaken for the other.

**Foundation in progress:** scored categories have independent average rankings, and scored round
cuts combine those category averages with equal or explicit weights. Pair-vote rounds show outcomes
without ranking across pairs, and matching cuts advance pair winners; manual field selection handles
other cuts. Pair voting is still owned by rounds rather than categories. Rank-sum has been removed;
the reconciliation is not complete. PR #2's round-based basis is not part of this branch.
The HARA-specific seed script exists on the rehearsal branch; reconcile it when bringing the
rehearsal kit into the epic.

The shared scored-cut calculation now checks result units and ranking direction before combining.
Category-level pair voting and any future basis-writing or combined-report routes must apply the
same check before accepting or reporting a combination; those routes do not yet exist here.

PRs [#2](https://github.com/baicoders/react-tabulation-system/pull/2) (flexible cuts) and
[#3](https://github.com/baicoders/react-tabulation-system/pull/3) (HARA rehearsal kit) are
**reference material, not required designs or merge dependencies**. Reconcile their useful event
requirements and rehearsal data against the tabulator's decisions here; retain, redesign or omit
individual features as appropriate. In particular, the round-based cut-basis design is not the
target model. The decision to merge or close either PR remains with the project maintainers.

## Decisions

- A **round** is a stage with a candidate field and a possible cut. Its categories share that field.
- A **category** is an independently judged competition, with its own judge assignments, judging
  type (criteria scores or pair votes), and tie rules. Scored categories have their own criteria,
  ranking and award. Pair-vote categories show each pair's winner and vote count without creating
  an overall ranking across pairs. Retain individual judge scores and votes.
- Opening a round makes all its categories available to their assigned judges, including categories
  happening simultaneously. Judges submit each category independently.
- A cut uses categories grouped in that round, equally weighted by default, with optional weights.
  It does not turn the combined cut result into a category award. The tabulator can manually add
  candidates to the advancing field. Rank candidates according to their existing scores, and make
  ties discoverable to tabulators so they can notify judges or organizers. Do not automatically
  decide tied candidates' advancement without an agreed rule.
- For a cut based on a pair-vote category, automatically advance each pair's winner when the
  requested advancing count equals the number of pairs. Otherwise the tabulator selects the
  advancing candidates manually. Tied pairs require attention; do not invent a winner or a ranking
  across pairs.
- Rank using full calculated values, not displayed rounded values. Display rounding must not be
  mistaken for a tie: make the distinction discoverable when displayed values match but the full
  results differ.
- A cut basis or combined total may combine only results with the same measurement semantics:
  scored points, rank points, or pair-vote outcomes, including their unit and direction. Reject
  incompatible sources when the basis is written and when a combined report is requested, and
  enforce the same rule in the shared scoring path. Explain plainly: “Votes and scores are different
  units — no conversion rule exists.” There is no planned conversion feature. If a debate and a
  scored segment must both inform a cut, grade the debate as a scored criterion (as HARA 2026 did)
  or have the organizers decide the cut and the tabulator enter the advancing field by hand.
- Average scores are the scoring method. Rank-sum and its configuration have been removed; an
  environment flag is not needed.
- Keep the flexible groups model and the judge's tabular score sheet. Preserve useful context when
  switching categories, and make candidate photos expandable from their thumbnails.
- Give admins category-by-judge progress and contextual setup guidance. Highlight the top three
  places in every ranked printed report, with rank still clear without color. Replace native
  confirmation calls with reusable accessible dialogs in a later add-on PR, not foundational work.
- Existing events are disposable local development data. Do not build compatibility layers for them;
  update migrations, seed scripts, fixtures, tests and instructions. Never silently reset a database.

## PR sequence

These are review boundaries, not permission to leave a merged PR with misleading scoring behavior.
Combine or stage dependent changes if needed, and update affected fixtures in the same PR as the
schema or behavior they rely on.

1. **Rules and scenarios:** record this roadmap and identify the affected surfaces and unresolved
   decisions. Review PRs #2 and #3 for relevant requirements, fixtures and test cases without
   assuming their implementation must be retained. No production scoring behavior changes.
2. **Category results and cuts:** introduce independent category results, category-specific judging
   types and rules, and category-based cuts. Replace round-based basis configuration; address manual
   advancement and pair votes before claiming full HARA coverage. Update seed data, migrations, API contracts and tests with
   the model.
3. **Admin setup and live operation:** explain the round/category/criterion hierarchy, provide
   readiness guidance and per-category judge progress, and make corrections and close blockers clear.
4. **Judge experience:** preserve the table, improve safe category switching and continuity, and open
   a larger photo from the avatar with a visible instruction.
5. **Reports:** category rankings and awards, and placement styling in all ranked print reports.
6. **Later add-on:** replace native confirmation calls with reusable accessible dialogs. Prioritize
   event and scoring workflow over cosmetic or interaction polish throughout the series.

## Acceptance scenarios

Use these as test cases as the corresponding behavior is implemented; they are not claims that the
current application passes them.

1. **Independent category awards:** in one open round, Production Number and National Costume use
   distinct criteria and produce different winners. Both rankings and awards remain independently
   visible even when a cut combines their scores.
2. **Equal and weighted cuts:** given category averages A=(90, 70) and B=(80, 90), an equal cut
   ranks B above A (85 vs 80). At weights 3:1, it ranks A above B (85 vs 82.5). Changing cut weights
   does not change either category ranking. Rank by full calculated values even if displayed rounded
   values match; show a tie notice only for an actual tie.
3. **Different judge assignments:** compute each category from the judges assigned to that category;
   combining categories must not silently give a category more influence merely because it has more
   assigned judges. Incomplete and unsubmitted scores must not be treated as final.
4. **Simultaneous judging:** a judge switches repeatedly between the two categories, including while
   saves are pending, and submits them separately. Reopening or unlocking a score must clearly state
   its scope; a save failure must not silently discard or misattribute an edit.
5. **Advancement:** show any incomplete submissions and ties before a cut. A tabulator can add
   candidates manually to the advancing field; their existing scores determine their order. Only
   the intended candidates enter the next round. The precise tie-resolution action remains open.
6. **Category judging types and units:** scored and pair-vote categories can belong to a round.
   Pair-vote results show each pair's outcome without ranking candidates across pairs. When the cut
   count equals the pair count, advance the winners; otherwise require manual selection. Tied pairs
   require attention. Verify each category's judge flow independently. Incompatible measurement semantics are rejected
   with a plain explanation at basis-write time, combined-report time, and in the shared scoring
   path, including rank points versus scored points and results with different directions. Verify
   compatible sources still combine correctly; no conversion is offered.
7. **Reports and accessibility:** each category has its own ranking and award; ties and group-filtered
   reports show the correct places. Ranked printouts distinguish the top three while remaining legible
   in grayscale. Photo and confirmation dialogs work with keyboard and restore focus.
8. **Fresh setup:** from a clean database, apply the documented migrations and recreate the demo and
   HARA examples. Verify the same journeys in a full event rehearsal. A reset is explicit and its
   destructive effects are explained.

## Code and fixture map

- Model and migrations: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
- Setup and event execution: `apps/api/src/routes/setup.ts`, `rounds.ts`, `judge.ts`;
  calculations in `apps/api/src/lib/tabulate.ts`, `cut.ts` and `apps/api/src/scoring/`.
- Reports and contracts: `apps/api/src/routes/reports.ts`, `apps/web/src/api/types.ts`,
  `apps/web/src/pages/admin/reportViews.tsx`, `docs/api.md`, `docs/data-model.md`, `docs/scoring.md`.
- UI: `apps/web/src/pages/admin/RoundsPage.tsx`, `JudgesPage.tsx`, `EventOverviewPage.tsx`,
  `apps/web/src/pages/judge/ScoreSheetPage.tsx`, `PairVotePanel.tsx`, and shared components/styles.
- Development data: `apps/api/src/seed.ts`, `seed-demo.ts`, and `e2e/tests/tally.spec.ts`; the
  rehearsal branch also contains `seed-hara2026.ts`, `hara2026-import/`, and
  `docs/hara2026-manual-setup.md` to reconcile if those materials are brought into this branch.
- Existing mathematical unit tests: `apps/api/src/scoring/scoring.test.ts`.

## Decisions needed before the affected implementation

- What explicit action resolves a tie at a cut line, and can an admin proceed with all tied candidates?
  The notice itself is required; do not infer the resolution from the notice.
- Proposed defaults, pending tabulator confirmation: show shared ranks on ties; mark incomplete
  results provisional and block final cuts; do not
  apply adjustments, carry-over or drop-extremes unless the event rules explicitly require them.
  Confirm category award names and any required exceptions before building configuration for them.
