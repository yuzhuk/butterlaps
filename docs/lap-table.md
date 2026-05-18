# Lap Summary Table

## Columns

| Column    | Notes                                      |
|-----------|--------------------------------------------|
| #         | lap number, narrow column                  |
| Start     | elapsed offset at lap start                |
| Duration  |                                            |
| Distance  | metres                                     |
| Pace      | /km                                        |
| Power     | W — only shown if data present             |
| HR        | bpm — only shown if data present           |
| Cadence   | spm (running) or rpm (cycling) — if present|

## Footer

Total / Avg row — pace is derived from total distance ÷ total time, not a simple average of lap paces.

## Formatting

- pace: `m:ss`
- durations: `m:ss` or `h:mm:ss`
- all other values: rounded integer with unit as a smaller, dimmed suffix

## Behaviour

- updates live as laps are merged
- **hovering** a data row highlights that lap in the chart: two `var(--plot-bg)` veils at 0.78 opacity cover the chart area outside the hovered lap's time range, dimming all series (lines and elevation area). Veils are rendered in the `ChartZoomOverlay` SVG so they sit on top of all chart series.
- **clicking** a data row zooms the chart to that lap
- clicking the footer row resets zoom
- rows are tinted green (active) or red (recovery) based on whether the lap's average power is above or below the session average power; no tint when power data is absent

## Hint

A single hint line is displayed below the table: `hover to highlight in chart · click to zoom in chart`
