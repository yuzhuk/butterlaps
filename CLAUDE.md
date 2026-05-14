# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**ButterLaps** — a client-only browser app for editing lap boundaries inside Garmin `.fit` activity files without modifying any other activity data. Users upload a FIT file, visually edit lap markers on an interactive chart, and export a corrected FIT that stays compatible with Garmin/Strava/Stryd/HealthFit.

No backend. No accounts. No AI suggestions. Precision editing tool only.

## Commands

```bash
npm install        # install dependencies
npm run dev        # dev server at http://localhost:4173
npm run build      # type-check + Vite production build (auto-increments build number)
npm run preview    # serve the dist/ output locally
npm run test       # run Vitest tests
```

Run a single test file: `npx vitest run src/tests/fitParser.test.ts`

## Architecture

### Key constraint: marker-first data model

Laps are never stored as `{ start, end }` objects. They are **derived** from an ordered `Marker[]` array. Every lap is the interval between two adjacent markers. This makes drag/insert/delete/recalculation straightforward.

`rawFitPayload: ArrayBuffer` is always preserved verbatim. The export layer rewrites only the minimum lap-related FIT structures — all unknown messages, developer fields, and vendor-specific fields must survive the round-trip unchanged.

### Code layout (current and intended)

```
src/
  types.ts          — shared domain types (Marker, FitActivity, Series, …)
  App.tsx           — top-level layout, file upload/export, lap table
  styles.css        — all styling (no inline styles)
  fit/
    fitParser.ts    — parses ArrayBuffer → FitActivity using fit-file-parser
    fitWriter.ts    — (planned) rewrites lap records into raw FIT bytes
    fitTypes.ts     — (planned) FIT-specific low-level types
  components/       — (planned) FitUpload, ChartPanel, LapSummary, MarkerList
  hooks/            — (planned) useFitActivity, useMarkerDrag, useZoomPan
  utils/            — (planned) format.ts, snap.ts, validation.ts
  tests/            — Vitest unit and component tests
```

### fitParser.ts flow

`parseFitFile(File)` → reads `ArrayBuffer` → runs `fit-file-parser` in `mode: 'both'` → normalises records from top-level or per-lap arrays → derives a `baselineMs` anchor (first record timestamp or first lap start_time) → builds `markers` (Start + one per lap + Finish, deduped, sorted) → builds `series` (Elevation, Heart Rate, Distance, Power, Cadence, Pace — only those present in data).

Pace is computed as `1000 / speed` (seconds per km from m/s).

Duration and distance prefer session-level FIT fields and fall back to record-level values.

## Engineering rules

From `engineering-rules.md` — treat these as non-negotiable:

- TypeScript everywhere, no `any` in new code
- Functional components and hooks only; no class components
- One source of truth per state; state logic lives in custom hooks, not large component bodies
- No inline styles — use `styles.css` or future CSS modules
- Components stay under ~250 lines
- No duplicated logic

## FIT integrity (non-negotiable product rule)

From `poc_requirements.md`:

- The export must preserve unknown messages, developer fields, vendor-specific fields, and timestamps
- Only lap-related structures should be rewritten
- Exported FIT must behave identically to the original except for lap structure

When touching export logic, always verify the raw payload is passed through unchanged for everything outside lap records.

## Version auto-increment

`npm run build` runs `node increment-build.js` before `tsc + vite build`. The fourth segment of the version in `package.json` is incremented automatically. Do not manually bump the build number.

## Testing notes

- Tests use Vitest + `@testing-library/react`
- FIT parsing tests can use the sample file at `test-data/1776592537-GIR.fit`
- E2E (Playwright) is not yet set up; marker drag interactions currently require manual browser testing
