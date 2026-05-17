# Data Model & FIT Parsing

## Marker-First Model

Laps are represented internally as an ordered `Marker[]` array, never as `{ start, end }` objects. Laps are derived from adjacent marker pairs. This simplifies drag, insert, delete, and recalculation.

```ts
type Marker = {
  timeOffsetSeconds: number;
  label: string;
};
```

`buildMarkers()` always produces:
- a `Start` marker at t = 0
- one `Lap N` marker per FIT lap (Lap 1 is also at t = 0 — phantom duplicate that produces a zero-duration interval filtered out everywhere)
- a `Finish` marker at the last record timestamp

`getLapIntervals(markers)` derives lap intervals by filtering out zero-duration adjacent pairs.

---

## FIT Parsing

Extract at minimum:
- timestamps and elapsed time
- distance (cursor tooltip only — not plotted as a chart series)
- pace — computed as `1000 / speed` (s/km from m/s records)
- speed — used when pace is absent
- heart rate, power, cadence, elevation
- device name, sub-sport, device app
- existing lap markers → `Marker[]`
- developer field names present on lap messages (`lapDevFields`)

The raw `ArrayBuffer` is preserved verbatim on `FitActivity.rawFitPayload` for use by the export layer.

Short recording gaps (Garmin smart recording) are bridged by straight-line interpolation per series. `withGapBreaks(series, seriesName)` inserts null sentinels beyond per-series thresholds (15–60 s depending on series). See `docs/chart.md` for the full threshold table.

---

## Layout

```
src/
  types.ts                  — shared domain types (Marker, FitActivity, Series, …)
  format.ts                 — pure formatter functions (duration, pace, file size, date)
  fit/
    fitParser.ts            — parses ArrayBuffer → FitActivity
    fitWriter.ts            — rewrites lap records into raw FIT bytes
  components/
    LapTable.tsx            — lap table UI; exports getLapIntervals for use in App
```
