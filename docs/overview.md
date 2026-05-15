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

- FIT upload — file picker and drag-and-drop; supports multi-lap Stryd/Apple Watch files
- FIT parsing with metadata: data point count, recorded date, detected metrics
- interactive chart with series toggles (with localStorage persistence) and zoom
- cursor snap-pull — hover and drag endpoints slide smoothly toward nearest data point
- lap visualisation as vertical reference lines on the chart
- drag lap markers horizontally on the chart; marker snaps to nearest data point on release
- double-click chart to add a new marker
- drag marker onto neighbour to delete
- lap merge via table button
- lap summary table (live-updating, color-coded by series)
- change summary before export
- FIT export with full lap rewrite; preserves all non-lap bytes including per-lap definition re-emission
- editable export filename
- light / dark / system theme with persistence
- beforeunload confirmation when there are unsaved changes

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
- swimming

Cadence unit adapts: `spm` for running, `rpm` for cycling and swimming.
