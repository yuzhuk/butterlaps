# Project Structure

This document describes the recommended folder layout for the `BetterLaps` project. It is intended as a reference for implementation and future work.

## Recommended layout

```
/betterlaps
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
├── README.md
├── .gitignore
└── src
    ├── main.tsx
    ├── App.tsx
    ├── styles.css
    ├── types.ts
    ├── fit
    │   ├── fitParser.ts
    │   ├── fitWriter.ts
    │   └── fitTypes.ts
    ├── components
    │   ├── FitUpload.tsx
    │   ├── ChartPanel.tsx
    │   ├── LapSummary.tsx
    │   ├── MarkerList.tsx
    │   └── SettingsPanel.tsx
    ├── hooks
    │   ├── useFitActivity.ts
    │   ├── useMarkerDrag.ts
    │   └── useZoomPan.ts
    ├── utils
    │   ├── format.ts
    │   ├── snap.ts
    │   └── validation.ts
    └── tests
        ├── App.test.tsx
        ├── fitParser.test.ts
        └── components
            ├── FitUpload.test.tsx
            └── ChartPanel.test.tsx
```

## Purpose of each area

- `src/fit`
  - Handles FIT-specific parsing, writing, and domain types.
  - Keeps FIT integrity logic isolated from UI concerns.

- `src/components`
  - Contains reusable UI components for upload, chart, lap summary, and controls.
  - Keeps the app structure modular and easy to extend.

- `src/hooks`
  - Contains composable interaction logic for state, drag/zoom behavior, and marker editing.
  - Helps keep components focused on rendering.

- `src/utils`
  - Shared helpers for formatting, snapping, validation, and other generic utilities.

- `src/tests`
  - Dedicated tests for components and core FIT parsing behavior.

## Notes

- Keep the root small and focused on project configuration, build tooling, and documentation.
- The `src` folder is the primary implementation surface.
- Future additions can include `src/assets` for icons/static assets and `src/constants.ts` for app-wide values.
