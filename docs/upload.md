# File Upload

## Accepted Input

- `.fit` files only
- drag-and-drop onto the upload box, or file picker via button
- invalid/empty/unsupported files show a human-readable error
- multi-lap files with per-lap definition re-emission (Stryd, Apple Watch) are fully supported

## Upload Box

- dashed border; contains "Upload FIT file" button and "or drag and drop here" hint text
- border and background highlight (indigo) while a file is dragged over the box

## File Metadata (shown after successful upload)

- file size
- data point count (number of FIT records parsed)
- `Recorded:` date/time (first record timestamp, omitted if absent)
- device name (e.g. `Garmin Fenix 7`), sub-sport (e.g. `trail_running`), recording app (if present)
- `Metrics:` list of parsed chart series in display order (`Dist · Pace · Power · HR · Cad · Elev`); additional non-charted fields shown as `· +N` with a tooltip listing them
- lap developer fields (if any) listed below metrics
- unsaved-changes confirmation: browser shows a native dialog if user tries to close or refresh the tab before exporting
