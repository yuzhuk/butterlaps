# Lap Editing

## Merge via Table (built)

A small circular merge button (hourglass icon) straddles the border between consecutive lap rows, aligned to the left of the row number column.

- always visible between rows (not shown after the last lap)
- hover: red background and border — communicates destructive action
- tooltip: "Merge"
- clicking removes the marker between the two laps and recalculates the combined interval

---

## Chart Editing (planned)

### Drag to reposition
User can drag a lap marker horizontally on the chart. Must feel smooth and responsive.

### Double-click to add
Double-click anywhere on the chart to insert a new marker at that position.

### Drag onto neighbour to delete
Drag a marker close to an adjacent marker to delete it.
- visual feedback appears when within the merge threshold
- marker merges/deletes on pointer release
- no confirmation dialog

### Snapping
- default snap interval: 10 seconds
- prefer actual data point timestamps when close
