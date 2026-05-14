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
Toggleable, each on its own auto-scaled Y-axis. Toggle order (left to right):

| Series     | Default | Color  |
|------------|---------|--------|
| Pace       | ON      | indigo |
| Power      | OFF     | amber  |
| Heart Rate | OFF     | red    |
| Cadence    | OFF     | green  |

---

## Lap Markers

- thin vertical reference lines at each current marker position
- update live as laps are merged

---

## Interactions

- chart SVG is inert to pointer events; a transparent overlay handles all input
- hovering shows sliding active dots on each visible series
- no tooltip popup, no vertical cursor line, no focus rings on SVG elements

---

## Zooming

- click-drag to zoom in; single click anywhere resets to full view
- zoomed view includes ~10% padding beyond the selection on each side
- padding areas shown with a subtle gray veil to indicate the selection boundary
- a new drag can start from within a veil to re-zoom without first resetting
- minimum zoom window: 10 seconds
- zoom boundaries snap to whole seconds
- clicking a lap row in the table zooms the chart to that lap
- clicking the Total/Avg footer row resets the zoom
