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

function buildMarkers(parsedFit: any, baselineMs: number, records: Array<any>, recordTimestamps: number[]): Marker[] {
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

  if (records.length > 0) {
    const finishOffset = toOffsetSeconds(records[records.length - 1].timestamp, baselineMs);
    if (!markers.some((marker) => marker.timeOffsetSeconds === finishOffset)) {
      markers.push({ timeOffsetSeconds: finishOffset, label: 'Finish' });
    }
  }

  // Dedup by timeOffsetSeconds, keeping first occurrence, then sort
  const seen = new Map<number, Marker>();
  for (const m of markers) {
    if (!seen.has(m.timeOffsetSeconds)) seen.set(m.timeOffsetSeconds, m);
  }
  return [...seen.values()].sort((a, b) => a.timeOffsetSeconds - b.timeOffsetSeconds);
}

function buildSeries(parsedRecords: Array<any>, baselineMs: number) {
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

  const buildPaceSeries = () =>
    parsedRecords
      .map((record) => {
        if (record.speed == null || record.speed <= 0 || !record.timestamp) {
          return null;
        }
        return {
          timeOffsetSeconds: toOffsetSeconds(record.timestamp, baselineMs),
          value: 1000 / record.speed,
        };
      })
      .filter((item): item is { timeOffsetSeconds: number; value: number } => item !== null);

  const elevation = buildNumericSeries('altitude');
  const heartRate = buildNumericSeries('heart_rate');
  const distance = buildNumericSeries('distance');
  const power = buildNumericSeries('power');
  const cadence = buildNumericSeries('cadence').map((point) => ({ ...point, value: point.value * 2 }));
  const pace = buildPaceSeries();

  const series = [];
  if (elevation.length > 0) {
    series.push({ name: 'Elevation', values: elevation });
  }
  if (heartRate.length > 0) {
    series.push({ name: 'Heart Rate', values: heartRate });
  }
  if (distance.length > 0) {
    series.push({ name: 'Distance', values: distance });
  }
  if (power.length > 0) {
    series.push({ name: 'Power', values: power });
  }
  if (cadence.length > 0) {
    series.push({ name: 'Cadence', values: cadence });
  }
  if (pace.length > 0) {
    series.push({ name: 'Pace', values: pace });
  }

  return series;
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
  'distance',
  'speed', 'enhanced_speed',
  'power',
  'cadence',
]);

// Non-chart fields to skip entirely
const EXCLUDED_RECORD_FIELDS = new Set([
  'timestamp', 'position_lat', 'position_long', 'compressed_speed_distance',
]);

const UNSHOWN_FIELD_LABELS: Record<string, string> = {
  temperature:                   'Temp',
  vertical_speed:                'Vert Speed',
  gps_accuracy:                  'GPS Acc',
  fractional_cadence:            'Frac Cad',
  vertical_oscillation:          'Vert Osc',
  stance_time:                   'GCT',
  stance_time_percent:           'Stance %',
  vertical_ratio:                'Vert Ratio',
  step_length:                   'Stride Length',
  left_right_balance:            'L/R Balance',
  saturated_hemoglobin_percent:  'SpO2',
  total_hemoglobin_conc:         'Hemoglobin',
  respiration_rate:              'Respiration',
  training_load_peak:            'Training Load',
  motor_power:                   'Motor Pwr',
  ebike_battery_level:           'e-Battery',
  accumulated_power:             'Accum Pwr',
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
    throw new Error('Only .fit files are supported.');
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('The uploaded FIT file is empty or corrupted.');
  }

  const parser = new FitParser({ mode: 'both' });
  const parsedFit = await parser.parseAsync(buffer);
  const topLevelRecords = Array.isArray(parsedFit.records) ? parsedFit.records : [];
  const lapRecords = Array.isArray(parsedFit.laps)
    ? parsedFit.laps.flatMap((lap) => (Array.isArray(lap.records) ? lap.records : []))
    : [];
  const records = topLevelRecords.length > 0 ? topLevelRecords : lapRecords;
  const baselineMs = getBaseTime(records, parsedFit.laps);

  const activityType: string =
    parsedFit.sessions?.[0]?.sport ??
    parsedFit.activity?.sessions?.[0]?.sport ??
    'generic';

  const SUPPORTED_SPORTS = new Set(['running', 'cycling', 'swimming']);
  if (!SUPPORTED_SPORTS.has(activityType)) {
    const label = activityType === 'generic' ? 'unknown' : activityType.replace(/_/g, ' ');
    throw new Error(`"${label}" activities are not supported. ButterLaps accepts running, cycling, and swimming.`);
  }

  const recordTimestamps = buildRecordTimestamps(records, baselineMs);

  return {
    fileName: file.name,
    rawFitPayload: buffer,
    unshownSeries: detectUnshownSeries(records),
    summary: {
      durationSeconds: getDurationSeconds(parsedFit, baselineMs, records),
      distanceMeters: getDistanceMeters(parsedFit, records),
      hasHeartRate: records.some((record) => record.heart_rate != null),
      hasPower: records.some((record) => record.power != null),
      hasCadence: records.some((record) => record.cadence != null),
      activityType,
      startTime: baselineMs > 0 ? baselineMs : null,
    },
    markers: buildMarkers(parsedFit, baselineMs, records, recordTimestamps),
    recordTimestamps,
    series: buildSeries(records, baselineMs),
  };
}
