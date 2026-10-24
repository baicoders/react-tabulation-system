# Scoring methods

There is no official tabulation standard, so each round picks its rules from the common options below. The code is in [`apps/api/src/scoring/index.ts`](../apps/api/src/scoring/index.ts) and every rule has a unit test.

## Settings per round

| Setting | Options | Default |
| --- | --- | --- |
| Score method | Average of raw scores, Rank-sum, Pair vote | Average |
| Criterion weights | Percent of its category, must total 100 | Equal |
| Category weights | Percent of the round, must total 100 | Equal |
| Carry-over | Start fresh, or carry a share of earlier rounds | Start fresh |
| Drop extremes | Drop highest and lowest judge total (5 or more judges) | Off |
| Deductions | Admin-defined rules, subtracted after tabulation | None |
| Advance count | Top N go to the next round | Everyone |
| Tie-break | Shared rank, category score, count of first places, Admin decides | Shared rank |

## Average of raw scores

Each judge's criterion points are summed (weighted when weights are set) into a judge total. The candidate's score is the average of the judge totals. Higher wins.

## Rank-sum

Each judge's totals are turned into ranks (1 = best). Tied totals share the average rank, so two candidates tied for first both get 1.5. Ranks are summed per candidate and the lowest sum wins. One very generous or very harsh judge cannot swing the result.

| Candidate | Judge 1 | Judge 2 | Judge 3 | Average | Rank-sum |
| --- | --- | --- | --- | --- | --- |
| A | 95 (rank 1) | 80 (rank 2) | 82 (rank 2) | 85.7, wins | 5 |
| B | 85 (rank 2) | 86 (rank 1) | 85 (rank 1) | 85.3 | 4, wins |

This exact example is a unit test, so the engine is checked against it on every run.

## Carry-over

```text
final = w * earlier rounds + (1 - w) * this round
```

`w` is `carryOverWeight` on the round, from 0 to 1. Null means the round starts fresh.

## Deductions

Deductions are applied last, after the final score is computed, and only to point-based results (average). The report shows raw score, deductions and adjusted score side by side.

## Ranking and cut-offs

- Ranks use competition ranking: equal scores share a rank and the next rank is skipped (1, 1, 3).
- `topN` returns who advances and flags a tie at the cut line, so the Admin can resolve it before the next round opens.
- Titles: rank 1 is Champion, then 1st, 2nd and 3rd Runner-up. Lower ranks show as "Rank N" when the Admin turns them on.
