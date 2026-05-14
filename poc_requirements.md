# FIT Lap Editor — Requirements (v0.1)

## Product Summary

A lightweight client-only web app for editing lap markers inside FIT activity files without damaging original activity data.

Primary use case:
- user uploads a FIT file with incorrect or missing laps
- edits lap boundaries visually on an interactive chart and/or in the lap table
- exports a corrected FIT file that is compatible with Garmin/Strava/Stryd/HealthFit

Core product value:
> "Edit your laps without losing your data."

This is a precision editing tool — not an AI coach, analytics platform, or social app.

---

# Core Principles

## 1. Preserve FIT Integrity

Non-negotiable.

The app must:
- preserve unknown FIT messages
- preserve developer fields
- preserve vendor-specific fields
- preserve all record data and timestamps exactly
- rewrite the minimum possible structures (lap messages only)

Goal: exported FIT behaves identically to the original except for lap structure.

## 2. Manual-First UX

v0.1 contains NO AI lap detection.

The editing experience itself is the product. Focus on:
- speed
- clarity
- smooth interactions
- deterministic behaviour

## 3. Desktop-First

Primary target: desktop/laptop browsers.
Responsive layout is required; mobile-first UX is not a priority.

---

# Scope

## In Scope (v0.1)

- FIT upload (file picker + drag-and-drop)
- FIT parsing
- interactive chart with series toggles and zoom
- existing lap visualisation as vertical reference lines
- lap merge via table
- lap summary table (live-updating)
- FIT export with lap rewrite
- change summary before export

## Still Planned (v0.1)

- drag lap markers horizontally on the chart
- double-click chart to add a new marker
- delete marker by dragging it onto a neighbour
- snapping (default 10 s, prefer actual data points)

## Out of Scope (v0.1)

- AI suggestions
- accounts / cloud storage
- Strava/Garmin sync
- social features
- advanced analytics
- trimming or merging activities
- GPX/TCX support
- mobile app

---

# Supported Activities

- running
- cycling

Cadence unit adapts to activity type: `spm` for running, `rpm` for cycling.

---

# File Upload

## Accepted input

- `.fit` files only
- drag-and-drop onto the upload box, or file picker via button
- invalid/empty/unsupported files show a human-readable error

## Upload box

- dashed border, contains "Upload FIT file" button and "or drag and drop here" hint
- border and background highlight (indigo) while a file is dragged over

---

# FIT Parsing

Extract at minimum:
- timestamps and elapsed time
- distance
- pace (computed as `1000 / speed` s/km from m/s records)
- heart rate, power, cadence, elevation
- existing lap markers → `Marker[]`

Preserve raw `ArrayBuffer` verbatim for export.

---

# Data Model

Laps are represented internally as an ordered `Marker[]` array, never as `{ start, end }` objects. Laps are derived from adjacent marker pairs.

This simplifies drag, insert, delete, and recalculation.

```ts
type Marker = {
  timeOffsetSeconds: number;
  label: string;
};
```

`buildMarkers()` always produces:
- a `Start` marker at t = 0
- one `Lap N` marker per FIT lap (Lap 1 also at t = 0 — phantom duplicate that produces a zero-duration interval, which is filtered out everywhere)
- a `Finish` marker at the last record timestamp

`getLapIntervals(markers)` derives lap intervals by filtering out zero-duration pairs.

---

# Main UI Layout

## Wide (≥ 960 px)

```
|------------ chart (3fr) ------------|-- lap details (2fr) --|
```

## Narrow

```
|------------- chart ------------------|
|------------- lap details ------------|
```

---

# Chart

## X-axis

- elapsed time in `mm:ss` or `h:mm:ss`
- first tick anchored at the left edge of the visible range, last tick at the right edge
- nice round intervals between them (5 s, 10 s, 30 s, 1 min, 5 min, etc.)

## Series

### Elevation (background)
- subtle filled area in warm gray
- toggleable (default ON if present)

### Primary series (toggleable, each on its own auto-scaled Y-axis)
Toggle order: Pace (default ON) · Power · Heart Rate · Cadence

Each series has a distinct color:
- Pace: indigo
- Heart Rate: red
- Power: amber
- Cadence: green

## Lap markers
- thin vertical reference lines at each current marker position
- update live when laps are merged

## Interactions
- chart SVG is inert to pointer events; a transparent overlay handles all input
- hovering shows sliding active dots on each visible series (no tooltip popup, no cursor line)
- no focus rings on SVG elements

---

# Zooming

- click-drag on chart to zoom; single click anywhere to reset to full view
- zoomed view includes ~10% padding beyond the selection on each side
- padding areas shown with a subtle gray veil so the user can see the selection boundary
- the user can start a new drag from within a veil to re-zoom without first resetting
- minimum zoom window: 10 seconds
- zoom boundaries snap to whole seconds
- clicking a lap row in the table zooms the chart to that lap
- clicking the Total/Avg footer row resets the zoom

---

# Lap Editing

## Merge via table

A small circular merge button (hourglass icon) sits straddling the border between consecutive lap rows, aligned to the left of the row number column.

- always visible
- hover: red background and border (destructive action affordance)
- tooltip: "Merge"
- clicking merges the two adjacent laps: removes the marker between them, recalculates the combined interval

The button is not shown after the last lap (no neighbour to merge with).

## Chart editing (planned)

- drag lap markers horizontally to reposition
- double-click to add a new marker
- drag a marker onto a neighbour to delete it (visual feedback near threshold)
- snapping: default 10 s, prefer actual data point timestamps

---

# Lap Summary Table

Columns:
- `#` — lap number (narrow column)
- Start — elapsed offset at lap start
- Duration
- Distance (m)
- Pace (/km)
- Power (W) — if present
- HR (bpm) — if present, header abbreviated to "HR"
- Cadence (spm/rpm) — if present

Footer row: Total / Avg (weighted correctly — pace derived from total distance/time, not averaged)

Behaviour:
- table updates live when laps are merged
- clicking a data row zooms chart to that lap
- clicking the footer row resets zoom
- zebra striping on even rows

Values are formatted as:
- pace: `m:ss`
- durations: `m:ss` or `h:mm:ss`
- all others: rounded integer with unit shown as a smaller, dimmed suffix

---

# Export

## What is rewritten

Only lap messages (FIT global message 19) are modified. Everything else — records, sessions, events, developer fields, unknown messages — is preserved byte-for-byte.

For each surviving lap:
- `total_elapsed_time` and `total_timer_time` — sum of merged lap values
- `total_distance` — sum of merged lap values
- `timestamp` (field 253) — updated to `start_time + elapsed_seconds`
- `message_index` (field 254) — renumbered sequentially 0, 1, 2, …

Deleted lap messages (DEF + DATA) are removed from the byte stream.

File CRC and header CRC are recomputed.

## Export filename

- `activity.fit` → `activity-betterlaps.fit`
- `activity-betterlaps.fit` → `activity-betterlaps2.fit`
- `activity-betterlaps2.fit` → `activity-betterlaps3.fit`
- and so on — always increments the trailing number

## Export button and change summary

The summary panel shows a change plaque:

**No changes:**
> No changes
> 8 laps

**After merges:**
> 2 lap boundaries removed
> 8 laps → 6 laps
> 24:00, 48:00   ← timestamps of removed boundaries, dimmed

The export button:
- disabled ("No changes to export") when no laps have been merged
- enabled ("Export edited FIT file") once at least one lap is merged

---

# Non-Goals

Not in scope:
- AI coaching or lap detection
- social or sharing features
- analytics platform
- undo/redo (v0.2+)
- adding new laps from scratch (v0.2+)
