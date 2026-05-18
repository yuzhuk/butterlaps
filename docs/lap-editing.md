# Lap Editing

## Merge via Table

A small square button straddles the row boundary between consecutive laps, positioned just outside the right edge of the lap-number cell.

- visible between all consecutive lap rows except after the last lap
- idle state: 16×16 px, transparent background with brick-red border; displays a × icon (two SVG chevron halves overlaid to form a cross)
- hover state: expands rightward to ~60 px, brick-red background; the × splits apart into `‹ MERGE ›` — the chevrons are the same SVG halves pulled to opposite ends, with "MERGE" label revealed between them
- clicking removes the marker between the two laps and recalculates the combined interval

---

## Chart Editing

User-facing copy uses **split** for the vertical boundary lines. The internal data model calls them markers.

### Drag to reposition

Drag a split horizontally on the chart to move it. The split snaps to the nearest data point on release.

- dragging split turns orange
- when dragged within merge threshold of a neighbour, turns red to signal a pending delete

### Double-click to add

Double-click anywhere on the chart to insert a new split at that position.

### Drag onto neighbour to delete

Drag a split close to an adjacent split to delete it.

- visual feedback (red split line) appears when within the merge threshold
- split is deleted on pointer release
- no confirmation dialog

### Snapping

- cursor snap-pull applies during both marker drag and zoom drag: the position slides smoothly toward the nearest recorded data point within 30 px (quadratic ease)
- on marker release, the marker commits to the nearest data point and the cursor immediately reflects the correct snapped position
