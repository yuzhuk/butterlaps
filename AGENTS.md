# ButterLaps AI Agent Instructions

This repository is a small React + TypeScript browser app for editing lap boundaries inside FIT activity files.

## What to know first

- The app is a client-only Vite project. There is no backend.
- FIT parsing and export logic lives in `src/fit/`.
- UI is in `src/App.tsx`, `src/styles.css`, and `src/components/`.
- Keep changes small, type-safe, and aligned with the existing architecture.

## Build and test commands

- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Test: `npm run test`
- Visual tests: Playwright scripts in `test-artifacts/` (use `.cjs` extension)

## Key project conventions

- Use TypeScript everywhere.
- Prefer functional React components and hooks; avoid class components.
- Keep components focused and under ~250 lines.
- Isolate FIT integrity logic in `src/fit/` and preserve original FIT payloads when editing.
- Avoid inline styles; use `styles.css`.
- No AI suggestions, no backend calls, no data leaves the browser.

## Important files

- `src/fit/fitParser.ts` — FIT parsing, marker extraction, series normalisation.
- `src/fit/fitWriter.ts` — FIT export, lap message rewrite, CRC recalculation.
- `src/types.ts` — shared TypeScript types for lap/marker/activity data.
- `src/App.tsx` — application composition and top-level UI state.
- `src/styles.css` — all styling (CSS custom properties for light/dark theming).
- `src/components/ChartPanel.tsx` — chart, series toggles, zoom wiring.
- `src/components/ChartZoomOverlay.tsx` — SVG overlay for zoom, markers, hover, drag.

## Useful documentation

- `docs/overview.md` — product summary, principles, built vs planned scope.
- `docs/requirements.md` — index of all requirement docs.
- `docs/project-structure.md` — folder layout and responsibilities.
- `engineering-rules.md` — implementation and architecture rules.
