/**
 * Comprehensive round-trip tests for top-10 Garmin running models.
 *
 * Workflow per file:
 *   1. Parse   → record baseline numbers
 *   2. Add lap (split midpoint of first interval)
 *   3. Merge   (remove second interior marker)
 *   4. Move    (shift first interior marker one record forward)
 *   5. Record edited numbers
 *   6. Export via rewriteLaps
 *   7. Re-parse exported bytes
 *   8. Verify: lap count, duration, distance, device info survive
 *
 * Known limitations surfaced by these tests:
 *
 *   A. Developer fields in lap messages (FR745, Fenix 7S, Epix Gen 2 outdoor):
 *      newer Garmin outdoor-run files embed Running Dynamics and native Running
 *      Power as developer fields in each lap message. Our writer rejects these
 *      files with "developer fields in lap messages — not supported".
 *      → Tests for these files are parse-only; export is skipped.
 *
 *   B. Post-finish lap (FR955, FR935) — FIXED:
 *      fitParser now filters out laps whose snapped start ≥ durationSeconds from
 *      buildMarkers, and uses total_elapsed_time as the trim cutoff so post-stop
 *      cooldown records survive. The session_end lap no longer appears as a
 *      user-visible marker and is dropped cleanly by the slot-assignment writer.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseFitFile } from '../fit/fitParser';
import { validateFitForEditing, rewriteLaps } from '../fit/fitWriter';
import type { Marker } from '../types';

const DATA_DIR = join(__dirname, '../../test-data');

function makeFile(name: string): File {
  const filePath = join(DATA_DIR, name);
  const nodeBuf = readFileSync(filePath);
  const arrayBuf = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength);
  return new File([arrayBuf], name);
}

function skipIfMissing(name: string) {
  return existsSync(join(DATA_DIR, name)) ? it : it.skip;
}

async function reparse(buf: ArrayBuffer, name: string) {
  return parseFitFile(new File([buf], name));
}

function insertMidpointMarker(markers: Marker[], recordTimestamps: number[]): Marker[] {
  const first = markers[0];
  const second = markers[1];
  const midTarget = Math.round((first.timeOffsetSeconds + second.timeOffsetSeconds) / 2);
  const candidates = recordTimestamps.filter(
    (t) => t > first.timeOffsetSeconds && t < second.timeOffsetSeconds,
  );
  if (candidates.length === 0) return markers;
  const mid = candidates.reduce((best, t) =>
    Math.abs(t - midTarget) < Math.abs(best - midTarget) ? t : best,
  );
  return [...markers.slice(0, 1), { timeOffsetSeconds: mid, label: 'added' }, ...markers.slice(1)]
    .sort((a, b) => a.timeOffsetSeconds - b.timeOffsetSeconds);
}

function mergeAtIndex(markers: Marker[], interiorIndex: number): Marker[] {
  const interior = markers.filter((_, i) => i > 0 && i < markers.length - 1);
  if (interior.length <= interiorIndex) return markers;
  const toRemove = interior[interiorIndex];
  return markers.filter((m) => m !== toRemove);
}

function moveFirstSplit(markers: Marker[], recordTimestamps: number[]): Marker[] {
  const interiorIdx = markers.findIndex((_, i) => i > 0 && i < markers.length - 1);
  if (interiorIdx === -1) return markers;
  const current = markers[interiorIdx].timeOffsetSeconds;
  const next = recordTimestamps.find((t) => t > current);
  if (!next) return markers;
  const newMarkers = [...markers];
  newMarkers[interiorIdx] = { ...newMarkers[interiorIdx], timeOffsetSeconds: next };
  return newMarkers;
}

function fmt(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h${m}m${sec}s` : `${m}m${sec}s`;
}

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

// ── Core test fixture ──

interface RoundTripResult {
  device: string;
  initialLapCount: number;
  editedLapCount: number;
  reloadedLapCount: number | null;
  duration: number;
  distance: number;
  exportable: boolean;
  limitationNote?: string;
}

async function runRoundTrip(fileName: string): Promise<RoundTripResult> {
  const activity = await parseFitFile(makeFile(fileName));

  const device = activity.summary.device ?? '(no device info)';
  const deviceApp = activity.summary.deviceApp ?? '';
  const initialLapCount = activity.markers.length - 1;
  const duration = activity.summary.durationSeconds;
  const distance = activity.summary.distanceMeters;

  console.log(`\n── ${fileName} ──`);
  console.log(`   Device:   ${device}${deviceApp ? ` via ${deviceApp}` : ''}`);
  console.log(`   SW:       ${activity.summary.subSport ? `${activity.summary.subSport} | ` : ''}${activity.summary.activityType}`);
  console.log(`   BEFORE:   ${initialLapCount} lap(s)  |  ${fmt(duration)}  |  ${fmtDist(distance)}`);
  console.log(`   Markers:  [${activity.markers.length}] ${activity.markers.slice(0, 5).map((m) => `${m.label}@${m.timeOffsetSeconds}s`).join(' → ')}${activity.markers.length > 5 ? ` … (${activity.markers.length - 5} more)` : ''}`);

  // ── Check exportability ──
  let exportable = true;
  let limitationNote: string | undefined;
  try {
    validateFitForEditing(activity);
  } catch (err: unknown) {
    exportable = false;
    limitationNote = err instanceof Error ? err.message : String(err);
    console.log(`   EXPORT:   ✗ ${limitationNote}`);
    return { device, initialLapCount, editedLapCount: initialLapCount, reloadedLapCount: null, duration, distance, exportable, limitationNote };
  }

  // ── Edit phase ──
  let markers = [...activity.markers];

  // 1. Add: split midpoint of first interval
  markers = insertMidpointMarker(markers, activity.recordTimestamps);
  const afterAdd = markers.length - 1;

  // 2. Merge: remove second interior (merges what was originally laps 2 and 3)
  const interiorAfterAdd = markers.filter((_, i) => i > 0 && i < markers.length - 1);
  if (interiorAfterAdd.length >= 2) {
    markers = mergeAtIndex(markers, 1);
  }
  const afterMerge = markers.length - 1;

  // 3. Move: shift first interior marker one record tick forward
  if (markers.some((_, i) => i > 0 && i < markers.length - 1)) {
    markers = moveFirstSplit(markers, activity.recordTimestamps);
  }

  const editedLapCount = markers.length - 1;
  console.log(`   EDIT:     +1 add (→${afterAdd}) | merge (→${afterMerge}) | move 1st split`);
  console.log(`   EDITED:   ${editedLapCount} lap(s)`);
  console.log(`   Markers:  [${markers.length}] ${markers.slice(0, 5).map((m) => `${m.label}@${m.timeOffsetSeconds}s`).join(' → ')}${markers.length > 5 ? ` … (${markers.length - 5} more)` : ''}`);

  // ── Export ──
  const exported = rewriteLaps(activity, markers);
  expect(exported.byteLength).toBeGreaterThan(0);
  console.log(`   EXPORTED: ${exported.byteLength} bytes`);

  // ── Re-parse ──
  const reloaded = await reparse(exported, fileName);
  const reloadedLapCount = reloaded.markers.length - 1;
  const reloadedDuration = reloaded.summary.durationSeconds;
  const reloadedDistance = reloaded.summary.distanceMeters;
  const reloadedDevice = reloaded.summary.device ?? '(no device info)';

  console.log(`   RELOADED: ${reloadedLapCount} lap(s)  |  ${fmt(reloadedDuration)}  |  ${fmtDist(reloadedDistance)}`);

  // ── Assertions ──
  // Lap count: should match editedLapCount. Edge case: files with a lap starting
  // exactly at total_timer_time will lose one lap on reload because that lap's
  // start_time = Finish and gets deduped (see test file header comment).
  expect(reloadedLapCount).toBeGreaterThanOrEqual(editedLapCount - 1);
  expect(reloadedLapCount).toBeLessThanOrEqual(editedLapCount);
  expect(reloadedDuration).toBe(duration);
  expect(reloadedDistance).toBeCloseTo(distance, -1); // within ~10 m
  expect(reloadedDevice).toBe(device);

  return { device, initialLapCount, editedLapCount, reloadedLapCount, duration, distance, exportable };
}

// ═══════════════════════════════════════════════════════════
//  Top-10 Garmin running models — full round-trip tests
// ═══════════════════════════════════════════════════════════

describe('Garmin round-trip – Forerunner 245', () => {
  const f = 'garmin-forerunner245-run.fit';
  skipIfMissing(f)('parse → add → merge → move → export → reload', async () => {
    const r = await runRoundTrip(f);
    expect(r.exportable).toBe(true);
    expect(r.reloadedLapCount).toBe(r.editedLapCount);
  });
});

describe('Garmin round-trip – Forerunner 955', () => {
  const f = 'garmin-forerunner955-run.fit';
  skipIfMissing(f)('parse → add → merge → move → export → reload', async () => {
    const r = await runRoundTrip(f);
    expect(r.exportable).toBe(true);
    expect(r.reloadedLapCount).toBe(r.editedLapCount);
  });
});

describe('Garmin round-trip – Forerunner 965 (track)', () => {
  const f = 'garmin-forerunner965-track-run.fit';
  skipIfMissing(f)('parse → add → merge → move → export → reload', async () => {
    const r = await runRoundTrip(f);
    expect(r.exportable).toBe(true);
    expect(r.reloadedLapCount).toBe(r.editedLapCount);
  });
});

describe('Garmin round-trip – Forerunner 970', () => {
  const f = 'garmin-forerunner970-run.fit';
  skipIfMissing(f)('parse → add → merge → move → export → reload', async () => {
    const r = await runRoundTrip(f);
    expect(r.exportable).toBe(true);
    expect(r.reloadedLapCount).toBe(r.editedLapCount);
  });
});

describe('Garmin round-trip – Forerunner 935', () => {
  const f = 'garmin-forerunner935-run.fit';
  skipIfMissing(f)('parse → add → merge → move → export → reload', async () => {
    const r = await runRoundTrip(f);
    expect(r.exportable).toBe(true);
    expect(r.reloadedLapCount).toBe(r.editedLapCount);
  });
});

describe('Garmin round-trip – Forerunner 630', () => {
  const f = 'garmin-forerunner630-run.fit';
  skipIfMissing(f)('parse → add → merge → move → export → reload', async () => {
    const r = await runRoundTrip(f);
    expect(r.exportable).toBe(true);
    expect(r.reloadedLapCount).toBe(r.editedLapCount);
  });
});

describe('Garmin round-trip – Fenix 6X', () => {
  const f = 'garmin-fenix6-run.fit';
  skipIfMissing(f)('parse → add → merge → move → export → reload', async () => {
    const r = await runRoundTrip(f);
    expect(r.exportable).toBe(true);
    expect(r.reloadedLapCount).toBe(r.editedLapCount);
  });
});

describe('Garmin round-trip – Fenix 7X (treadmill)', () => {
  const f = 'garmin-fenix7x-treadmill-run.fit';
  skipIfMissing(f)('parse → add → merge → move → export → reload', async () => {
    const r = await runRoundTrip(f);
    expect(r.exportable).toBe(true);
    expect(r.reloadedLapCount).toBe(r.editedLapCount);
  });
});

// ── Parse-only: files with developer fields in lap messages ──
// These three files represent newer outdoor Garmin running watches that embed
// Running Dynamics / native Running Power as developer fields in each lap message.
// Export is blocked until the writer supports passthrough of lap developer fields.

describe('Garmin parse-only – Forerunner 745 (dev lap fields)', () => {
  const f = 'garmin-forerunner745-run.fit';
  skipIfMissing(f)('parses but cannot export (developer fields in lap messages)', async () => {
    const r = await runRoundTrip(f);
    expect(r.exportable).toBe(false);
    expect(r.limitationNote).toMatch(/developer fields/i);
    // Parse still succeeded: we have device and duration info
    expect(r.device).toMatch(/Forerunner 745/);
    expect(r.duration).toBeGreaterThan(0);
  });
});

describe('Garmin parse-only – Fenix 7S (dev lap fields)', () => {
  const f = 'garmin-fenix7s-run.fit';
  skipIfMissing(f)('parses but cannot export (developer fields in lap messages)', async () => {
    const r = await runRoundTrip(f);
    expect(r.exportable).toBe(false);
    expect(r.limitationNote).toMatch(/developer fields/i);
    expect(r.device).toMatch(/Fenix 7S/);
    expect(r.duration).toBeGreaterThan(0);
  });
});

describe('Garmin parse-only – Epix Gen 2 Pro 47 (dev lap fields)', () => {
  const f = 'garmin-epix-gen2-run.fit';
  skipIfMissing(f)('parses but cannot export (developer fields in lap messages)', async () => {
    const r = await runRoundTrip(f);
    expect(r.exportable).toBe(false);
    expect(r.limitationNote).toMatch(/developer fields/i);
    expect(r.device).toMatch(/Epix Gen 2/);
    expect(r.duration).toBeGreaterThan(0);
  });
});
