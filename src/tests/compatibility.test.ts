/**
 * Compatibility tests against public FIT files from various devices.
 * Files live in test-data/ (gitignored). Tests are skipped if the file
 * isn't present so the suite still passes in CI without the fixtures.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseFitFile } from '../fit/fitParser';
import { validateFitForEditing, rewriteLaps } from '../fit/fitWriter';

const DATA_DIR = join(__dirname, '../../test-data');

function makeFile(name: string): File {
  const filePath = join(DATA_DIR, name);
  const nodeBuf = readFileSync(filePath);
  // Slice to get a standalone ArrayBuffer (Node Buffer may share an internal pool)
  const arrayBuf = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength);
  return new File([arrayBuf], name);
}

function skipIfMissing(name: string) {
  return existsSync(join(DATA_DIR, name)) ? it : it.skip;
}

// ---- helpers ----

async function parse(name: string) {
  return parseFitFile(makeFile(name));
}

async function roundTrip(name: string) {
  const activity = await parse(name);
  validateFitForEditing(activity);

  // Merge first interior lap if there are at least 2 (gives us something to export)
  const interior = activity.markers.filter((_, i) => i > 0 && i < activity.markers.length - 1);
  let exported: ArrayBuffer | null = null;
  if (interior.length >= 2) {
    const newMarkers = activity.markers.filter((m) => m !== interior[0]);
    exported = rewriteLaps(activity, newMarkers);
    expect(exported.byteLength).toBeGreaterThan(0);
  }
  return { activity, exported };
}

// ---- rejection tests ----

describe('sport filter', () => {
  skipIfMissing('garmin-fenix5-walk.fit')('accepts walking', async () => {
    const a = await parse('garmin-fenix5-walk.fit');
    expect(a.summary.activityType).toBe('walking');
    expect(a.summary.durationSeconds).toBeGreaterThan(0);
  });

  skipIfMissing('skiing.fit')('rejects alpine skiing', async () => {
    await expect(parse('skiing.fit')).rejects.toThrow(/not supported/i);
  });

  skipIfMissing('generic.fit')('rejects generic', async () => {
    await expect(parse('generic.fit')).rejects.toThrow(/not supported/i);
  });
});

// ---- running ----

describe('running – Garmin Fenix 5', () => {
  const file = 'garmin-fenix5-run.fit';
  skipIfMissing(file)('parses and has expected series', async () => {
    const a = await parse(file);
    expect(a.summary.activityType).toBe('running');
    expect(a.summary.durationSeconds).toBeGreaterThan(0);
    expect(a.series.some((s) => s.name === 'Pace')).toBe(true);
    expect(a.markers.length).toBeGreaterThanOrEqual(2); // at least Start + Finish
  });
  skipIfMissing(file)('round-trips', async () => { await roundTrip(file); });
});

describe('running – Garmin Fenix 2', () => {
  const file = 'fenix2-run.fit';
  skipIfMissing(file)('parses with 4 laps', async () => {
    const a = await parse(file);
    expect(a.summary.activityType).toBe('running');
    // 4 laps → at least Start + some interior + Finish
    expect(a.markers.length).toBeGreaterThanOrEqual(4);
    expect(a.series.some((s) => s.name === 'Heart Rate')).toBe(true);
    expect(a.series.some((s) => s.name === 'Pace')).toBe(true);
  });
  skipIfMissing(file)('round-trips', async () => { await roundTrip(file); });
});

describe('running – Stryd/Apple Watch (per-lap records)', () => {
  skipIfMissing('1776592537-GIR.fit')('single-lap Stryd file parses', async () => {
    const a = await parse('1776592537-GIR.fit');
    expect(a.summary.activityType).toBe('running');
    expect(a.series.some((s) => s.name === 'Power')).toBe(true);
    expect(a.recordTimestamps.length).toBeGreaterThan(0);
  });

  skipIfMissing('1778680492-GIR.fit')('multi-lap Stryd file parses and exports', async () => {
    const { activity, exported } = await roundTrip('1778680492-GIR.fit');
    expect(activity.markers.length).toBeGreaterThan(3);
    expect(exported).not.toBeNull();
  });
});

describe('running – compressed speed/distance encoding', () => {
  const file = 'compressed-speed-dist.fit';
  skipIfMissing(file)('parses; pace series absent (compressed encoding)', async () => {
    const a = await parse(file);
    expect(a.summary.activityType).toBe('running');
    // Speed is encoded in compressed_speed_distance — not decoded to a Pace series
    expect(a.series.some((s) => s.name === 'Pace')).toBe(false);
    expect(a.markers.length).toBeGreaterThanOrEqual(2);
  });
  skipIfMissing(file)('validation rejects: no decodable record timestamps', async () => {
    const a = await parse(file);
    // compressed_speed_distance records have no parseable timestamps → recordTimestamps is empty
    expect(() => validateFitForEditing(a)).toThrow(/no data records/i);
  });
});

describe('running – Strava Android export', () => {
  const file = 'strava-android.fit';
  skipIfMissing(file)('stray sentinel record (timestamp year 2085) is stripped', async () => {
    const a = await parse(file);
    expect(a.summary.activityType).toBe('running');
    expect(a.summary.durationSeconds).toBe(3558);
    // All record timestamps must be within the declared duration
    const maxOffset = Math.max(...a.recordTimestamps);
    expect(maxOffset).toBeLessThanOrEqual(3558 + 30);
  });
  skipIfMissing(file)('round-trips', async () => { await roundTrip(file); });
});

// ---- cycling ----

describe('cycling – Garmin Edge 500', () => {
  const file = 'garmin-edge500.fit';
  skipIfMissing(file)('parses with 9 laps and speed series', async () => {
    const a = await parse(file);
    expect(a.summary.activityType).toBe('cycling');
    expect(a.markers.length).toBeGreaterThanOrEqual(9); // Start + laps + Finish
    expect(a.series.some((s) => s.name === 'Speed')).toBe(true);
    expect(a.series.some((s) => s.name === 'Pace')).toBe(false);
  });
  skipIfMissing(file)('round-trips (merge first lap)', async () => { await roundTrip(file); });
});

describe('cycling – Garmin Edge 820', () => {
  const file = 'garmin-edge820-bike.fit';
  skipIfMissing(file)('parses short ride', async () => {
    const a = await parse(file);
    expect(a.summary.activityType).toBe('cycling');
    expect(a.summary.durationSeconds).toBeGreaterThan(0);
    expect(a.series.some((s) => s.name === 'Speed')).toBe(true);
  });
  skipIfMissing(file)('round-trips', async () => { await roundTrip(file); });
});

describe('cycling – Wahoo ELEMNT', () => {
  const file = 'wahoo-elemnt-bike.fit';
  skipIfMissing(file)('parses long ride with power', async () => {
    const a = await parse(file);
    expect(a.summary.activityType).toBe('cycling');
    expect(a.summary.durationSeconds).toBeGreaterThan(20000);
    expect(a.series.some((s) => s.name === 'Power')).toBe(true);
    expect(a.series.some((s) => s.name === 'Speed')).toBe(true);
  });
  skipIfMissing(file)('round-trips', async () => { await roundTrip(file); });
});

describe('cycling – Coros Pace 2 (misaligned fields)', () => {
  const file = 'coros-pace2-bike.fit';
  skipIfMissing(file)('parses Coros file with per-lap definitions', async () => {
    const a = await parse(file);
    expect(a.summary.activityType).toBe('cycling');
    expect(a.markers.length).toBeGreaterThanOrEqual(2);
    expect(a.series.some((s) => s.name === 'Speed')).toBe(true);
  });
  skipIfMissing(file)('round-trips', async () => { await roundTrip(file); });
});

describe('cycling – indoor trainer (no GPS/speed)', () => {
  const file = 'indoor-trainer.fit';
  skipIfMissing(file)('parses with power but no speed', async () => {
    const a = await parse(file);
    expect(a.summary.activityType).toBe('cycling');
    expect(a.series.some((s) => s.name === 'Power')).toBe(true);
    expect(a.series.some((s) => s.name === 'Speed')).toBe(false);
  });
  skipIfMissing(file)('round-trips', async () => { await roundTrip(file); });
});

// ---- swimming ----

describe('swimming – pool (official SDK, protocol 2.0 header)', () => {
  const file = 'pool-swim.fit';
  skipIfMissing(file)('parses despite protocol 2.0 header', async () => {
    const a = await parse(file);
    expect(a.summary.activityType).toBe('swimming');
    expect(a.markers.length).toBeGreaterThanOrEqual(2);
  });
});

describe('swimming – pool with HR', () => {
  const file = 'pool-swim-hr.fit';
  skipIfMissing(file)('parses 38-lap swim', async () => {
    const a = await parse(file);
    expect(a.summary.activityType).toBe('swimming');
    expect(a.markers.length).toBeGreaterThan(10);
  });
  skipIfMissing(file)('round-trips', async () => { await roundTrip(file); });
});

describe('swimming – enhanced fields', () => {
  const file = 'swimming.fit';
  skipIfMissing(file)('parses swim with enhanced fields', async () => {
    const a = await parse(file);
    expect(a.summary.activityType).toBe('swimming');
    expect(a.summary.durationSeconds).toBeGreaterThan(0);
  });
  skipIfMissing(file)('round-trips', async () => { await roundTrip(file); });
});

// ---- edge-case: developer fields survive round-trip ----
describe('developer fields', () => {
  skipIfMissing('1778680492-GIR.fit')('Stryd power fields present after parse', async () => {
    const a = await parse('1778680492-GIR.fit');
    expect(a.series.some((s) => s.name === 'Power')).toBe(true);
  });
});
