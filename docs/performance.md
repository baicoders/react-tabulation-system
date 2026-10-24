# Performance with many candidates

Target: screens stay smooth with hundreds of candidates, each with a picture, on ordinary school PCs over a LAN.

Measured on the Docker stack with 150 candidates: creating all 150 took under 1 second, and fetching page 3 (50 rows) took 15 ms. A 2000 x 2500 px upload became a 120 byte thumbnail and a 1.2 KB profile image (solid color test image; real photos are larger but stay small as WebP).

## What keeps it fast

| Technique | Where | Why it helps |
| --- | --- | --- |
| Server-side pagination | `GET /api/events/:id/candidates?page=&pageSize=` | The browser only ever holds one page (10 to 100 rows) |
| Database indexes | Unique `(eventId, number)`, indexes on score foreign keys | Paging, filtering and score lookups stay fast as data grows |
| Debounced search | `useDebounced` (300 ms) | One request after typing stops, not one per keystroke |
| Stale request cancel | `usePaginated` uses `AbortController` | Fast page clicks never show an older page last |
| Keep previous page while loading | `usePaginated` | No empty table or flicker between pages |
| WebP thumbnails | `apps/api/src/lib/images.ts` | Lists load 160 px thumbnails, not the original photo |
| Lazy, async image decoding | `CandidatePhoto` | Off-screen pictures load only when scrolled into view |
| Fixed image size | `CandidatePhoto` | No layout jumps while pictures arrive |
| Long-lived image cache | `/uploads` sends `max-age=30d, immutable` | Each picture downloads once per PC; a new upload gets a new file name |
| Memoized score rows | `ScoreRow` in the judge score sheet | Typing in one input re-renders one row, not the whole sheet |
| Page-scoped shortcuts | `Shift + J` / `Shift + P` | Auto input touches the visible page only |

## Guidelines for new screens

- Never fetch a whole candidate list. Use `usePaginated` with a paginated endpoint.
- Always render pictures through `CandidatePhoto` and the `thumbUrl`, never `photoUrl`, in lists.
- Keep large tables split into memoized row components with stable callbacks (`useCallback`).
- Save score inputs with a debounce (planned: 500 ms) instead of on every keystroke.
- Compute rankings on the server when scores are submitted, not on every report view.
