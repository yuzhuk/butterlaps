# Changelog

All notable changes to ButterLaps are documented here.

## [0.1.1.31] — 2026-05-18

### Added
- Float-based workspace layout with 4-step page structure

### Fixed
- Marker drag-to-delete works when the split point is near the Finish edge
- Per-series gap interpolation thresholds (Elev 60 s, HR/Cad 30 s, Power/Pace/Speed 15 s)
- METRICS chip order and Elevation chip position now match cursor tooltip order
- Stryd developer `Distance` field excluded from unshown-series detection
- No axis ticks rendered inside veil zones when zoomed — only outer edges and zoom-range ticks

## [0.1.1.27] — 2026-05

### Added
- Device and subSport metadata display in the info panel
- Lap developer-field detection with conditional table row
- Global drop zone — drop a `.fit` anywhere on the page, not just the upload frame
- Binary active/recovery row tinting in the lap table based on average power
- TOTAL/LAP tooltip toggle with persistence across sessions
- Pace y-axis domain clipping to remove outlier spikes
- Smarter y-axis domains for HR, power, and cadence

### Changed
- Thinner chart lines and tighter power tint thresholds
- Tooltip box layout unified for hover and drag states
- Drag tooltip stays right of the marker until it hits the edge, then slides left
- Header UX polish; X-axis border ticks; adaptive hover tooltip box

### Fixed
- Average power anchored to the activity series, not per-lap averages
- Merge button comment arithmetic corrected; lap table zoom tip added
- X-axis always renders all ticks; end-ticks use 9 px font uniformly
- Extracted `TooltipBox`, `labelsAt`, `lapOffsetAt` to eliminate hover/drag duplication

## [0.1.1] — 2026-04

### Added
- Swimming and multisport activity support with sport-block rendering
- Walking and hiking activity support
- Animated merge button with split-cross chevrons
- Custom metric tooltips per series
- Gap markers in the chart for large data gaps
- Per-sport series toggle persistence with Pace/Speed interchangeability
- Speed (km/h) series for cycling activities instead of Pace
- Snap-pull for precise marker placement on record boundaries
- Metadata panel (device, sport, date, duration, distance)
- Unsaved-changes guard before upload or navigation
- 28 compatibility tests across 15 public FIT files
- Rejection of unsupported activity types on upload

### Changed
- Full lap rewrite: snap-to-record, two-pointer boundary assembly, preflight validation
- Theme preference persisted across sessions
- Stryd developer-field export fix — round-trip integrity for power data

### Fixed
- Marker drag clamping, edit tracking, tooltip edge shift in dark theme
- Strip stray sentinel records with timestamps beyond the activity duration
- Suppress Recharts `-1` size warnings on mount
- System theme reactivity; rename Step Length → Stride Length
