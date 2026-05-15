# ButterLaps

Edit lap boundaries inside FIT activity files without damaging original activity data.

## What it does

Upload a `.fit` file, edit lap markers visually on an interactive chart, export a corrected file. The export preserves every byte of original FIT structure outside the laps you actually touched.

Client-only — no backend, no accounts, no data leaves your device.

## Getting Started

```bash
git clone https://github.com/yuzhuk/lap-editor.git
cd lap-editor
npm install
npm run dev       # dev server at http://localhost:4173
npm run build     # production build (auto-increments build number)
npm run test      # run Vitest tests
```

## Documentation

- [`docs/overview.md`](docs/overview.md) — product summary, principles, scope
- [`docs/requirements.md`](docs/requirements.md) — index of all requirement docs
- [`docs/project-structure.md`](docs/project-structure.md) — folder layout and responsibilities
- [`docs/tech-stack.md`](docs/tech-stack.md) — stack choices and FIT parsing/export strategy
- [`engineering-rules.md`](engineering-rules.md) — implementation and architecture rules

## License

MIT
