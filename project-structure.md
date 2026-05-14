# Project Structure

## Repository layout

```
/butterlaps
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── README.md
├── CLAUDE.md
├── engineering-rules.md
├── tech-stack.md
├── data-model.md           ← draft type definitions (predates docs/)
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
- `src/components` — UI components; currently ChartPanel and its zoom overlay
- `src/tests` — Vitest unit tests; sample FIT files live in `test-data/`
- `docs/` — all requirements and design decisions; `requirements.md` is the index
