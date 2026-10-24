# Design

The admin and judge screens follow the app-screen rules of [taste-skill](https://github.com/Leonxlnx/taste-skill). The dealt direction is saved in `.taste-skill/direction.json`; reprint it with `node <taste-skill>/scripts/draw.mjs --show`.

## Style: framed sheet (seed 360678272)

One tinted L-shaped frame holds the sidebar and the 48px top bar. The work sits on a white sheet inset 8px from the window's right and bottom edges, with a 1px edge, 16px corners and no shadow. Chosen because the tabulator works in one long evening session: a quiet frame keeps the attention on the data.

- **Type**: IBM Plex Sans 400/500/600, bundled with `@fontsource` so it works offline at the venue. Tabular figures on every number.
- **Colour**: under 3% of the screen. Teal `#1b6c80` only on data (the open round in the cut ladder) and focus rings. The primary button is near-black. Status colours only in pale pills.
- **Tokens**: all in `:root` at the top of `apps/web/src/styles.css`.

## The product's face

- **Name and mark**: Tally, with a mark of four tally strokes crossed by a fifth, the oldest way to count.
- **Signature element**: the cut ladder on the event overview. Each round is a bar as long as its field, so the narrowing from 60 to 20 to 10 to 5 to 3 is the picture. The open round is teal; planned cuts are dashed outlines.
- **People**: judges get a stable initial on a pale tint of their own hue. Candidates show their photo thumbnail, or initials when there is none.

## Each screen's one question

| Screen | Question it answers first |
| --- | --- |
| Events | Which event is live, so judges can log in? |
| Event overview | Is the open round ready to close? |
| Candidates | Is every candidate in, with a number, house, level and photo? |
| Groups | Does every candidate have a house and a level? |
| Rounds and criteria | Do the cuts and criteria match the guidelines, with weights at 100%? |
| Judges | Does every judge have a login, and have they submitted? |
| Reports | Who won, and can every number be traced back to a judge? |

## Rules we keep

- No gradients, glows, glass, emoji, icons in tinted squares or sparklines.
- Red is a signal: only on the one destructive action per object and on real errors. Row-level remove links stay grey.
- Numbers right-aligned in tabular figures; a missing value is a grey dash; a zero is printed.
- Every screen has one h1 and its main job one click away (Add candidate, Add judge, Add round).
- On a phone the sidebar folds into a menu, tables become two-line rows, and the ladder puts each bar under its round name.

## Checking

```bash
node <taste-skill>/scripts/lint.mjs --app apps/web/src
```

```bash
node <taste-skill>/scripts/inspect.mjs --app http://localhost:5173/login
```

The inspector opens pages in a fresh browser, so it can only measure the login page; the admin screens are checked by hand at 1440 and 390 px.
