# Technology Stack

This document captures the recommended stack for the `BetterLaps` proof-of-concept application.

## Frontend

- `React` — UI component library for rendering the editor and managing state.
- `TypeScript` — static typing for safer domain modeling and maintainability.
- `Vite` — fast development server and build tool.

## UI / Styling

- `CSS` / `styles.css` — lightweight base styling for the initial desktop-first interface.
- Optional future additions:
  - `Tailwind CSS` for faster utility-driven styling
  - `CSS Modules` for component-scoped styles

## Charting and Interaction

- `visx` or `Recharts` — recommended for interactive line charts, custom series rendering, and overlay support.
- Custom drag/marker overlay code alongside the chart to handle lap boundary editing, snapping, and zoom.

## FIT parsing / export

- Browser-compatible FIT parser/writer library (for example `fit-file-parser`, `fit-decoder`, or a custom wrapper around a browser-friendly parser).
- The FIT layer must preserve:
  - unknown messages
  - vendor-specific fields
  - developer fields
  - timestamps wherever possible
- Export should rewrite only lap-related structures and preserve original FIT payload integrity.

## State and data model

- React component state and local hooks for initial POC state management.
- Optional lightweight store like `Zustand` if state grows beyond simple UI state.
- Marker-first model for lap editing, with derived lap objects computed from boundary markers.

## Testing

- `Vitest` — unit and component test runner.
- `@testing-library/react` — React component testing.
- Optional future E2E: `Playwright` for interaction flows and manual marker editing verification.

## Tooling

- `npm` — package management and scripts.
- `tsc` — TypeScript type-checking.
- `vite` — development server, build, and preview.

## Deployment

- Static site deployment from the build output.
- No backend required for v0.1; the application is client-only.

## Summary

The stack focuses on a small, maintainable browser-based app with:
- strong type safety via TypeScript,
- interactive charting via React-compatible chart tools,
- a lightweight FIT parsing/export layer,
- and a modular structure for future growth.
