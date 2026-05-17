import FitParser from 'fit-file-parser';
import type { FitActivity, Marker } from '../types';

export function snapToNearestTimestamp(t: number, timestamps: number[]): number {
  if (timestamps.length === 0) return t;
  let lo = 0;
  let hi = timestamps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timestamps[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(timestamps[lo - 1] - t) < Math.abs(timestamps[lo] - t)) {
    return timestamps[lo - 1];
  }
  return timestamps[lo];
}

function getBaseTime(records: Array<any>, laps: Array<any> | undefined): number {
  if (records.length > 0 && records[0]?.timestamp) {
    const timestamp = Date.parse(records[0].timestamp);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  if (Array.isArray(laps) && laps.length > 0 && laps[0]?.start_time) {
    const timestamp = Date.parse(laps[0].start_time);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  return 0;
}

function toOffsetSeconds(timestamp: string, baselineMs: number): number {
  const timeMs = Date.parse(timestamp);
  if (Number.isNaN(timeMs) || baselineMs === 0) {
    return 0;
  }
  return Math.max(0, Math.round((timeMs - baselineMs) / 1000));
}

function buildRecordTimestamps(records: Array<any>, baselineMs: number): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const record of records) {
    if (!record.timestamp) continue;
    const offset = toOffsetSeconds(record.timestamp, baselineMs);
    if (!seen.has(offset)) {
      seen.add(offset);
      result.push(offset);
    }
  }
  result.sort((a, b) => a - b);
  return result;
}

function buildMarkers(parsedFit: any, baselineMs: number, records: Array<any>, recordTimestamps: number[], durationSeconds: number): Marker[] {
  const markers: Marker[] = [{ timeOffsetSeconds: 0, label: 'Start' }];

  if (Array.isArray(parsedFit.laps)) {
    parsedFit.laps.forEach((lap: any, index: number) => {
      if (!lap?.start_time) {
        return;
      }
      const rawOffset = toOffsetSeconds(lap.start_time, baselineMs);
      const snapped = snapToNearestTimestamp(rawOffset, recordTimestamps);
      if (snapped > 0) {
        markers.push({ timeOffsetSeconds: snapped, label: `Lap ${index + 1}` });
      }
    });
  }

  const finishOffset = durationSeconds > 0
    ? durationSeconds
    : records.length > 0 ? toOffsetSeconds(records[records.length - 1].timestamp, baselineMs) : 0;

  if (finishOffset > 0 && !markers.some((marker) => marker.timeOffsetSeconds === finishOffset)) {
    markers.push({ timeOffsetSeconds: finishOffset, label: 'Finish' });
  }

  // Dedup by timeOffsetSeconds, keeping first occurrence, then sort
  const seen = new Map<number, Marker>();
  for (const m of markers) {
    if (!seen.has(m.timeOffsetSeconds)) seen.set(m.timeOffsetSeconds, m);
  }
  return [...seen.values()].sort((a, b) => a.timeOffsetSeconds - b.timeOffsetSeconds);
}

// Per-series gap thresholds (seconds). Gaps within the threshold are bridged
// with a straight interpolated line; larger gaps get a null sentinel so
// Recharts breaks the line (real pauses / extended signal loss exceed 30 s).
//
// Elevation changes slowly → generous threshold; power/pace can spike and
// drop → tighter threshold to avoid misleading straight-line bridges.
const GAP_BREAK_SECONDS: Record<string, number> = {
  Elevation:    60,  // GPS altitude drifts slowly; long bridge still accurate
  'Heart Rate': 30,  // HR changes gradually
  Cadence:      30,  // same cadence behaviour as HR
  Power:        15,  // power varies rapidly; limit interpolation artefacts
  Pace:         15,  // pace/speed has the same concern as power
  Speed:        15,
};
const GAP_BREAK_DEFAULT = 30;

function withGapBreaks(
  series: Array<{ timeOffsetSeconds: number; value: number | null }>,
  seriesName: string,
): Array<{ timeOffsetSeconds: number; value: number | null }> {
  const threshold = GAP_BREAK_SECONDS[seriesName] ?? GAP_BREAK_DEFAULT;
  const result: Array<{ timeOffsetSeconds: number; value: number | null }> = [];
  for (let i = 0; i < series.length; i++) {
    result.push(series[i]);
    if (i + 1 < series.length && series[i + 1].timeOffsetSeconds - series[i].timeOffsetSeconds > threshold) {
      result.push({ timeOffsetSeconds: series[i].timeOffsetSeconds + 1, value: null });
    }
  }
  return result;
}

function buildSeries(parsedRecords: Array<any>, baselineMs: number, activityType: string) {
  const buildNumericSeries = (field: string) =>
    parsedRecords
      .map((record) => {
        if (record[field] == null || !record.timestamp) {
          return null;
        }
        return {
          timeOffsetSeconds: toOffsetSeconds(record.timestamp, baselineMs),
          value: record[field],
        };
      })
      .filter((item): item is { timeOffsetSeconds: number; value: number } => item !== null);

  const buildSpeedOrPaceSeries = () =>
    parsedRecords
      .map((record) => {
        const speed = record.speed ?? record.enhanced_speed;
        if (speed == null || !record.timestamp) return null;
        const t = toOffsetSeconds(record.timestamp, baselineMs);
        if (speed <= 0) return { timeOffsetSeconds: t, value: null };
        const value = activityType === 'cycling'
          ? speed * 3.6       // km/h
          : 1000 / speed;     // s/km
        return { timeOffsetSeconds: t, value };
      })
      .filter((item): item is { timeOffsetSeconds: number; value: number | null } => item !== null);

  // Garmin native Running Power uses a developer field named 'Power' (capital P);
  // Stryd and others use the standard 'power' field. Try both.
  const buildPowerSeries = () =>
    parsedRecords
      .map((record) => {
        const value = record.power ?? record['Power'];
        if (value == null || !record.timestamp) return null;
        return { timeOffsetSeconds: toOffsetSeconds(record.timestamp, baselineMs), value };
      })
      .filter((item): item is { timeOffsetSeconds: number; value: number } => item !== null);

  const elevation = buildNumericSeries('altitude');
  const heartRate = buildNumericSeries('heart_rate');
  const distance = buildNumericSeries('distance');
  const power = buildPowerSeries();
  const cadence = buildNumericSeries('cadence').map((point) => ({ ...point, value: point.value * 2 }));
  const speedOrPace = buildSpeedOrPaceSeries();
  const speedOrPaceName = activityType === 'cycling' ? 'Speed' : 'Pace';

  const series = [];
  if (elevation.length > 0) {
    series.push({ name: 'Elevation', values: withGapBreaks(elevation, 'Elevation') });
  }
  if (heartRate.length > 0) {
    series.push({ name: 'Heart Rate', values: withGapBreaks(heartRate, 'Heart Rate') });
  }
  if (distance.length > 0) {
    series.push({ name: 'Distance', values: distance });
  }
  if (power.length > 0) {
    series.push({ name: 'Power', values: withGapBreaks(power, 'Power') });
  }
  if (cadence.length > 0) {
    series.push({ name: 'Cadence', values: withGapBreaks(cadence, 'Cadence') });
  }
  if (speedOrPace.length > 0) {
    series.push({ name: speedOrPaceName, values: withGapBreaks(speedOrPace, speedOrPaceName) });
  }

  return series;
}

const APPLE_WATCH_MODELS: Record<string, string> = {
  'Watch1,1': 'Apple Watch (1st gen)', 'Watch1,2': 'Apple Watch (1st gen)',
  'Watch2,3': 'Apple Watch Series 2',  'Watch2,4': 'Apple Watch Series 2',
  'Watch2,6': 'Apple Watch Series 1',  'Watch2,7': 'Apple Watch Series 1',
  'Watch3,1': 'Apple Watch Series 3',  'Watch3,2': 'Apple Watch Series 3',
  'Watch3,3': 'Apple Watch Series 3',  'Watch3,4': 'Apple Watch Series 3',
  'Watch4,1': 'Apple Watch Series 4',  'Watch4,2': 'Apple Watch Series 4',
  'Watch4,3': 'Apple Watch Series 4',  'Watch4,4': 'Apple Watch Series 4',
  'Watch5,1': 'Apple Watch Series 5',  'Watch5,2': 'Apple Watch Series 5',
  'Watch5,3': 'Apple Watch Series 5',  'Watch5,4': 'Apple Watch Series 5',
  'Watch5,9': 'Apple Watch SE',        'Watch5,10': 'Apple Watch SE',
  'Watch5,11': 'Apple Watch SE',       'Watch5,12': 'Apple Watch SE',
  'Watch6,1': 'Apple Watch Series 6',  'Watch6,2': 'Apple Watch Series 6',
  'Watch6,3': 'Apple Watch Series 6',  'Watch6,4': 'Apple Watch Series 6',
  'Watch6,5': 'Apple Watch Series 7',  'Watch6,6': 'Apple Watch Series 7',
  'Watch6,7': 'Apple Watch Series 7',  'Watch6,8': 'Apple Watch Series 7',
  'Watch6,9': 'Apple Watch Series 7',
  'Watch6,10': 'Apple Watch SE (2nd gen)', 'Watch6,11': 'Apple Watch SE (2nd gen)',
  'Watch6,12': 'Apple Watch SE (2nd gen)', 'Watch6,13': 'Apple Watch SE (2nd gen)',
  'Watch6,14': 'Apple Watch Series 8', 'Watch6,15': 'Apple Watch Series 8',
  'Watch6,16': 'Apple Watch Series 8', 'Watch6,17': 'Apple Watch Series 8',
  'Watch6,18': 'Apple Watch Ultra',
  'Watch7,1': 'Apple Watch Series 9',  'Watch7,2': 'Apple Watch Series 9',
  'Watch7,3': 'Apple Watch Series 9',  'Watch7,4': 'Apple Watch Series 9',
  'Watch7,5': 'Apple Watch Ultra 2',
  'Watch7,6': 'Apple Watch Series 10', 'Watch7,7': 'Apple Watch Series 10',
  'Watch7,8': 'Apple Watch Series 10', 'Watch7,9': 'Apple Watch Series 10',
  'Watch7,10': 'Apple Watch Series 10',
  'Watch7,11': 'Apple Watch SE (3rd gen)', 'Watch7,12': 'Apple Watch Ultra 3',
  'Watch7,13': 'Apple Watch SE (3rd gen)', 'Watch7,14': 'Apple Watch SE (3rd gen)',
  'Watch7,15': 'Apple Watch SE (3rd gen)',
  'Watch7,16': 'Apple Watch Series 11', 'Watch7,17': 'Apple Watch Series 11',
  'Watch7,18': 'Apple Watch Series 11', 'Watch7,19': 'Apple Watch Series 11',
  'Watch7,20': 'Apple Watch Series 11',
};

function getDeviceInfo(parsedFit: any): { device?: string; deviceApp?: string } {
  const infos: Array<any> = parsedFit.device_infos ?? [];
  const primary = infos.find((d) => d.device_index === 0) ?? infos.find((d) => d.manufacturer);
  if (!primary) return {};

  // Apple Watch and some SDK devices use manufacturer code 255 ("development").
  // product_name holds the hardware identifier (e.g. "Watch6,18"); descriptor holds
  // the recording app/service name (e.g. "Stryd (81421)"). Surface both separately.
  if (primary.manufacturer === 'development') {
    const productName: string | undefined = primary.product_name;
    const device = productName ? APPLE_WATCH_MODELS[productName] : undefined;
    const descriptor: string | undefined = primary.descriptor;
    const deviceApp = descriptor ? descriptor.replace(/\s*\(.*\)$/, '').trim() : undefined;
    return { device, deviceApp };
  }

  if (!primary.manufacturer) return {};
  const mfr = String(primary.manufacturer).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const product = primary.product_name ?? primary.garmin_product ?? primary.product;
  if (!product || typeof product === 'number') return { device: mfr };
  const productName = String(product).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { device: `${mfr} ${productName}` };
}

function getDurationSeconds(parsedFit: any, baselineMs: number, records: Array<any>): number {
  const activityDuration = parsedFit.activity?.total_timer_time;
  if (typeof activityDuration === 'number') {
    return Math.round(activityDuration);
  }

  const sessionDuration = parsedFit.sessions?.[0]?.total_timer_time ?? parsedFit.activity?.sessions?.[0]?.total_timer_time;
  if (typeof sessionDuration === 'number') {
    return Math.round(sessionDuration);
  }

  if (records.length > 0 && baselineMs > 0) {
    const lastTimestamp = Date.parse(records[records.length - 1].timestamp);
    if (!Number.isNaN(lastTimestamp)) {
      return Math.max(0, Math.round((lastTimestamp - baselineMs) / 1000));
    }
  }

  return 0;
}

function getDistanceMeters(parsedFit: any, records: Array<any>): number {
  const sessionDistance = parsedFit.sessions?.[0]?.total_distance ?? parsedFit.activity?.sessions?.[0]?.total_distance;
  if (typeof sessionDistance === 'number') {
    return sessionDistance;
  }

  const lastRecordDistance = records.length > 0 ? records[records.length - 1].distance : undefined;
  return typeof lastRecordDistance === 'number' ? lastRecordDistance : 0;
}

// Fields we turn into series (including both regular and enhanced variants)
const PARSED_RECORD_FIELDS = new Set([
  'altitude', 'enhanced_altitude',
  'heart_rate',
  'distance', 'Distance',  // 'Distance' is Stryd developer field variant
  'speed', 'enhanced_speed',
  'power', 'Power',  // 'Power' is Garmin native Running Power developer field
  'cadence',
]);

// Non-chart fields to skip entirely
const EXCLUDED_RECORD_FIELDS = new Set([
  'timestamp', 'position_lat', 'position_long', 'compressed_speed_distance',
  'elapsed_time', 'timer_time',  // internal per-record timing, not user metrics
]);

const UNSHOWN_FIELD_LABELS: Record<string, string> = {
  temperature:                   'Temperature',
  vertical_speed:                'Vertical Speed',
  gps_accuracy:                  'GPS Accuracy',
  fractional_cadence:            'Fractional Cadence',
  vertical_oscillation:          'Vertical Oscillation',
  stance_time:                   'Ground Contact Time',
  stance_time_balance:           'GCT Balance',
  stance_time_percent:           'GCT %',
  vertical_ratio:                'Vertical Ratio',
  step_length:                   'Stride Length',
  left_right_balance:            'L/R Balance',
  saturated_hemoglobin_percent:  'SpO₂',
  total_hemoglobin_conc:         'Hemoglobin',
  respiration_rate:              'Breathing Rate',
  training_load_peak:            'Training Load',
  motor_power:                   'Motor Power',
  ebike_battery_level:           'Battery',
  accumulated_power:             'Accumulated Power',
};

function detectUnshownSeries(records: Array<any>): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (seen.has(key)) continue;
      seen.add(key);
      if (EXCLUDED_RECORD_FIELDS.has(key) || PARSED_RECORD_FIELDS.has(key)) continue;
      if (typeof record[key] !== 'number') continue;
      const label = UNSHOWN_FIELD_LABELS[key]
        ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      if (!labels.includes(label)) labels.push(label);
    }
  }
  return labels.sort();
}

export async function parseFitFile(file: File): Promise<FitActivity> {
  if (!file.name.toLowerCase().endsWith('.fit')) {
    throw new Error('Only .fit files are supported');
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('The uploaded .fit file is empty or corrupted');
  }

  const parser = new FitParser({ mode: 'both' });
  const parsedFit = await parser.parseAsync(buffer);
  const topLevelRecords = Array.isArray(parsedFit.records) ? parsedFit.records : [];
  const lapRecords = Array.isArray(parsedFit.laps)
    ? parsedFit.laps.flatMap((lap) => (Array.isArray(lap.records) ? lap.records : []))
    : [];
  const records = topLevelRecords.length > 0 ? topLevelRecords : lapRecords;
  const baselineMs = getBaseTime(records, parsedFit.laps);

  const sessions: Array<any> = parsedFit.sessions ?? parsedFit.activity?.sessions ?? [];
  if (sessions.length > 1) {
    throw new Error('Multisport activities are not supported. Upload each sport segment as a separate file.');
  }

  const activityType: string =
    sessions[0]?.sport ??
    'generic';

  const SUPPORTED_SPORTS = new Set(['running', 'cycling', 'swimming', 'walking', 'hiking']);
  if (!SUPPORTED_SPORTS.has(activityType)) {
    const label = activityType === 'generic' ? 'Unknown' : activityType.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
    throw new Error(`${label} activities are not supported. ButterLaps accepts running, walking, hiking, cycling, and swimming.`);
  }

  const durationSeconds = getDurationSeconds(parsedFit, baselineMs, records);

  // Some apps (e.g. Strava Android) append a stray sentinel record with a timestamp
  // decades in the future. Drop any record whose offset exceeds the declared duration
  // by more than 30 seconds so it can't corrupt the chart domain or marker positions.
  const trimmedRecords = durationSeconds > 0
    ? records.filter((r) => {
        if (!r.timestamp) return true;
        return toOffsetSeconds(r.timestamp, baselineMs) <= durationSeconds + 30;
      })
    : records;

  const recordTimestamps = buildRecordTimestamps(trimmedRecords, baselineMs);

  const allSeries = buildSeries(trimmedRecords, baselineMs, activityType);

  // Elevation is meaningless for swimming (pool/open water GPS drift).
  // Keep the data in unshownSeries so the UI can acknowledge it exists.
  let series = allSeries;
  let swimUnshown: string[] = [];
  if (activityType === 'swimming' && allSeries.some((s) => s.name === 'Elevation')) {
    series = allSeries.filter((s) => s.name !== 'Elevation');
    swimUnshown = ['Elevation'];
  }

  const devFieldNames = new Set<string>(
    (parsedFit.activity?.field_descriptions ?? parsedFit.field_descriptions ?? []).map((d: any) => d.field_name as string)
  );
  const allLaps: Array<any> = (parsedFit as any).laps ?? (parsedFit.activity as any)?.laps ?? [];
  const lapDevFieldSet = new Set<string>();
  for (const lap of allLaps) {
    for (const key of Object.keys(lap)) {
      if (devFieldNames.has(key)) lapDevFieldSet.add(key);
    }
  }

  return {
    fileName: file.name,
    rawFitPayload: buffer,
    unshownSeries: [...swimUnshown, ...detectUnshownSeries(trimmedRecords)],
    lapDevFields: [...lapDevFieldSet].sort(),
    summary: {
      durationSeconds,
      distanceMeters: getDistanceMeters(parsedFit, trimmedRecords),
      hasHeartRate: trimmedRecords.some((record) => record.heart_rate != null),
      hasPower: trimmedRecords.some((record) => record.power != null || (record as unknown as Record<string, unknown>)['Power'] != null),
      hasCadence: trimmedRecords.some((record) => record.cadence != null),
      activityType,
      subSport: sessions[0]?.sub_sport && sessions[0].sub_sport !== 'generic'
        ? sessions[0].sub_sport.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        : undefined,
      startTime: baselineMs > 0 ? baselineMs : null,
      ...getDeviceInfo(parsedFit),
    },
    markers: buildMarkers(parsedFit, baselineMs, trimmedRecords, recordTimestamps, durationSeconds),
    recordTimestamps,
    series,
  };
}
