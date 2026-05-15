# Project Structure

## Repository layout

```
/butterlaps
├── package.json
├── tsconfig.json
├── vite.config.ts
├── increment-build.js
├── index.html
├── README.md
├── CLAUDE.md
├── AGENTS.md
├── engineering-rules.md
├── design/                 ← design mockups and reference assets
├── docs/                   ← requirements, design docs, and project reference
│   ├── requirements.md     ← index
│   ├── overview.md
│   ├── upload.md
│   ├── data-model.md
│   ├── chart.md
│   ├── lap-editing.md
│   ├── lap-table.md
│   ├── export.md
│   ├── future.md
│   ├── tech-stack.md
│   └── project-structure.md  ← this file
├── test-artifacts/         ← Playwright scripts and screenshots (gitignored)
├── test-data/              ← sample .fit files for tests (gitignored)
└── src
    ├── main.tsx
    ├── App.tsx
    ├── format.ts           — pure formatter functions (duration, pace, file size, date)
    ├── styles.css
    ├── types.ts
    ├── fit/
    │   ├── fitParser.ts    — parses ArrayBuffer → FitActivity
    │   └── fitWriter.ts    — rewrites lap messages in raw FIT bytes
    ├── components/
    │   ├── LapTable.tsx    — lap table, merge button, lap interval helpers
    │   ├── ChartPanel.tsx
    │   └── ChartZoomOverlay.tsx
    └── tests/
        └── fitParser.test.ts
```

## Purpose of each area

- `src/fit` — FIT-specific parsing, writing, and integrity logic, isolated from UI
- `src/components` — UI components; lap table, chart panel, and zoom/marker overlay
- `src/format.ts` — pure formatter functions shared across components
- `src/tests` — Vitest unit tests
- `test-artifacts/` — Playwright visual test scripts and screenshots (gitignored)
- `test-data/` — sample FIT files used by tests (gitignored)
- `design/` — design mockups and reference CSS/JSX
- `docs/` — all requirements, design decisions, and project reference; `requirements.md` is the index
