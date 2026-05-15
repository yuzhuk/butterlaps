Review the current conversation for any UI, UX, or visual decisions made this session. Then read all design-related files and update them to reflect the current state of the product's look, feel, and interaction model.

Design files to check (read all that exist):
- `docs/overview.md` — product description and feature summary
- `docs/upload.md` — upload UX
- `docs/chart.md` — chart and series toggle UX
- `docs/lap-editing.md` — marker drag, zoom, merge UX
- `docs/lap-table.md` — lap table layout and interactions
- `docs/future.md` — planned or deferred design work
- Any root-level `.md` files that describe product behaviour

Steps:
1. Scan the session for: new UI elements, changed interactions, renamed controls, removed features, visual/style decisions, copy changes, animation behaviour.
2. Read each design doc. Update sections that are no longer accurate. Add descriptions of new elements or interactions where they belong.
3. Check `docs/future.md` — if something that was listed as future work was actually built this session, move it to the appropriate doc and remove it from future.md.
4. After updating, check for gaps: interactions or UI states that exist in the code but aren't described anywhere in the docs. Add concise entries for anything missing.
5. Do not invent future plans or speculate — only document what is currently implemented or explicitly decided.
6. Report what changed: a bullet per file, one line each.
