# Scoring methods

There is no official tabulation standard, so each round currently picks its rules from the common options below. The category-first reconciliation is in progress; see [tabulation-reconciliation.md](tabulation-reconciliation.md) for the target model.

## Settings per round

| Setting | Options | Default |
| --- | --- | --- |
| Judging type | Scored criteria, Pair vote | Scored criteria |
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
category average = average of complete submitted judge totals for that category
round score      = weighted average of category averages
```

A share is the weight in percent, or an equal split when no weights are set. With Poise 40%, Delivery 30% and Confidence 30% on a 1 to 10 scale, scores of 2, 9 and 7 give 8 + 27 + 21 = 56. A category includes only fully submitted score sheets from assigned judges. The round combines category averages rather than judge totals, so different numbers of judges do not change a category's share. Test scores count only while testing mode is on.

The code is `apps/api/src/lib/tabulate.ts`; the judge screen shows the same total per row.

## Average of raw scores

The candidate's category score is the average of the assigned judges' category totals. Category averages are weighted to find the round's cut score. Higher wins.

## Pair vote

For head-to-head rounds such as Deba Teh. The tabulator sets the pairs, by rank (the best of the round before meets the lowest: 1 v 10, 2 v 9) or by a random draw. Every judge picks one winner per pair and submits.

- A pair is decided once every judge has submitted; its winner has the most votes. A tied pair (possible with an even number of judges) blocks closing until a judge changes a vote.
- There is no overall ranking across pairs. When the cut count matches the number of pairs, the pair winners advance. Otherwise the tabulator selects the advancing field by hand.
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
