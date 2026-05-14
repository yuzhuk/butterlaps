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

## Change Summary Panel

Shown in the summary section below the lap table.

**No changes:**
```
No changes
8 laps
```

**After merges:**
```
2 lap boundaries removed
8 laps → 6 laps
24:00, 48:00          ← timestamps of removed boundaries, dimmed
```

## Export Button

- **Disabled** — label "No changes to export" — when no laps have been merged
- **Enabled** — label "Export edited FIT file" — once at least one lap is merged
