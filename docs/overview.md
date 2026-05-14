# Overview

## Product Summary

A lightweight client-only web app for editing lap markers inside FIT activity files without damaging original activity data.

Primary use case:
- user uploads a FIT file with incorrect or missing laps
- edits lap boundaries visually on an interactive chart and/or in the lap table
- exports a corrected FIT file compatible with Garmin/Strava/Stryd/HealthFit

Core product value:
> "Edit your laps without losing your data."

This is a precision editing tool — not an AI coach, analytics platform, or social app.

---

## Core Principles

### 1. Preserve FIT Integrity

Non-negotiable. The app must:
- preserve unknown FIT messages, developer fields, vendor-specific fields
- preserve all record data and timestamps exactly
- rewrite the minimum possible structures (lap messages only)

Exported FIT behaves identically to the original except for lap structure.

### 2. Manual-First UX

v0.1 contains NO AI lap detection. The editing experience itself is the product. Focus on speed, clarity, smooth interactions, and deterministic behaviour.

### 3. Desktop-First

Primary target: desktop/laptop browsers. Responsive layout is required; mobile-first UX is not a priority.

---

## Scope

### Built (v0.1)

- FIT upload — file picker and drag-and-drop
- FIT parsing
- interactive chart with series toggles and zoom
- lap visualisation as vertical reference lines on the chart
- lap merge via table
- lap summary table (live-updating)
- FIT export with lap rewrite
- change summary before export

### Still Planned (v0.1)

- drag lap markers horizontally on the chart
- double-click chart to add a new marker
- delete marker by dragging it onto a neighbour
- snapping (default 10 s, prefer actual data points)

### Out of Scope (v0.1)

- AI suggestions
- accounts / cloud storage
- Strava/Garmin sync
- social features
- advanced analytics
- trimming or merging activities
- GPX/TCX support
- mobile app
- undo/redo (v0.2+)
- adding new laps from scratch (v0.2+)

---

## Supported Activities

- running
- cycling

Cadence unit adapts: `spm` for running, `rpm` for cycling.
