# Climbing & Training Tracker

A personal, mobile-first training log built around one specific weekly climbing and strength programme. It runs entirely in the browser, stores everything on the device (IndexedDB), works offline once loaded, and can be installed to an iPhone home screen.

## Using it on an iPhone

1. Open the app's URL in **Safari** (see *Deploying* below for getting a URL).
2. Tap **Share → Add to Home Screen**.
3. Launch it from the home-screen icon. It opens full-screen, works without signal at the gym, and — unlike a normal Safari tab — iOS does not clear its storage after a week of inactivity.

Your data never leaves the phone. Export a backup now and then from **Profile → Data** (the iOS share sheet lets you save it to Files or send it to yourself).

## What it does

| Section | Purpose |
|---|---|
| **Today** | Today's scheduled workout, one-tap set logging with a rest timer, resuming unfinished sessions, daily recovery check-in, optional warm-up/cooldown checklists, quick logging of climbs, hangs, mobility and measurements. |
| **Schedule** | The Monday–Sunday programme, week-by-week status (done / skipped / not logged), the 10-week block, and a programme editor. |
| **Progress** | Weekly summary plus Strength, Climbing (incl. projects), Fingers (hangboard + weekly finger-loading pattern), Mobility (library + range of motion), Recovery and Body tabs. |
| **Log** | Searchable history of everything; tap any entry to edit or delete it. Past sessions can be added. |
| **Profile** | Training block and deloads, baselines and assessments, preferences, backup/restore, CSV export, sample-data preview. |

### Design rules the app follows

- **Prescribed vs actual are separate.** Each session stores a snapshot of the programme prescription and a separate target for that session. Changing targets, swapping, skipping or adding exercises never changes the programme.
- **Programme edits are versioned.** Saving the programme creates a version effective from that day; earlier sessions and their planned counts keep the old version.
- **No invented numbers.** Summaries and charts use only logged data; empty weeks show "—". There are no scores.
- **Conservative progression.** A load suggestion appears only when every set reached the top of the rep range with 2+ reps in reserve in each of the last two non-deload sessions. Nothing changes until you confirm. Suggestions pause while discomfort is flagged.
- **Discomfort flags, not diagnoses.** High (≥ 5/10) or rising finger, elbow or shoulder discomfort is flagged with a prompt to reduce or modify loading.
- **Hangboarding is never scheduled.** The introductory template unlocks from week 5 only after you confirm recovery has been good. Finger loading from limit bouldering, board climbing and projecting is shown everywhere it matters.
- **Your past grade is not a target.** Current level comes only from logged sends.
- **Sample data is isolated.** "Preview with sample data" switches to a separate database with a permanent banner; real data is untouched.

## Development

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run test:e2e
```

- `npm test` runs the unit tests (programme data, deload maths, weekly summary calculations, progression rules, discomfort flags, storage, backup round-trips) with Vitest and `fake-indexeddb`.
- `npm run test:e2e` builds the app and drives it in an iPhone 12-sized Chromium window with Playwright: logging, editing and deleting, resume after reload, weekly summary, sample-data isolation, export/import and discomfort flags. Requires the `playwright` package and a Chromium install.
- `npm run build` outputs a static site to `dist/` with relative paths and an offline service worker.

### Stack

React 19 + TypeScript, Vite, Dexie (IndexedDB), hand-written SVG charts. The build targets Safari 14+.

### Layout

```
src/
  data/        programme, exercise library, defaults, sample data
  db/          types, Dexie database, repository functions, backup/CSV
  domain/      pure logic: sessions & deload, summaries, progression, recovery flags, finger load, block phases
  components/  UI primitives, charts, logging sheets, rest timer
  screens/     Today, Session, Schedule, Progress tabs, Log, Profile
tests/
  unit/        vitest
  e2e/         Playwright script (iPhone 12 viewport)
```

## Deploying

The included workflow (`.github/workflows/pages.yml`) runs the tests on every pull request and, on pushes to `main`, publishes `dist/` to GitHub Pages. To enable it, set **Settings → Pages → Source** to **GitHub Actions** (GitHub Pages on a private repository requires a paid plan). Any static host works too — upload the `dist/` folder.
