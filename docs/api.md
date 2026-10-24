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

## Running rounds (admin)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/rounds/:id/tabulation` | Judges' progress, `complete`, standings from submitted scores, `advancingIds` and `tieAtCutLine` |
| POST | `/rounds/:id/open` | Fills the round (every candidate for the first round, the advanced ones after that) and opens it. One open round at a time |
| POST | `/rounds/:id/close` | `{ includeTies? }`. Needs every judge submitted. `409` with `tie` when candidates share the rank at the cut line; send `includeTies: true` to send them all on. Saves each entry's score, rank and `advanced`, and fills the next round |
| POST | `/rounds/:id/reopen` | Clears the results and empties the next round, if it has not started |
| POST | `/rounds/:id/judges/:judgeId/unlock` | Lets one judge change their submitted scores in the round |
| POST | `/rounds/:id/reset-scores` | `{ testOnly? }` (default true). Not allowed on a closed round |

Opening, closing, reopening, unlocking and resets are written to the audit log.

## Coming next

Pair-vote rounds, deductions screen, reports and bulk import. See the [roadmap](roadmap.md).
