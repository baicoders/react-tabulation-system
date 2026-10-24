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

## Coming next

Rounds, categories, criteria, judges, scores, pair votes, deductions, reports and bulk import. See the [roadmap](roadmap.md).
