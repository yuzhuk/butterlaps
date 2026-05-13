# FIT Lap Editor — POC Requirements (v0.1)

## Product Summary

A lightweight web app for editing lap markers inside FIT activity files without damaging original activity data.

Primary use case:
- user uploads a FIT file with incorrect/missing laps
- edits lap boundaries visually on an interactive chart
- exports corrected FIT file
- resulting FIT remains compatible with Garmin/Strava/etc.

Core product value:
> “Edit your laps without losing your data.”

This is a precision editing tool, not an AI coach, analytics platform, or social app.

---

# Core Principles

## 1. Preserve FIT Integrity

Non-negotiable.

The app must:
- preserve unknown FIT messages
- preserve developer fields
- preserve vendor-specific fields
- preserve timestamps whenever possible
- rewrite minimum possible structures

Goal:
- exported FIT should behave identically except for lap structure

Avoid destructive transformations.

---

## 2. Manual-First UX

v0.1 contains NO AI lap detection.

The editing experience itself is the product.

Focus on:
- speed
- clarity
- smooth interactions
- deterministic behaviour

---

## 3. Desktop-First

Primary target:
- desktop/laptop browsers

Responsive support is required, but mobile-first UX is NOT a priority.

---

# Scope

## In Scope

- FIT upload
- FIT parsing
- chart rendering
- existing lap visualisation
- manual lap editing
- lap snapping
- zooming
- lap summary table
- FIT export

## Explicitly Out of Scope (v0.1)

- AI suggestions
- accounts
- cloud storage
- Strava/Garmin sync
- social features
- advanced analytics
- trimming activities
- merging activities
- GPX/TCX support
- mobile app

---

# Supported Activities

Initial:
- running
- cycling

---

# Accepted Input

## File Types

Supported:
- .fit

Reject:
- invalid FIT
- unsupported activity types
- empty/corrupted streams

Errors must be human-readable.

---

# FIT Parsing Requirements

Extract at minimum:
- timestamps
- elapsed time
- distance
- pace/speed
- heart rate
- power
- cadence
- elevation
- existing lap markers

Preserve:
- all unknown/developer/vendor fields

---

# Data Model

IMPORTANT:
Represent laps internally as boundary markers, not lap objects.

Example:

markers = [t1, t2, t3]

NOT:

laps = [{ start, end }, ...]

Lap objects are derived from marker boundaries.

This simplifies:
- dragging
- insertion
- deletion
- recalculation

---

# Main UI Layout

## Wide/Desktop Layout

|---------------- chart ----------------| lap list |
|---------------------------------------|----------|

## Narrow Layout

|------------- chart ------------------|
|--------------------------------------|
|------------- lap list ---------------|

---

# Chart Requirements

## X-Axis

- elapsed time (mm:ss or h:mm, always rounded to whole seconds)
- first tick anchored at the left edge of the visible range, last tick at the right edge
- nice round intervals between them (5s, 10s, 30s, 1m, 5m, etc.)

## Interaction

- chart area is inert to clicks: no text selection, no focus rings on SVG elements
- hovering shows active dots that slide along each visible series (kept)
- no tooltip popup, no vertical cursor line

---

# Series

## Background Series

### Elevation
- subtle filled area in warm gray (visually distinct from data series)
- toggleable (default ON)

---

## Toggleable Primary Series

Toggle order (left to right):
1. pace (default ON)
2. power
3. heart rate
4. cadence

Each series auto-scales on its own independent axis.

---

# Zooming

- click-drag to zoom in; single-click anywhere to reset to full view
- when zoomed, the view includes ~10% padding beyond the selected range on each side
- padding areas are shown with a subtle gray veil so the user can tell where the selection boundary is
- the user can start a new drag from within a veil to re-zoom slightly wider without resetting first
- minimum zoom window: 10 seconds
- zoom boundaries snap to whole seconds

---

# Lap Visualization

Laps should appear as:

- vertical boundary markers
- lightly shaded lap regions

---

# Marker Editing

## Dragging

User can:
- drag lap markers horizontally
Dragging must feel smooth and responsive.

## Adding Markers

Interaction:
- double click chart to add marker

## Deleting Markers

Delete by dragging marker onto neighbouring marker.
Behavior:
- if marker distance < threshold:
- UI shows visual feedback when dragged near
- marker merges/deletes on release
Avoid confirmation dialogs.

## Snapping

Snapping is REQUIRED.
Default:
- 10 seconds

Internally:
- snapping should prefer actual data points/samples
Time snapping should guide candidate selection.

---

# Export Requirements

Targets:
- Garmin Connect
- Strava
- Stryd
- HealthFit

Must preserve FIT structure and compatibility.

---

# Lap Summary Table
Required.
Display (if at least one value exists):
- lap number
- duration
- distance
- avg pace
- avg power
- avg HR (if available)
- max HR (if available)
Table updates live during editing (but not while dragging).

Clicking a lap:
- zooms chart to lap

# Non-Goals

NOT:
- AI coaching
- social features
- analytics platform

Goal:
> fix FIT lap metadata cleanly.