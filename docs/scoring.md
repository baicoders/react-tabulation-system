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
| Advance count | Top N go to the next round | Everyone |
| Tie-break | Shared rank, category score, count of first places, Admin decides | Shared rank |

## A judge's total

Every judge total is out of 100, so rounds with different point ranges compare fairly:

```text
criterion part = points / max points * criterion share
category score = sum of its criterion parts            (out of 100)
judge total    = sum of category score * category share, over the categories the judge scored
```

A share is the weight in percent, or an equal split when no weights are set. With Poise 40%, Delivery 30% and Confidence 30% on a 1 to 10 scale, scores of 2, 9 and 7 give 8 + 27 + 21 = 56. Only submitted scores count. Test scores count only while testing mode is on.

The code is `apps/api/src/lib/tabulate.ts`; the judge screen shows the same total per row.

## Average of raw scores

The candidate's score is the average of the judge totals. Higher wins.

## Rank-sum

Each judge's totals are turned into ranks (1 = best). Tied totals share the average rank, so two candidates tied for first both get 1.5. Ranks are summed per candidate and the lowest sum wins. One very generous or very harsh judge cannot swing the result.

| Candidate | Judge 1 | Judge 2 | Judge 3 | Average | Rank-sum |
| --- | --- | --- | --- | --- | --- |
| A | 95 (rank 1) | 80 (rank 2) | 82 (rank 2) | 85.7, wins | 5 |
| B | 85 (rank 2) | 86 (rank 1) | 85 (rank 1) | 85.3 | 4, wins |

This exact example is a unit test, so the engine is checked against it on every run.

## Pair vote

For head-to-head rounds such as Deba Teh. The tabulator sets the pairs, by rank (the best of the round before meets the lowest: 1 v 10, 2 v 9) or by a random draw. Every judge picks one winner per pair and submits.

- A pair is decided once every judge has submitted; its winner has the most votes. A tied pair (possible with an even number of judges) blocks closing until a judge changes a vote.
- The field is ranked pair winners first, then by votes received, then by rank in the round before. With N pairs and Top N, the pair winners are exactly who go on.
- The tabulator sees every vote as it is cast (a split bar per pair); only submitted votes decide.

## Carry-over

```text
final = w * earlier rounds + (1 - w) * this round
```

`w` is `carryOverWeight` on the round, from 0 to 1. Null means the round starts fresh.

## Deductions

Not part of the system. The organizers apply deductions on paper, so the system only ever holds the judges' scores.

## Ranking and cut-offs

- Ranks use competition ranking: equal scores share a rank and the next rank is skipped (1, 1, 3).
- `topN` returns who advances and flags a tie at the cut line, so the Admin can resolve it before the next round opens.
- Titles: rank 1 is Champion, then 1st, 2nd and 3rd Runner-up. Lower ranks show as "Rank N" when the Admin turns them on.
