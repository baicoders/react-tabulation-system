# Screenshots and end-to-end test

Every screenshot here is taken by the Playwright end-to-end test in [`e2e/`](../e2e), run against the production Docker stack (nginx in front of the API, PostgreSQL behind it) with the demo event seeded. The test plays a full event day: setup, five judges scoring, live standings, a tie at the cut-off, the pair vote, every round to the final, and the reports. Re-running the test refreshes the pictures.

The demo data is made up, and the candidate photos are drawn placeholders uploaded by the test.

## Test result

9 of 9 tests pass, in about 50 seconds:

| Test | What it checks |
| --- | --- |
| Login | Judge and admin login, a wrong password shows an error |
| Events | The list, status tabs, search, creating an event |
| Import | A CSV of 6 candidates previews, imports, and appears in the list |
| Candidates | Photo upload from the page, search, group filter, pagination, the add form |
| Setup | Groups, rounds and criteria, judges and their round assignments, the add-judge form |
| Judging | Typing scores, the testing-mode fill shortcut across every page, submitting; the admin overview updates live without a reload; closing the round, including a tie at the cut-off |
| Later rounds | Pairs set by rank, a judge votes in every pair and submits, the remaining rounds through the final |
| Reports | Overall, by round, by candidate, by judge, filtered to one house, Excel download |
| Layouts | Phone report and menu, a judge on a tablet |

Any script error in the app fails the test that caused it.

## Run it

```bash
docker compose up -d --build
docker compose exec api node dist/seed-demo.js
cd e2e && npm install && npx playwright test
```

It uses the installed Chrome (set `PW_CHANNEL=msedge` for Edge) and `http://localhost:8090` (set `BASE_URL` for another address). The admin password comes from `ADMIN_PASSWORD` or the repo's `.env`. Each run starts the demo over, so it can be repeated. The HTML report lands in `e2e/report`.

## Logging in

| | |
| --- | --- |
| ![Login](screenshots/01-login-judge.png) | ![Wrong password](screenshots/02-login-error.png) |
| Judges log in with their name. | A wrong password says so plainly. |

## Events

| | |
| --- | --- |
| ![Events](screenshots/03-events.png) | ![New event](screenshots/04-events-new.png) |
| Every event with its status, candidates, judges and rounds. | Creating an event takes a name, date and venue. |

## Candidates

| | |
| --- | --- |
| ![Candidates](screenshots/05-candidates.png) | ![Search](screenshots/06-candidates-search.png) |
| Paginated list with photos, houses and levels. | Search by name or number. |
| ![Add candidate](screenshots/07-candidates-add.png) | ![Import preview](screenshots/08-import-preview.png) |
| Adding one candidate. | Importing from CSV or Excel shows each row before saving. |
| ![Import done](screenshots/08b-import-done.png) | |
| After the import, photos can follow as a ZIP. | |

## Setup

| | |
| --- | --- |
| ![Groups](screenshots/09-groups.png) | ![Rounds and criteria](screenshots/10-rounds.png) |
| Groups (house, level) for filtering and split reports. | Rounds, cut-offs, criteria, points and weights. |
| ![Judges](screenshots/11-judges.png) | ![Add judge](screenshots/12-judges-add.png) |
| Which judge scores which round. | Adding a judge. |

## Scoring a round

| | |
| --- | --- |
| ![Overview, round open](screenshots/13-overview-open-round.png) | ![Empty score sheet](screenshots/14-judge-sheet-empty.png) |
| The admin overview while Production Number is open. | A judge's score sheet. |
| ![Typing scores](screenshots/15-judge-sheet-typing.png) | ![Sheet filled](screenshots/16-judge-sheet-filled.png) |
| Totals out of 100 appear as scores are typed. | Every score in; Submit unlocks. |
| ![Submitted](screenshots/17-judge-submitted.png) | ![All submitted](screenshots/18-overview-all-submitted.png) |
| Submitted scores lock. | The overview updated live as each judge submitted. |
| ![Round closed](screenshots/19-overview-round-closed.png) | |
| The round is closed and the next one is ready to open. If candidates tie at the cut-off line, the overview first asks to send all of them on (the test saves `19a-overview-tie-at-cut.png` when the random scores tie). | |

## Pair vote (Deba Teh)

| | |
| --- | --- |
| ![Pairs not set](screenshots/20-overview-pairs-unset.png) | ![Judge pair vote](screenshots/21-judge-pair-vote.png) |
| Pairs are set by rank (1 v 10) or by draw. | The judge picks a winner in each pair. |
| ![Votes picked](screenshots/22-judge-pair-voted.png) | ![Votes in](screenshots/23-overview-votes-in.png) |
| Every pair voted, ready to submit. | All votes in, ready to close. |

## Final

![Overview after the final](screenshots/24-overview-final.png)

## Reports

| | |
| --- | --- |
| ![Overall ranking](screenshots/25-report-overall.png) | ![By round](screenshots/26-report-round.png) |
| Overall ranking with titles. | One round's results. |
| ![By candidate](screenshots/27-report-candidate.png) | ![By judge](screenshots/28-report-judge.png) |
| One candidate, every judge's scores. | One judge's sheet in a round. |
| ![One house](screenshots/29-report-split-by-group.png) | |
| The ranking for one house. | |

## Phone and tablet

| | | |
| --- | --- | --- |
| ![Phone report](screenshots/30-phone-report.png) | ![Phone menu](screenshots/31-phone-menu.png) | ![Tablet judge](screenshots/32-tablet-judge-no-round.png) |
| Reports on a phone. | The menu on a phone. | A judge on a tablet between rounds. |
