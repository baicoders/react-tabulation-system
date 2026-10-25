# Screenshots and user journeys

Every screenshot here is taken by the Playwright end-to-end test in [`e2e/`](../e2e), run against the production Docker stack (nginx in front of the API, PostgreSQL behind it) with the demo event seeded and the system branded as ACLC Ormoc Tabulation. The test plays a full event day and saves a picture at each step, so the pictures follow the people who use the system: the admin setting up, the judges scoring, the tabulator running the night, and everyone reading the results. Re-running the test refreshes them.

The demo event, Hara ng ACLC Ormoc 2026, is one pageant event in the system. Its candidates, judges and scores are made up, and the candidate photos are drawn placeholders uploaded by the test.

## Test result

10 of 10 tests pass, in about a minute:

| Test | What it checks |
| --- | --- |
| Settings | System name, organization, colour and logo saved in Settings; a bad colour is refused; changes reach the menu, the browser tab and the login page; the school's branding is put back before any screenshot; event details save |
| Login | Judge and admin login, a wrong password shows an error |
| Events | The list, status tabs, search, creating an event |
| Import | A CSV of 6 candidates previews, imports, and appears in the list |
| Candidates | Photo upload from the page, search, group filter, pagination, the add form |
| Setup | Groups, rounds and criteria, judges and their round assignments, the add-judge form |
| Judging | Typing scores, the testing-mode fill shortcut across every page, submitting; the admin overview updates live without a reload; closing the round, including a tie at the cut-off |
| Later rounds | Pairs set by rank, a judge votes in every pair and submits, the remaining rounds through the final |
| Reports | Overall, by round, by candidate, by judge, filtered to one house, the printed letterhead, Excel download |
| Layouts | All four reports on a phone without sideways page scroll, print keeps every column, the phone menu, a judge on a tablet |

Any script error in the app fails the test that caused it.

## Run it

```bash
docker compose up -d --build
docker compose exec api node dist/seed-demo.js
cd e2e && npm install && npx playwright test
```

It uses the installed Chrome (set `PW_CHANNEL=msedge` for Edge) and `http://localhost:8090` (set `BASE_URL` for another address). The admin password comes from `ADMIN_PASSWORD` or the repo's `.env`. Each run starts the demo over, so it can be repeated. The screenshots show whatever branding the system has in Settings. The HTML report lands in `e2e/report`.

## Journey 1: the admin sets up the system once

The school's name, seal and colour are set once in **Settings**. They appear on the login page, every screen, the browser tab, the letterhead of every event's printed reports, and the first rows of every Excel export.

| | |
| --- | --- |
| ![Settings](screenshots/33-settings-branding.png) | ![Login](screenshots/34-login-branded.png) |
| Settings: system name, organization, color and seal. | The login page: the school's seal and the event that is live now. |
| ![Wrong password](screenshots/02-login-error.png) | ![Events](screenshots/03-events.png) |
| The admin logs in; a wrong password says so plainly. | All of the school's events, with their status, candidates, judges and rounds. |

## Journey 2: the admin prepares an event

Each event has its own candidates, groups, rounds, criteria and judges.

| | |
| --- | --- |
| ![New event](screenshots/04-events-new.png) | ![Event details](screenshots/35-event-details.png) |
| A new event takes a name, date and venue. | Event details: the name, date and venue printed under the school's letterhead. |
| ![Import preview](screenshots/08-import-preview.png) | ![Import done](screenshots/08b-import-done.png) |
| Candidates come from a CSV or Excel file, checked row by row before saving. | After the import, photos can follow as a ZIP. |
| ![Candidates](screenshots/05-candidates.png) | ![Search](screenshots/06-candidates-search.png) |
| The candidate list: paginated, with photos, houses and levels. | Search by name or number. |
| ![Add candidate](screenshots/07-candidates-add.png) | ![Groups](screenshots/09-groups.png) |
| Adding one candidate by hand. | Groups (house, level) for filtering and split reports. |
| ![Rounds and criteria](screenshots/10-rounds.png) | ![Judges](screenshots/11-judges.png) |
| Rounds in order with their cut-offs, criteria, points and weights. | Which judge scores which round. |
| ![Add judge](screenshots/12-judges-add.png) | |
| Adding a judge with their password. | |

## Journey 3: a judge scores a round

| | |
| --- | --- |
| ![Judge login](screenshots/01-login-judge.png) | ![Empty score sheet](screenshots/14-judge-sheet-empty.png) |
| The judge logs in with their name on their own PC. | Their score sheet for the open round. |
| ![Typing scores](screenshots/15-judge-sheet-typing.png) | ![Sheet filled](screenshots/16-judge-sheet-filled.png) |
| Totals out of 100 appear as scores are typed, and save on their own. | Every score in (the last page shown); Submit unlocks. |
| ![Submitted](screenshots/17-judge-submitted.png) | ![Between rounds](screenshots/32-tablet-judge-no-round.png) |
| Submitted scores lock; only the tabulator can let the judge change them. | Between rounds, on a tablet: the sheet waits for the next round to open. |

## Journey 4: the tabulator runs the event

The overview updates live as judges save and submit, without reloading the page.

| | |
| --- | --- |
| ![Overview, round open](screenshots/13-overview-open-round.png) | ![All submitted](screenshots/18-overview-all-submitted.png) |
| Production Number is open; nobody has submitted yet. | Every judge has submitted; the round is ready to close. |
| ![Round closed](screenshots/19-overview-round-closed.png) | ![Pairs not set](screenshots/20-overview-pairs-unset.png) |
| Closed: the Top 20 go on and the next round is ready to open. If candidates tie at the cut-off line, the overview first asks to send all of them on. | Deba Teh, a pair-vote round: pairs are set by rank (1 v 10) or by draw. |
| ![Judge pair vote](screenshots/21-judge-pair-vote.png) | ![Votes picked](screenshots/22-judge-pair-voted.png) |
| Each judge picks a winner in every pair. | Every pair voted, ready to submit. |
| ![Votes in](screenshots/23-overview-votes-in.png) | ![After the final](screenshots/24-overview-final.png) |
| All votes in, ready to close. | Every round closed after the final. |

## Journey 5: results, on screen and on paper

| | |
| --- | --- |
| ![Overall ranking](screenshots/25-report-overall.png) | ![Printed report](screenshots/25b-report-printed.png) |
| The overall ranking with titles. | Printed: the school's letterhead, then the event, ready for the judges to sign. |
| ![By round](screenshots/26-report-round.png) | ![By candidate](screenshots/27-report-candidate.png) |
| One round's results. | One candidate, every judge's scores. |
| ![By judge](screenshots/28-report-judge.png) | ![One house](screenshots/29-report-split-by-group.png) |
| One judge's sheet in a round, for them to check and sign. | The ranking for one house. |

## On a phone

| | | |
| --- | --- | --- |
| ![Phone report](screenshots/30-phone-report.png) | ![Phone report by round](screenshots/30b-phone-report-round.png) | ![Phone report by candidate](screenshots/30c-phone-report-candidate.png) |
| Overall ranking: place, candidate and score, with the number and furthest round under the name. | By round. | By candidate: the score grid scrolls sideways with the criterion column pinned. |
| ![Phone report by judge](screenshots/30d-phone-report-judge.png) | ![Phone menu](screenshots/31-phone-menu.png) | |
| By judge. | The menu, with the school's seal and name. | |

Printed reports keep every column; the phone layout applies to screens only. The test checks both, and that no report makes the phone page scroll sideways.
