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
├── tech-stack.md
├── data-model.md           ← original draft type definitions
├── project-structure.md    ← this file
├── design/                 ← design mockups and reference assets
├── docs/                   ← requirements and design docs
│   ├── requirements.md     ← index
│   ├── overview.md
│   ├── upload.md
│   ├── data-model.md
│   ├── chart.md
│   ├── lap-editing.md
│   ├── lap-table.md
│   ├── export.md
│   └── future.md
├── test-artifacts/         ← Playwright scripts and screenshots (gitignored)
├── test-data/              ← sample .fit files for tests (gitignored)
└── src
    ├── main.tsx
    ├── App.tsx
    ├── styles.css
    ├── types.ts
    ├── fit/
    │   ├── fitParser.ts    — parses ArrayBuffer → FitActivity
    │   └── fitWriter.ts    — rewrites lap messages in raw FIT bytes
    ├── components/
    │   ├── ChartPanel.tsx
    │   └── ChartZoomOverlay.tsx
    └── tests/
        └── fitParser.test.ts
```

## Purpose of each area

- `src/fit` — FIT-specific parsing, writing, and integrity logic, isolated from UI
- `src/components` — UI components; ChartPanel and its zoom/marker overlay
- `src/tests` — Vitest unit tests
- `test-artifacts/` — Playwright visual test scripts and screenshots (gitignored)
- `test-data/` — sample FIT files used by tests (gitignored)
- `design/` — design mockups and reference CSS/JSX
- `docs/` — all requirements and design decisions; `requirements.md` is the index
