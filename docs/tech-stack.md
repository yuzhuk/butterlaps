# Technology Stack

## Frontend

- `React` — UI component library for rendering the editor and managing state.
- `TypeScript` — static typing for safer domain modeling and maintainability.
- `Vite` — fast development server and build tool.

## UI / Styling

- `CSS` / `styles.css` — all styling via CSS custom properties for light/dark theming.
- No Tailwind, no CSS modules currently.

## Typography

Three typefaces loaded from Google Fonts:

| Role | Family | Weights |
|------|--------|---------|
| UI sans-serif | Manrope | 400 500 600 700 800 |
| Monospace / numeric | JetBrains Mono | 400 500 600 700 |
| Serif accent | Newsreader | italic 400 500 (optical size 6–72) |

**Manrope** is used for all UI text — headings, labels, buttons, section heads, delta counts. Bold elements (section number badges, delta +/− figures, the export button) use weight 800. Letter-spacing on uppercase Manrope labels is kept tight (0.06–0.10 em) to avoid the over-spaced look common with geometric sans-serifs.

**JetBrains Mono** is used for all numeric/data output — timestamps, pace, lap times in the review section, tooltip values, table data cells, series chips, and inline `.fit` filename references.

**Newsreader** (italic) is available as a display accent but is not currently applied to any production element.

## Charting and Interaction

- `Recharts` — interactive line/area chart, custom series rendering.
- Custom SVG overlay (`ChartZoomOverlay`) handles lap markers, drag editing, zoom, and hover.

## FIT parsing / export

- `fit-file-parser` — browser-compatible FIT parser (mode: `'both'`).
- `fitWriter.ts` — custom FIT export layer; rewrites only lap messages, preserves all other bytes verbatim.
- The FIT layer must preserve: unknown messages, vendor-specific fields, developer fields, timestamps.

## State and data model

- React component state and local hooks for UI state management.
- `localStorage` for theme preference and series toggle persistence.
- Marker-first model for lap editing; derived lap objects computed from boundary markers.

## Testing

- `Vitest` — unit and component test runner.
- `@testing-library/react` — React component testing.
- `Playwright` — visual/regression testing; scripts and screenshots in `test-artifacts/`.

## Tooling

- `npm` — package management and scripts.
- `tsc` — TypeScript type-checking.
- `vite` — development server, build, and preview.
- `increment-build.js` — auto-increments the fourth version segment on each build.

## Deployment

- Static site deployment from the build output in `dist/`.
- No backend required; the application is entirely client-side.
