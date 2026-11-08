# Setting up HARA 2026 by hand

A step-by-step walkthrough for building **HARA NG ACLC ORMOC: QUEEN OF ALL NATIONS 2026** through the
admin screens — the same event the old tabulation system ran on 31 October 2026, with the same 52
candidates, 8 rounds, criteria and 3 judges. Doing it by hand is the best way to feel how setup works
before an event day; expect roughly 20 minutes with the bulk import, or about an hour clicking in all
52 candidates one by one.

Everything here is plain admin work — no scripts. (Prefer the scripted way? See
[Appendix B](#appendix-b-scripted-setup).) The finished event is a live sandbox: run the whole
tabulation night, print every report, and compare against the real 2026 results in
[Appendix A](#appendix-a-the-real-2026-results).

## Before you start

- The stack is running and you can open it: `docker compose up -d --build`, then `http://localhost:8090`
  (on event day, `http://<server-ip>` for the judges' laptops).
- You are logged in as **admin** (from `.env`: `ADMIN_USERNAME` / `ADMIN_PASSWORD`).
- Screens referenced below live in the admin sidebar: **Settings, Events, Candidates, Groups, Rounds,
  Judges**. Each event has its own tabs for Candidates / Groups / Rounds / Judges / Details / Reports.

## Step 1 — The school's identity (Settings)

One-time setup that heads every screen and every printed report:

| Field | Value |
|---|---|
| System name | ACLC Ormoc Tabulation (or your preference) |
| Organization | ACLC College of Ormoc |
| Brand color | `#03053e` (or the school's navy) |
| Logo | the school seal — a square PNG with transparent background prints best |

The brand color becomes the rule under printed letterheads; the logo shows on the login page, menus,
judges' screens and printouts.

## Step 2 — Create the event (Events → New event)

| Field | Value |
|---|---|
| Event name | `HARA NG ACLC ORMOC: QUEEN OF ALL NATIONS 2026` |
| Date | 31 October 2026 |
| Venue | ACLC Ormoc Open Stage |

The event starts as **"Setting up"**. Leave it that way while you build it; you will **Go live** in
Step 7. (Only one event can be live at a time — flip the demo event back if it holds the slot.)

## Step 3 — The Country group (Groups)

Create a group named **Country**. If you use the bulk import in Step 4 you can skip adding values now
(the import creates them as it goes). For the one-by-one path, add these 52 values:

> ANGOLA, ARGENTINA, ARMENIA, AUSTRALIA, BAHAMAS, BANGLADESH, BELGIUM, BELIZE, BRAZIL, CHILE,
> COTE DIVOIRE, CUBA, DOMINICAN REPUBLIC, EGYPT, GREECE, HONDURAS, HUNGARY, INDIA, ISRAEL, JAMAICA,
> JAPAN, KAZAKHSTAN, KENYA, LEBANON, MALAYSIA, MEXICO, MONGOLIA, MOROCCO, MYANMAR, NEPAL, NIGERIA,
> NETHERLANDS, NEW ZEALAND, NORWAY, PAKISTAN, PANAMA, PARAGUAY, PERO, PHILIPPINES, PORTUGAL, KOREA,
> ROMANIA, SINGAPORE, SLOVAKIA, SPAIN, SWEDEN, THAILAND, TURKIYE, UKRAINE, URAGUAY, USA, VIETNAM

(Yes, "PERO" and "URAGUAY" are what the organizers sent. Groups also unlock per-country report splits
later, e.g. "Red House only" style.)

## Step 4 — The 52 candidates (Candidates)

Each candidate's **name is the person**; the country lives in the Country group. Photos are the
countries' flag images from the old system (`Tabulation-System/public/flags/<code>.png`).

### Fast path: bulk import

1. Get `hara2026-import/candidates.csv` and `hara2026-import/photos.zip` (Appendix B makes them), or
   build a sheet with the columns **Number, Name, Photo file, Country** (the screen's own
   "Download template" gives you the right headers).
2. **Candidates → Import** → choose the file. The dry-run preview shows every row classified
   **new / update / error** and the Country values it will create — read it, then save.
3. In **Photos from a ZIP**, choose `photos.zip`. Each photo matches the sheet's `Photo file` column
   (`ao.png`), or the number (`12.jpg`), or the slugified name (`maria-santos.jpg`). The screen shows
   what matched and what didn't before uploading.

### Slow path: one by one

**Add candidate** for each row below: number, name, Country value, photo. Good for feeling how much
work the import saves.

### The roster (master reference)

| No. | Candidate | Country | Flag file | | No. | Candidate | Country | Flag file |
|---:|---|---|---|---|---:|---|---|---|
| 1 | CASSY MONTES | ANGOLA | ao.png | | 27 | ISAIAH CANON | MONGOLIA | mn.png |
| 2 | KIANNA KAYE NOYNAY | ARGENTINA | ar.png | | 28 | KATHIANA GARCIA | MOROCCO | ma.png |
| 3 | VASTY GARRIDO | ARMENIA | am.png | | 29 | TANYA FACUNDO | MYANMAR | mm.png |
| 4 | CHEALSE TAGSIP | AUSTRALIA | au.png | | 30 | JAY POY ANDREI POTOY | NEPAL | np.png |
| 5 | ANTON ESPINOSA SUICAN | BAHAMAS | bs.png | | 31 | VJ EJARES | NIGERIA | ng.png |
| 6 | DIEONNE VELOSO MARQUEZ | BANGLADESH | bd.png | | 32 | JOSEPH | NETHERLANDS | nl.png |
| 7 | JAY RENIEL BETUCO | BELGIUM | be.png | | 33 | SHANE GARCIA | NEW ZEALAND | nz.png |
| 8 | VEXIS KAISEN | BELIZE | bz.png | | 34 | ANTHONY NOYA | NORWAY | no.png |
| 9 | JUDE GABRIEL BUCABUCA | BRAZIL | br.png | | 35 | MHIEKYLE TARRA | PAKISTAN | pk.png |
| 10 | NEIL ALVIN QUIJANO | CHILE | cl.png | | 36 | KIMMY ESTRELLAR | PANAMA | pa.png |
| 11 | JESHLY ALCALA JACINTO | COTE DIVOIRE | ci.png | | 37 | MARCO JOHN PEROLINO | PARAGUAY | py.png |
| 12 | JOSH ANDRIE SUDARIA | CUBA | cu.png | | 38 | REANAH | PERO | pe.png |
| 13 | KLYF RAYNE REGANON | DOMINICAN REPUBLIC | do.png | | 39 | KURT LEE UBANA | PHILIPPINES | ph.png |
| 14 | REYMART PIAMONTE | EGYPT | eg.png | | 40 | KIM BRLTRAN | PORTUGAL | pt.png |
| 15 | PETER PAUL SANTOS | GREECE | gr.png | | 41 | FRANCE AARON | KOREA | kr.png |
| 16 | BRYCE RESTITUTO | HONDURAS | hn.png | | 42 | LOUIE SERDON | ROMANIA | ro.png |
| 17 | JHON PAUL CORTAL | HUNGARY | hu.png | | 43 | KENNY MUANA | SINGAPORE | sg.png |
| 18 | REXLIE FEDELIS | INDIA | in.png | | 44 | NATHAN JAMES | SLOVAKIA | sk.png |
| 19 | MARK JHAY BAGUION | ISRAEL | il.png | | 45 | JOSHUA ESMERO | SPAIN | es.png |
| 20 | TIRSO TAMAYO | JAMAICA | jm.png | | 46 | JAKE DADIS | SWEDEN | se.png |
| 21 | JUDE MACARAYA | JAPAN | jp.png | | 47 | ANGEL DELA RAMA | THAILAND | th.png |
| 22 | RJHAY BELIC | KAZAKHSTAN | kz.png | | 48 | REX CASTRO | TURKIYE | tr.png |
| 23 | CLARK BALOTE | KENYA | ke.png | | 49 | RAFHY TURRION | UKRAINE | ua.png |
| 24 | FRANCKLIN GONZALES | LEBANON | lb.png | | 50 | EGUENE RUNA | URAGUAY | uy.png |
| 25 | CALVIN LAURENTE | MALAYSIA | my.png | | 51 | JANCY SEMEROS | USA | us.png |
| 26 | JESHRYL CAPUYAN | MEXICO | mx.png | | 52 | JAYSON BENTOZAL | VIETNAM | vn.png |

## Step 5 — The 8 rounds (Rounds)

Create rounds in this order. For each: name, judging type, and **"Top how many go on"** (leave it empty
for the final round — and for a cut the admins decide by hand, like the Top 20). Under **More settings**:
*Average of scores*, no carry-over, don't drop extremes, shared rank on ties — and, where the guidelines
say a cut is based on more than one segment, the **"What the cut is based on"** list. Criteria are 0–10
with **equal weights** (leave weight blank); the live "weights add up to 100%" check accepts blanks as
equal splits.

| # | Round name | Judging type | Top how many go on | Cut is based on |
|---:|---|---|---:|---|
| 1 | PRODUCTION NUMBER | Scored | 52 | this round alone |
| 2 | NATIONAL COSTUME | Scored | 52 | this round alone |
| 3 | CHUKCHAK (SELF INTRODUCTION) | Scored | *(empty — by hand)* | Production Number + National Costume + this round (×1 each) |
| 4 | OPENING SPEECH | Scored | **10** | this round alone |
| 5 | GOWN | Scored | **10** | this round alone |
| 6 | DEBA TEH (DEBATE CHALLENGE) | **Pair vote** | **5** | Gown (×5) + this round (×1) |
| 7 | WITTY QUESTION (TOP 5) | Scored | **3** | this round alone |
| 8 | FINAL QUESTION (TOP 3) | Scored | *(final — leave blank)* | this round alone |

Rounds 1–2 let everyone through (the field narrows after CHUKCHAK, exactly as in 2026: 52 → 20 → 10 →
10 → 5 → 3). GOWN keeps all 10 — there was no cut between Gown and Deba Teh. **DEBA TEH is pair voting**
here; in 2026 the debate was graded as one "Win or Lose" criterion (see Appendix A's note).

Why those cut bases (guidelines pp. 4–5, 8): the **Top 20** was 10 candidates chosen by the judges on
"overall performance during Production Number, Chuk-Chak and National Costume" plus 10 drawn **by lot
on stage** — so CHUKCHAK's cut is left to the admins by hand, with the combined ranking shown as the
judges' choice. The **Top 5** is "Gown and the Deba Teh Challenge" combined — Gown's raw scores ran to
150 and Deba's to 30 in 2026, hence the 5:1 weights (with pair votes, use whatever weight makes the
debate count as much as the organizers want). The Top 10 is Opening Speech alone and the Top 3 is Witty
Question alone, which are plain "Top N" cuts.

Criteria per round (each 0–10, equal weight):

**1 · PRODUCTION NUMBER** — Charisma · Stage Presences and Confidence · Choreography and Execution ·
Energy and Showmanship · Audience Impact and Overall Appeal

**2 · NATIONAL COSTUME** — Authenticity and Cultural Representation · Creativity and Originality ·
Craftmanship and Attention to Detail · Visual Impact and Overall Appearance · Stage Presentation and Poise

**3 · CHUKCHAK (SELF INTRODUCTION)** — Humor and Wit · Creativity and Originality · Confidence and Stage
Presence · Delivery and Timing · Audience Impact and Entertainment Value

**4 · OPENING SPEECH** — Content and Message · Confidence and Stage Presence · Communication and
Articulation · Personality and Charisma · Overall Impact and Impression

**5 · GOWN** — Gown Presentation · Creativity and Wit · Confidence and Stage Presence · Styling and
Overall Apperance · Audience Impact and Entertainment Value

**6 · DEBA TEH (DEBATE CHALLENGE)** — pair vote, no criteria

**7 · WITTY QUESTION (TOP 5)** — Wit and Humor · Intellegence and Relevance · Spontaneity and Quick
Thinking · Confidence and Composure · Communication and Audience Impact

**8 · FINAL QUESTION (TOP 3)** — Content and Relevancce · Depth of Thought and Wisdom · Confidence and
Composure · Communication and Articulation · Impact and Authenticity

(Spellings are the organizers' own — kept verbatim so printouts match what the judges signed in 2026.)

## Step 6 — The 3 judges (Judges)

Create each judge (login **is** the name) and tick **every** category in the assignment grid:

| Judge (login) | Password |
|---|---|
| INDAY RYZA | judge1 |
| ROXY BANDEJO | judge2 |
| JOHN LEONARD MALAZARTE | judge3 |

Rehearsal passwords, same habit as the old system — set proper ones for any real event.

## Step 7 — Event night, top to bottom

1. **Go live** on the Events screen. Judges open `http://<server-ip>` on their laptops, choose *Judge*,
   and log in with their name.
2. **Open round 1** (Event overview → Open round). The overview's "how the field narrows" ladder shows
   the plan: 52 → 52 → 52 → 20 → 10 → 10 → 5 → 3.
3. **Judges score.** Each keystroke autosaves ("Saving… / Saved"); **Review scores** shows the whole
   sheet with anything missing; **Submit** locks it. After submit a judge can only be reopened with the
   admin's *Allow changes*.
   - *Rehearsal shortcut:* turn on **Testing mode** in Event Management — `Shift+J` fills random scores,
     `Shift+P` perfect scores. Testing scores never count in real reports, and *Start over* wipes them.
4. **Close the round** when every judge is in. The system tabulates, writes ranks, and **fills the next
   round with the advancers** ("N candidates go on to GOWN"). If candidates tie at the cut line, it asks
   whether to **send all of them on** — in 2026 such calls were made by hand.
   - **A cut decided by hand** (CHUKCHAK → the Top 20): closing the round ranks the field but sends
     nobody on automatically. The **"Who competes in OPENING SPEECH"** panel below is where you assemble
     the list — every row shows the candidate's place on the combined basis (the judges' choice
     ranking), so pick the ten at the top, then add the ten the in-person roulette produces. Remove and
     add freely until the round opens; the "went on" flags on CHUKCHAK's report follow the list.
   - **Penalties and fixes**: the **"Score adjustments"** panel takes points off (or adds them) with a
     reason — the guideline-14 automatic 5-point deduction lives here. They count at full value in the
     round's score and its cut, and print on the round report with the reason.
   - **A withdrawal**: on the Candidates screen, *Withdraw* keeps the candidate in every record and
     report but out of the ranks and the cuts. Restore the same way.
5. **Print the round**: Reports → *By round* → Print under the school letterhead, and *By judge* sheets
   for judges to check. Say hi to the print dialog — every report prints from the browser.
6. Repeat for rounds 2–8. For **DEBA TEH**, generate the pairings first (Event overview → *Set pairs*:
   *Ranked* draws 1 vs last from the previous round's ranks; *Random* shuffles). Judges vote a winner
   per pair and submit; a tied pair blocks closing, exactly like missing scores. Closing DEBA TEH sends
   the Top 5 on **by its cut basis — Gown and Deba Teh combined** (guideline 11), which is shown as its
   own ranking when you close.
7. **Finals**: after FINAL QUESTION closes, *Overall ranking* drops its "Provisional" mark and names
   Champion / 1st / 2nd / 3rd Runner-up. Print it and the judge sheets, **Download Excel**
   of any report, and take a database backup (`docker compose exec db pg_dump -U tabulation tabulation > backup.sql`,
   or the nightly `--profile backup` service).

**What to watch while you run it** (the differences from the old system, felt live):

- **Cuts are data, not code.** A cut can be a plain "Top N of this round", a **combined basis** ("Basis
  of Top 5: Gown and Deba Teh"), or **decided by hand** — and any mix of them, changed per event without
  touching code. In 2026 the Top 20 was 10 by judges' choice plus 10 by lot (Appendix A); the field
  panel reproduces that flow exactly.
- **The combined total has a screen.** Reports → *Combined score* sums any selection of closed rounds,
  each times its weight — the "basis" ranking when a cut is announced, or a grand total of the night.
  The podium is still the final round's placing; in 2026 both agree: 21 – 24 – 20.
- **Everything is one flow**: open → score → submit → close → print, with live standings on the admin
  overview as scores land.

## Step 8 — Wrap-up

Reports live under each event: **Overall ranking**, **By round**, **By candidate**, **By judge** — each
printable (letterhead, "Printed \<date\>") and exportable to Excel. Reports can be
split by a group value (e.g. a country). When the night is over, flip the event to **Finished**.

---

## Appendix A — The real 2026 results

From the old system's post-event dump (`Hara2026Results.zip`). Old printouts summed raw points across
3 judges (max 150 per five-criterion segment, 30 for DEBA TEH); this system reports each round out of
100 — same orderings, different scale.

| Segment | 1st | 2nd | 3rd |
|---|---|---|---|
| 101 PRODUCTION NUMBER | #21 JUDE MACARAYA 108.70 | #35 MHIEKYLE TARRA 107.50 | #20 TIRSO TAMAYO 106.80 |
| 102 NATIONAL COSTUME | #21 JUDE MACARAYA 113.80 | #20 TIRSO TAMAYO 111.30 | #40 KIM BRLTRAN 110.00 |
| 103 CHUKCHAK | #18 REXLIE FEDELIS 105.60 | #21 JUDE MACARAYA 104.60 | #20 TIRSO TAMAYO 104.30 |
| 104 OPENING SPEECH | #21 JUDE MACARAYA 115.30 | #16 BRYCE RESTITUTO 107.10 | #22 RJHAY BELIC 106.70 |
| 105 GOWN | #21 JUDE MACARAYA 130.30 | #22 RJHAY BELIC 123.80 | #20 TIRSO TAMAYO 121.50 |
| 106 DEBA TEH | #28 KATHIANA GARCIA 26.50 | #16 BRYCE RESTITUTO 26.10 | #21 JUDE MACARAYA 25.80 |
| 107 WITTY QUESTION | #21 JUDE MACARAYA 131.10 | #24 FRANCKLIN GONZALES 125.30 | #20 TIRSO TAMAYO 123.80 |
| 108 FINAL QUESTION | #21 JUDE MACARAYA 129.90 | #24 FRANCKLIN GONZALES 117.60 | #20 TIRSO TAMAYO 65.70 |

**Grand totals (all segments, all judges):** #21 JUDE MACARAYA (JAPAN) **859.50** — champion ·
#24 FRANCKLIN GONZALES (LEBANON) 779.90 · #20 TIRSO TAMAYO (JAMAICA) 760.80 · #16 BRYCE RESTITUTO
(HONDURAS) 671.40 · #28 KATHIANA GARCIA (MOROCCO) 664.00. The final-question finishing order (21 – 24 –
20) is the same podium, which is what the *Overall ranking* report will show.

How the night's cuts were decided (guidelines p. 8 "BASIS OF" block, verified against the rosters):

| Cut | Rule (guideline) | In the data |
|---|---|---|
| → 20 for OPENING SPEECH | **10 by judges' choice** on Production Number + Chuk-chak + National Costume, **+ 10 by a draw by lot** (guideline 9) | The judges' ten were exactly the top 10 of the three-segment combined sums: #21, 20, 18, 28, 9, 15, 14, 16, 2, 45. The lottery ten — #19, 22, 24, 31, 32, 36, 38, 43, 49, 52 — sit anywhere from 18th to 50th on the same basis. The eventual 1st Runner-up #24 FRANCKLIN GONZALES was a lottery pick |
| → 10 for GOWN | top 10 of OPENING SPEECH (the advocacy speech, guideline 10) | matches exactly |
| → 10 for DEBA TEH | top 10 of GOWN (same ten) | matches exactly |
| → 5 for WITTY QUESTION | **Gown + Deba Teh combined** (guideline 11) | matches exactly |
| → 3 for FINAL QUESTION | top 3 of WITTY QUESTION (guideline 12) | matches exactly |

Other rules from the guidelines that the tabulation side meets through its generic features:

- **Guideline 14 — automatic 5-point deduction** per violation (hazardous costume materials), "applied
  to the contestant's total raw score after tabulation and prior to the announcement of the Top 20".
  That is the **Score adjustments** panel: −5 with the reason, entered on CHUKCHAK before its close.
- Operational rules stay outside any tabulation system: the 1-minute mic cutoff (guideline 8), the
  60-second answers with headphones for the Top 3 (guideline 13), and the minor/major awards and house
  points (pp. 8–9) are run on paper and on stage.

DEBA TEH note: in 2026 it was one graded "Win or Lose" criterion (0–10 per candidate — the winners
above are totals like 26.50/30). The printed rubric on p. 7 was changed twice before the show: the
handwritten "not included" crosses out *Confidence and Stage Presence*, and the night actually ran the
single win-or-lose grade. The pair-vote round used here is the new system's native debate flow; if you
want to grade win-or-lose instead, make round 6 a *Scored* round with that single 0–10 criterion.

## Appendix B — Scripted setup

`apps/api/src/seed-hara2026.ts` builds everything above (the clean event) and can also load the real
ballots as a second, already-finished event (the replay) and emit the import rehearsal files:

```bash
# make the dump and the flag photos available to the API container
docker compose cp Hara2026Results.zip api:/app/apps/api/
docker compose cp ../Tabulation-System/public/flags api:/app/apps/api/flags

docker compose exec api node dist/seed-hara2026.js --emit-imports   # clean event + hara2026-import/
docker compose exec api node dist/seed-hara2026.js --replay         # replay event with the 2,940 ballots
docker compose cp api:/app/apps/api/hara2026-import ./hara2026-import
```

Re-runs need `--replace` (it deletes the event of the same name and starts over). With the dev stack:
`npm run seed:hara2026 -w apps/api -- --replay --replace`. The replay event's reports should match
Appendix A's orderings segment for segment — the same numbers, out of 100.
