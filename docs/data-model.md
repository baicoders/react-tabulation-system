# Data model

The full schema is in [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma), and the diagram is in the [README](../README.md#database). Everything belongs to an **Event**. Deductions are handled on paper, so there is no table for them.

| Model | Purpose | Key fields |
| --- | --- | --- |
| `AdminUser` | Admin login | `username`, `passwordHash` |
| `Event` | One pageant or contest | `name`, `status` (DRAFT, ACTIVE, CLOSED), `testingMode` |
| `Group` | An admin-defined way to group candidates | `name`, e.g. "Type", "House", "Level" |
| `GroupValue` | One option of a group | `name`, e.g. "Female", "House Red", "SHS" |
| `Candidate` | A contestant | `number` (unique per event), `name`, `picturePath` |
| `CandidateGroupValue` | Links a candidate to its group values | `candidateId`, `groupValueId` |
| `Round` | A stage of the event | `order`, `kind` (SCORED, PAIR_VOTE), `scoreMethod`, `advanceCount`, `carryOverWeight`, `dropExtremes`, `tieBreak`, `status` |
| `RoundEntry` | Who competes in a round and whether they advanced | `roundId`, `candidateId`, `advanced` |
| `Category` | A scored segment inside a round | `name`, `weight` (percent of round) |
| `Criterion` | A scored item inside a category | `minPoints`, `maxPoints`, `weight` (percent of category) |
| `Judge` | Judge login, per event | `name` (also the username), `passwordHash` |
| `JudgeCategory` | Which categories a judge scores | `judgeId`, `categoryId` |
| `Score` | One judge's points for one candidate on one criterion | `points`, `status` (DRAFT, SUBMITTED), `isTest` |
| `Pair`, `PairVote` | Head-to-head rounds where judges pick a winner | `candidateAId`, `candidateBId`, `winnerId` |
| `AuditLog` | Who did what: opening, closing, resets, imports | `actor`, `action`, `details` |

## Notes

- **Type is just a group.** "Male / Female / Others" is configured as a group named "Type", the same way as "House" or "Level". Rankings can be split by any group.
- **Pictures** are stored as a base path such as `candidates/12-1730000000000`. The files are `<base>-thumb.webp` (160 px) and `<base>-full.webp` (800 px).
- **Test scores** carry `isTest = true` and are excluded from official reports when testing mode is turned off.
- **Unique score**: one row per judge, candidate and criterion, so saving again updates instead of duplicating.

## Migrations

Migrations live in `apps/api/prisma/migrations`. After editing `schema.prisma`:

```bash
npm run db:migrate -w apps/api -- --name describe_the_change
```

The production container runs `prisma migrate deploy` on every start, so new migrations apply automatically.
