# Chart

## Layout

Wide (≥ 960 px): chart (3fr) side-by-side with lap details (2fr).  
Narrow: chart stacked above lap details.

---

## X-Axis

- elapsed time formatted as `mm:ss` or `h:mm:ss`
- first tick anchored at the left edge of the visible range, last tick at the right edge
- nice round intervals between them (5 s, 10 s, 30 s, 1 min, 5 min, etc.)

---

## Series

### Elevation (background)
- subtle filled area in warm gray
- toggleable — default ON if data is present

### Primary series
Toggleable, each on its own independently-scaled Y-axis. Toggle order (left to right):

| Series     | Default | Color  |
|------------|---------|--------|
| Pace       | ON      | indigo |
| Power      | OFF     | amber  |
| Heart Rate | OFF     | red    |
| Cadence    | OFF     | green  |

#### Y-axis domain rules (per series)

All domain bounds are computed from each series' own data — no axis shares scale with another.

- **Elevation**: `dataMin − 10` floor, `dataMax + 30` ceiling.
- **Pace**: bounds computed from values within a sport-specific cap (15:00/km running, 25:00 walking, 30:00 hiking, 40:00 swimming) to exclude GPS drift and stops. 15% symmetric padding added. Values outside the range are clipped via `allowDataOverflow`.
- **Power**: fixed floor at 0 W (coasting is a valid zero), 15% ceiling headroom.
- **Heart Rate**: if any values are 0 (sensor dropout), floor = `min(non-zero) / 2` and those points are clipped; otherwise auto floor. 15% ceiling headroom. Values above 220 bpm are excluded from ceiling computation to prevent sensor glitches from compressing the chart.
- **Cadence**: fixed floor at 0, 15% ceiling headroom.
- **Speed**: auto-scaled.

---

## TOTAL / LAP Toggle

A compact pill toggle sits at the right end of the series chip row, below a `TIME · DIST` label.

- **TOTAL** (default): the hover tooltip header shows elapsed time and distance since the start of the workout.
- **LAP**: the header shows elapsed time and distance since the start of the current lap. The Finish marker is excluded from lap-start detection so hovering at the very end shows last-lap values.
- Preference is persisted to `localStorage`.

---

## Lap Markers

- thin vertical reference lines at each current marker position
- update live as laps are merged

---

## Interactions

- chart SVG is inert to pointer events; a transparent overlay handles all input
- hovering shows sliding active dots on each visible series
- cursor snap-pull: hover position slides smoothly toward the nearest recorded data point within 30 px
- hovering shows a tooltip box with time · distance in the header and active series values below; box auto-sizes to content and anchors left of cursor, flipping to avoid the right edge
- no focus rings on SVG elements

---

## Zooming

- click-drag to zoom in; single click anywhere resets to full view
- zoomed view includes ~10% padding beyond the selection on each side
- padding areas shown with a subtle gray veil to indicate the selection boundary
- a new drag can start from within a veil to re-zoom without first resetting
- minimum zoom window: 10 seconds
- zoom boundaries snap to whole seconds; drag endpoints also apply snap-pull toward nearest data point
- clicking a lap row in the table zooms the chart to that lap
- clicking the Total/Avg footer row resets the zoom
