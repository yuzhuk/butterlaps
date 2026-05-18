# Export

## What Is Rewritten

Only lap messages (FIT global message 19) are modified. Everything else — records, sessions, events, developer fields, unknown messages — is preserved byte-for-byte.

For each surviving lap message:
- `total_elapsed_time` (field 7) — sum of all merged lap values
- `total_timer_time` (field 8) — sum of all merged lap values
- `total_distance` (field 9) — sum of all merged lap values
- `timestamp` (field 253) — updated to `start_time + elapsed_seconds`
- `message_index` (field 254) — renumbered sequentially 0, 1, 2, …

Deleted lap messages (DEF + DATA byte pairs) are removed from the byte stream. File CRC and header CRC are recomputed.

### Per-lap definition re-emission

Stryd and Apple Watch FIT files emit a fresh definition message before each lap data message (valid FIT, common pattern). The writer preserves this structure: a template definition block is written at every original LAP definition position. This maintains the local-type ownership chain — without it, intervening RECORD definition messages would reclaim the local type slot and consumers would misread lap data as records.

---

## Filename

Each export appends or increments a `-butterlaps` suffix:

| Input filename               | Output filename                |
|------------------------------|--------------------------------|
| `activity.fit`               | `activity-butterlaps.fit`      |
| `activity-butterlaps.fit`    | `activity-butterlaps2.fit`     |
| `activity-butterlaps2.fit`   | `activity-butterlaps3.fit`     |

The number increments without limit.

---

## Change Summary Panel (03 Review)

Shown in the **03 Review** section (left column, below the chart in wide mode; below the lap table in narrow mode).

**No changes:**
```
No changes — lap boundaries match the original file
```

**With changes** (at least one merge or addition):

- Delta badges: `−N` (red, boundaries removed) and/or `+N` (green, boundaries added)
- Lap count arrow: `8 → 6 laps`
- "Removed @" line: timestamps of deleted boundaries (wraps if many)
- "Added @" line: timestamps of added boundaries, sorted ascending (wraps if many)

## Export Button (04 Download)

Shown in the **04 Download** section.

- **Disabled** — label "Export edited .fit" — when no changes have been made
- **Enabled** — label "Export edited .fit" — once markers differ from the original; editable filename field appears below the button
