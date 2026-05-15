# Technology Stack

## Frontend

- `React` — UI component library for rendering the editor and managing state.
- `TypeScript` — static typing for safer domain modeling and maintainability.
- `Vite` — fast development server and build tool.

## UI / Styling

- `CSS` / `styles.css` — all styling via CSS custom properties for light/dark theming.
- No Tailwind, no CSS modules currently.

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
