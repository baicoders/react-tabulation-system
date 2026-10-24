# API reference

Base path: `/api`. All bodies are JSON unless noted. Send the token from login as `Authorization: Bearer <token>`.

Errors come back as `{ "error": "message" }`. Invalid input returns `400` with `issues` from Zod.

## Health

| Method | Path | Auth | Response |
| --- | --- | --- | --- |
| GET | `/health` | None | `{ "status": "ok" }` |

## Auth

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | None | `{ role: "admin" \| "judge", username, password }` | `{ token, user }` |
| GET | `/auth/me` | Admin or judge | | `{ user }` |

Judges log in to the event whose status is `ACTIVE`. The username is the judge's name.

## Events (admin)

| Method | Path | Body |
| --- | --- | --- |
| GET | `/events` | |
| GET | `/events/:id` | Includes rounds and groups |
| POST | `/events` | `{ name, date?, venue?, status?, testingMode? }` |
| PATCH | `/events/:id` | Any field from POST |
| DELETE | `/events/:id` | |

## Candidates

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/events/:eventId/candidates` | Admin, or judge of that event | Query: `page` (default 1), `pageSize` (1 to 100, default 20), `q` (name or number), `groupValueId` |
| POST | `/events/:eventId/candidates` | Admin | `{ number, name, groupValueIds? }` |
| PATCH | `/candidates/:id` | Admin | Any field from POST |
| DELETE | `/candidates/:id` | Admin | Also deletes the picture files |
| POST | `/candidates/:id/picture` | Admin | `multipart/form-data`, field `picture`, JPG, PNG or WebP up to 10 MB |

List response:

```json
{
  "items": [
    {
      "id": 1,
      "number": 1,
      "name": "Candidate 1",
      "thumbUrl": "/uploads/candidates/1-1730000000000-thumb.webp",
      "photoUrl": "/uploads/candidates/1-1730000000000-full.webp",
      "groups": [{ "id": 3, "name": "SHS", "groupId": 2 }]
    }
  ],
  "total": 150,
  "page": 1,
  "pageSize": 20
}
```

## Event setup (admin)

`GET /events` and `GET /events/:id` include `_count` of candidates, judges and rounds. `GET /events/:id` also includes the rounds (with entry counts) and groups (with candidate counts per value).

| Method | Path | Body |
| --- | --- | --- |
| GET | `/events/:eventId/groups` | |
| POST | `/events/:eventId/groups` | `{ name, values?: string[] }` |
| PATCH | `/groups/:id` | `{ name }` |
| DELETE | `/groups/:id` | |
| POST | `/groups/:id/values` | `{ name }` |
| DELETE | `/group-values/:id` | |
| GET | `/events/:eventId/rounds` | Rounds in order, with categories and criteria |
| POST | `/events/:eventId/rounds` | `{ name, kind?, scoreMethod?, advanceCount?, carryOverWeight?, dropExtremes?, tieBreak? }`; order is set to the end |
| PATCH | `/rounds/:id` | Any field from POST |
| DELETE | `/rounds/:id` | |
| POST | `/rounds/:id/categories` | `{ name, weight? }` |
| PATCH | `/categories/:id` | `{ name?, weight? }` |
| DELETE | `/categories/:id` | |
| POST | `/categories/:id/criteria` | `{ name, minPoints, maxPoints, weight? }`; max must be above min |
| PATCH | `/criteria/:id` | Any field from POST |
| DELETE | `/criteria/:id` | |
| GET | `/events/:eventId/judges` | `[{ id, name, categoryIds, submittedScores }]` |
| POST | `/events/:eventId/judges` | `{ name, password, categoryIds? }`; password at least 4 characters, stored hashed |
| PATCH | `/judges/:id` | `{ name?, password?, categoryIds? }` |
| DELETE | `/judges/:id` | |

Weights are percents (0 to 100) or `null` for equal weights. `carryOverWeight` is a share from 0 to 1. Decimal columns are returned as numbers.

## Judging (judge)

All scoped to the judge's own event and to categories assigned to them, in rounds that are open.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/judge/sheet` | `{ event, judge, rounds: [{ id, name, entries, categories: [{ id, name, criteria, scored, required, submitted }] }] }` |
| GET | `/judge/categories/:categoryId/candidates` | Candidates in the round, paginated (`page`, `pageSize` up to 100, `q`), each with this judge's `scores` by criterion id, plus `locked` |
| PUT | `/judge/scores` | `{ categoryId, scores: [{ candidateId, criterionId, points }] }` saves drafts; `points: null` clears one. Values outside a criterion's range are refused. `409` after the category is submitted |
| POST | `/judge/categories/:categoryId/submit` | Locks the category; `409` with the number still missing if any score is empty |

Scores given while testing mode is on are saved with `isTest: true`.

Pair-vote rounds come back in `/judge/sheet` as `pairRounds: [{ id, name, pairs: [{ id, a, b, myVote }], voted, submitted }]`.

| Method | Path | Notes |
| --- | --- | --- |
| PUT | `/judge/votes` | `{ pairId, winnerId }`; the winner must be one of the pair. `409` after the judge submitted |
| POST | `/judge/rounds/:roundId/submit-votes` | Locks the judge's votes; `409` while any pair has no vote |

## Running rounds (admin)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/rounds/:id/tabulation` | Judges' progress, `complete`, standings from submitted scores, `advancingIds` and `tieAtCutLine` |
| POST | `/rounds/:id/open` | Fills the round (every candidate for the first round, the advanced ones after that) and opens it. One open round at a time |
| POST | `/rounds/:id/close` | `{ includeTies? }`. Needs every judge submitted. `409` with `tie` when candidates share the rank at the cut line; send `includeTies: true` to send them all on. Saves each entry's score, rank and `advanced`, and fills the next round |
| POST | `/rounds/:id/reopen` | Clears the results and empties the next round, if it has not started |
| POST | `/rounds/:id/pairs` | Pair-vote rounds: `{ method: "RANKED" \| "RANDOM" }`. Ranked pairs 1st with last of the round before (1 v 10, 2 v 9); random is a draw. Needs an even field; can be redone until the first vote |
| POST | `/rounds/:id/judges/:judgeId/unlock` | Lets one judge change their submitted scores or votes in the round |
| POST | `/rounds/:id/reset-scores` | `{ testOnly? }` (default true). Not allowed on a closed round |

Opening, closing, reopening, unlocking and resets are written to the audit log.

## Bulk import (admin)

The browser reads the CSV or Excel file (first sheet, first non-empty row as headers) and sends its rows. Headers are matched by name: `Number` (or `No.`), `Name` (or `Full name`), a column per group named after it (`House`, `Level`), and an optional `Photo file`. Other columns are ignored and listed.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/events/:eventId/import/candidates` | `{ dryRun, rows: [{ line, number, name, groups: { House: "Red House" } }] }`, up to 2,000 rows. Returns each row as `new`, `update` (that number exists) or `error` with a reason, the group values that would be created, and ignored columns. With `dryRun: false`, saves every valid row in one transaction |

Group values match without regard to case; a value the event does not have yet is created. A file without a column for a group leaves that group as it was.

Photos from a ZIP are read in the browser and sent one by one to `POST /candidates/:id/picture`. Each photo is matched by the sheet's `Photo file` column, then by number (`12.jpg`), then by name (`maria-santos.jpg`).

## Deductions (admin)

A deduction comes off one candidate's score in one round, after tabulation. Only rounds that are not closed and are scored by average can take one; pair-vote and rank-sum rounds are refused because points do not change them.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/events/:eventId/deduction-rules` | Rules with how often each was used |
| POST | `/events/:eventId/deduction-rules` | `{ label, points }`, for example `{ "label": "Guideline 7", "points": 5 }` |
| PATCH | `/deduction-rules/:id` | `{ label?, points? }` |
| DELETE | `/deduction-rules/:id` | Deductions made under it stay, without the rule's name |
| GET | `/events/:eventId/deductions` | Newest first, with candidate, round, rule, note, who added it and when |
| POST | `/events/:eventId/deductions` | `{ candidateId, roundId, ruleId?, points?, note? }`. Points default to the rule's; with no rule, `points` and `note` are required. The candidate must be in the round |
| DELETE | `/deductions/:id` | `{ reason }` (required). Not allowed once the round is closed |

Adding and removing deductions are written to the audit log. `GET /events/:eventId/candidates` also takes `roundId` to list only that round's candidates.

## Reports (admin)

Read only. Built from submitted scores and from the results saved when rounds close. `groupValueId` limits a report to one value of a group (one house, one level) and recounts places from 1 inside it.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/events/:eventId/reports/overall` | `?groupValueId`. Each candidate's place: furthest round reached, then rank there (while that round is open, rank in the last closed round). `title` (Champion, 1st to 3rd Runner-up) once the final round is closed |
| GET | `/rounds/:id/report` | `?groupValueId`. Per candidate: category scores (judges' average, out of 100), deduction, score, rank, whether they went on; for pair rounds the opponent and votes |
| GET | `/candidates/:id/report` | Every round the candidate entered, with each judge's points per criterion, or their vote in a pair round |
| GET | `/rounds/:id/judges/:judgeId/report` | Every score one judge gave in a round, with their total out of 100 and when it was saved |

The screen prints any report (signature lines on the overall and judge reports) and exports it to Excel in the browser.

## Coming next

Deductions screen and bulk import. See the [roadmap](roadmap.md).
