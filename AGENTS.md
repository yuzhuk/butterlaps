# ButterLaps AI Agent Instructions

This repository is a small React + TypeScript browser app for editing lap boundaries inside FIT activity files.

## What to know first

- The app is a client-only Vite project. There is no backend.
- Core logic lives in `src/fit` for FIT parsing/export and `src/hooks` for interaction state.
- UI is in `src/App.tsx` and `src/styles.css` with minimal component structure.
- Keep changes small, type-safe, and aligned with the existing proof-of-concept architecture.

## Build and test commands

- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Test: `npm run test`

## Key project conventions

- Use TypeScript everywhere.
- Prefer functional React components and hooks; avoid class components.
- Keep components focused and under ~250 lines.
- Keep state logic in custom hooks rather than large component state.
- Isolate FIT integrity logic in `src/fit` and preserve original FIT payloads when editing.
- Avoid inline styles; use `styles.css` or future component-scoped styling.

## Important files

- `src/fit/fitParser.ts` — FIT parsing and any core data-model logic.
- `src/types.ts` — shared TypeScript types for lap/marker/activity data.
- `src/App.tsx` — application composition and top-level UI state.
- `src/main.tsx` — Vite app bootstrap.
- `src/styles.css` — base styling.

## Useful documentation

- `project-structure.md` — recommended folder layout and responsibilities.
- `data-model.md` — core domain model concepts.
- `tech-stack.md` — stack choices and FIT parsing/export expectations.
- `engineering-rules.md` — implementation and architecture rules.

## How to use this file

- Use this file as the top-level guide for code changes, feature work, or refactors.
- When in doubt, follow the repository docs and preserve the current POC architecture.
