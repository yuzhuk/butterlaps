# Lap Editing

## Merge via Table

A small circular merge button straddles the border between consecutive lap rows, aligned to the left of the row number column.

- always visible between interior rows (not shown on first or last row)
- hover: red background and border — communicates destructive action
- clicking removes the marker between the two laps and recalculates the combined interval

---

## Chart Editing

### Drag to reposition

Drag a lap marker horizontally on the chart to move it. The marker snaps to the nearest data point on release.

- dragging marker turns orange
- when dragged within merge threshold of a neighbour, turns red to signal a pending delete

### Double-click to add

Double-click anywhere on the chart to insert a new marker at that position.

### Drag onto neighbour to delete

Drag a marker close to an adjacent marker to delete it.

- visual feedback (red marker) appears when within the merge threshold
- marker is deleted on pointer release
- no confirmation dialog

### Snapping

- cursor snap-pull applies during both marker drag and zoom drag: the position slides smoothly toward the nearest recorded data point within 30 px (quadratic ease)
- on marker release, the marker commits to the nearest data point and the cursor immediately reflects the correct snapped position
