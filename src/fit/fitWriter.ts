import type { FitActivity, Marker } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIT_EPOCH_S = 631065600; // seconds from Unix to FIT epoch (Dec 31 1989)

// FIT invalid sentinels per base type
const INV_U8  = 0xFF;
const INV_U16 = 0xFFFF;
const INV_U32 = 0xFFFFFFFF;
const INV_S8  = 0x7F;
const INV_S16 = 0x7FFF;
const INV_S32 = 0x7FFFFFFF;

// Global message numbers
const GMSG_LAP    = 19;
const GMSG_RECORD = 20;

// ---------------------------------------------------------------------------
// CRC
// ---------------------------------------------------------------------------

const CRC_TABLE = [
  0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
  0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
];

function crcByte(crc: number, b: number): number {
  let tmp = CRC_TABLE[crc & 0xF];
  crc = (crc >> 4) & 0x0FFF;
  crc = crc ^ tmp ^ CRC_TABLE[b & 0xF];
  tmp = CRC_TABLE[crc & 0xF];
  crc = (crc >> 4) & 0x0FFF;
  return crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xF];
}

function computeCrc(buf: Uint8Array, start: number, end: number): number {
  let crc = 0;
  for (let i = start; i < end; i++) crc = crcByte(crc, buf[i]);
  return crc;
}

// ---------------------------------------------------------------------------
// Read / write helpers
// ---------------------------------------------------------------------------

function ru16le(b: Uint8Array, o: number): number { return b[o] | (b[o + 1] << 8); }
function ru32le(b: Uint8Array, o: number): number { return ((b[o] | (b[o+1]<<8) | (b[o+2]<<16) | (b[o+3]<<24)) >>> 0); }
function ru16be(b: Uint8Array, o: number): number { return (b[o] << 8) | b[o+1]; }
function ru32be(b: Uint8Array, o: number): number { return (((b[o]<<24) | (b[o+1]<<16) | (b[o+2]<<8) | b[o+3]) >>> 0); }

function wu16le(b: Uint8Array, o: number, v: number): void { b[o] = v & 0xFF; b[o+1] = (v >> 8) & 0xFF; }
function wu32le(b: Uint8Array, o: number, v: number): void {
  b[o] = v & 0xFF; b[o+1] = (v>>8)&0xFF; b[o+2] = (v>>16)&0xFF; b[o+3] = (v>>24)&0xFF;
}
function wu16be(b: Uint8Array, o: number, v: number): void { b[o] = (v>>8)&0xFF; b[o+1] = v&0xFF; }
function wu32be(b: Uint8Array, o: number, v: number): void {
  b[o] = (v>>24)&0xFF; b[o+1] = (v>>16)&0xFF; b[o+2] = (v>>8)&0xFF; b[o+3] = v&0xFF;
}

function readField(src: Uint8Array, offset: number, size: number, bigEndian: boolean): number {
  if (size === 4) return bigEndian ? ru32be(src, offset) : ru32le(src, offset);
  if (size === 2) return bigEndian ? ru16be(src, offset) : ru16le(src, offset);
  if (size === 1) return src[offset];
  return 0;
}

function writeField(dst: Uint8Array, offset: number, value: number, size: number, bigEndian: boolean): void {
  if (size === 4) { if (bigEndian) wu32be(dst, offset, value); else wu32le(dst, offset, value); }
  else if (size === 2) { if (bigEndian) wu16be(dst, offset, value); else wu16le(dst, offset, value); }
  else if (size === 1) { dst[offset] = value & 0xFF; }
}

// ---------------------------------------------------------------------------
// FIT message scanner
// ---------------------------------------------------------------------------

interface FieldDef { fieldDef: number; size: number; isDev: boolean; }

interface LapInfo {
  defLocalType: number;
  defStart: number;
  defEnd: number;
  dataStart: number;
  dataEnd: number;
  bigEndian: boolean;
  dataSize: number;         // total bytes in one data message (excluding header byte)
  fields: FieldDef[];
  fieldOffsets: Map<number, { off: number; size: number }>;
  hasDeveloperFields: boolean;
  startTimeFit: number;
  timestampFit: number;
}

interface ScanResult {
  laps: LapInfo[];
  recordOffsets: number[];  // timeOffsetSeconds of each record message (relative to activityStart)
}

function scanMessages(
  src: Uint8Array,
  dataStart: number,
  dataEnd: number,
  activityStartFitS: number,
): ScanResult {
  type DefEntry = {
    globalMsgNum: number;
    fields: FieldDef[];
    dataSize: number;
    bigEndian: boolean;
    defStart: number;
    defEnd: number;
    hasDeveloperFields: boolean;
    localType: number;
  };

  const localDefs = new Map<number, DefEntry>();
  const laps: LapInfo[] = [];
  const recordFitTimestamps: number[] = [];
  let pos = dataStart;
  let lastCompressedTs = 0;

  while (pos < dataEnd) {
    const header = src[pos];

    // Compressed timestamp record
    if (header & 0x80) {
      const localType = (header >> 5) & 0x03;
      const tsDelta = header & 0x1F;
      lastCompressedTs = (lastCompressedTs & 0xFFFFFFE0) + tsDelta;
      const def = localDefs.get(localType);
      if (!def) { pos++; break; }
      if (def.globalMsgNum === GMSG_RECORD) {
        const offset = Math.max(0, lastCompressedTs - activityStartFitS);
        recordFitTimestamps.push(offset);
      }
      pos += def.dataSize + 1;
      continue;
    }

    const isDef = (header & 0x40) !== 0;
    const hasDevData = (header & 0x20) !== 0;
    const localType = header & 0x0F;

    if (isDef) {
      const defStart = pos;
      pos += 2; // header + reserved
      const bigEndian = src[pos++] !== 0;
      const globalMsgNum = bigEndian ? ru16be(src, pos) : ru16le(src, pos);
      pos += 2;
      const numFields = src[pos++];
      const fields: FieldDef[] = [];
      let dataSize = 0;
      for (let i = 0; i < numFields; i++) {
        const fd = src[pos++]; const sz = src[pos++]; pos++;
        fields.push({ fieldDef: fd, size: sz, isDev: false });
        dataSize += sz;
      }
      let hasDeveloperFields = false;
      if (hasDevData) {
        hasDeveloperFields = true;
        const numDev = src[pos++];
        for (let i = 0; i < numDev; i++) {
          const fd = src[pos++]; const sz = src[pos++]; pos++;
          fields.push({ fieldDef: fd, size: sz, isDev: true });
          dataSize += sz;
        }
      }
      const defEnd = pos;
      localDefs.set(localType, { globalMsgNum, fields, dataSize, bigEndian, defStart, defEnd, hasDeveloperFields, localType });
      continue;
    }

    // Data message
    const def = localDefs.get(localType);
    if (!def) { pos++; break; }

    if (def.globalMsgNum === GMSG_LAP) {
      const dataPos = pos + 1;
      const fieldOffsets = new Map<number, { off: number; size: number }>();
      let off = 0;
      for (const f of def.fields) {
        if (!f.isDev) fieldOffsets.set(f.fieldDef, { off, size: f.size });
        off += f.size;
      }
      const readU = (fieldDef: number): number => {
        const fi = fieldOffsets.get(fieldDef);
        if (!fi) return 0;
        return readField(src, dataPos + fi.off, fi.size, def.bigEndian);
      };

      const startTimeFit = readU(2);
      if (startTimeFit > 0) lastCompressedTs = startTimeFit;

      laps.push({
        defLocalType: localType,
        defStart: def.defStart,
        defEnd: def.defEnd,
        dataStart: pos,
        dataEnd: pos + def.dataSize + 1,
        bigEndian: def.bigEndian,
        dataSize: def.dataSize,
        fields: def.fields,
        fieldOffsets,
        hasDeveloperFields: def.hasDeveloperFields,
        startTimeFit,
        timestampFit: readU(253),
      });
    } else if (def.globalMsgNum === GMSG_RECORD) {
      const dataPos = pos + 1;
      // Read timestamp (field 253)
      const fi = (() => {
        let off = 0;
        for (const f of def.fields) {
          if (!f.isDev && f.fieldDef === 253) return { off, size: f.size };
          off += f.size;
        }
        return null;
      })();
      if (fi) {
        const ts = readField(src, dataPos + fi.off, fi.size, def.bigEndian);
        if (ts > 0) {
          lastCompressedTs = ts;
          const offset = Math.max(0, ts - activityStartFitS);
          recordFitTimestamps.push(offset);
        }
      }
    }

    pos += def.dataSize + 1;
  }

  return { laps, recordOffsets: [...new Set(recordFitTimestamps)].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------------------
// Interval helpers
// ---------------------------------------------------------------------------

function getIntervals(markers: Marker[]): Array<{ start: number; end: number }> {
  return markers
    .slice(0, -1)
    .map((m, i) => ({ start: m.timeOffsetSeconds, end: markers[i + 1].timeOffsetSeconds }))
    .filter((iv) => iv.end > iv.start);
}

// Two-pointer: for each original lap slot j, collect the new intervals whose
// snapped end falls within this original lap's temporal extent.
function buildSlotAssignment(
  laps: LapInfo[],
  intervals: Array<{ start: number; end: number }>,
  activityStartFitS: number,
  activityEndOffset: number,
): number[][] {
  const slots: number[][] = laps.map(() => []);
  let i = 0;

  for (let j = 0; j < laps.length; j++) {
    const origEnd = j < laps.length - 1
      ? laps[j + 1].startTimeFit - activityStartFitS
      : activityEndOffset;

    while (i < intervals.length && intervals[i].end <= origEnd) {
      slots[j].push(i);
      i++;
    }
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Series utilities
// ---------------------------------------------------------------------------

type SeriesPoint = { timeOffsetSeconds: number; value: number };

function getSeriesInRange(
  values: SeriesPoint[],
  s: number,
  e: number,
): SeriesPoint[] {
  return values.filter((p) => p.timeOffsetSeconds >= s && p.timeOffsetSeconds <= e);
}

function avg(pts: SeriesPoint[]): number | null {
  if (pts.length === 0) return null;
  return pts.reduce((sum, p) => sum + p.value, 0) / pts.length;
}

function maxVal(pts: SeriesPoint[]): number | null {
  if (pts.length === 0) return null;
  return pts.reduce((m, p) => Math.max(m, p.value), -Infinity);
}

function minVal(pts: SeriesPoint[]): number | null {
  if (pts.length === 0) return null;
  return pts.reduce((m, p) => Math.min(m, p.value), Infinity);
}

function lookupNearest(values: SeriesPoint[], t: number): number | null {
  if (values.length === 0) return null;
  let lo = 0; let hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid].timeOffsetSeconds < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(values[lo - 1].timeOffsetSeconds - t) < Math.abs(values[lo].timeOffsetSeconds - t)) {
    return values[lo - 1].value;
  }
  return values[lo].value;
}

function computeAscDesc(elevPts: SeriesPoint[]): { ascent: number; descent: number } {
  let ascent = 0; let descent = 0;
  for (let i = 1; i < elevPts.length; i++) {
    const delta = elevPts[i].value - elevPts[i - 1].value;
    if (delta > 0) ascent += delta;
    else descent += -delta;
  }
  return { ascent, descent };
}

function computeNormalizedPower(powerPts: SeriesPoint[], s: number, e: number): number | null {
  if (powerPts.length < 2) return null;
  const pts = getSeriesInRange(powerPts, s, e);
  if (pts.length < 2) return null;

  const sum4: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    // 30-second rolling average ending at pts[i].timeOffsetSeconds
    const windowStart = pts[i].timeOffsetSeconds - 30;
    let total = 0; let count = 0;
    for (let k = i; k >= 0 && pts[k].timeOffsetSeconds >= windowStart; k--) {
      total += pts[k].value; count++;
    }
    const rollingAvg = count > 0 ? total / count : 0;
    sum4.push(rollingAvg ** 4);
  }
  const meanOf4th = sum4.reduce((a, b) => a + b, 0) / sum4.length;
  return Math.round(meanOf4th ** 0.25);
}

function computeTotalWork(powerPts: SeriesPoint[], s: number, e: number): number | null {
  const pts = getSeriesInRange(powerPts, s, e);
  if (pts.length < 2) return null;
  let work = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const dt = pts[i + 1].timeOffsetSeconds - pts[i].timeOffsetSeconds;
    work += pts[i].value * dt;
  }
  return Math.round(work);
}

// ---------------------------------------------------------------------------
// Lap stats computation
// ---------------------------------------------------------------------------

interface LapStats {
  s: number; e: number;                  // snapped boundary offsets
  startTimeFit: number;
  timestampFit: number;
  elapsedRaw: number;
  distanceRaw: number;
  avgSpeedRaw: number;
  maxSpeedRaw: number;
  avgHr: number; maxHr: number; minHr: number;
  avgCadRaw: number; maxCadRaw: number;
  avgPower: number; maxPower: number;
  normalizedPower: number;
  totalWork: number;
  totalAscent: number; totalDescent: number;
  avgAltRaw: number; maxAltRaw: number; minAltRaw: number;
  avgGradeRaw: number;
  avgVam: number;
}

function altRaw(m: number): number { return Math.max(0, Math.round((m + 500) * 5)); }

function computeLapStats(
  s: number, e: number,
  activityStartFitS: number,
  series: FitActivity['series'],
): LapStats {
  const get = (name: string): SeriesPoint[] => {
    const vals = series.find((ser) => ser.name === name)?.values ?? [];
    return vals.filter((v): v is SeriesPoint => v.value !== null);
  };
  const distPts   = get('Distance');
  const hrPts     = get('Heart Rate');
  const cadPts    = get('Cadence');    // already ×2 in parser; divide by 2 for FIT raw
  const powerPts  = get('Power');
  const pacePts   = get('Pace');       // s/km; speed_ms = 1000/pace
  const elevPts   = get('Elevation');

  const elapsed = e - s;
  const distStart = lookupNearest(distPts, s) ?? 0;
  const distEnd   = lookupNearest(distPts, e) ?? 0;
  const distM     = Math.max(0, distEnd - distStart);
  const distRaw   = Math.round(distM * 100);
  const elapsedRaw = elapsed * 1000;

  // Speed
  const avgSpeedMs = elapsed > 0 ? distM / elapsed : 0;
  const avgSpeedRaw = Math.round(avgSpeedMs * 1000);

  const pacePtsInRange = getSeriesInRange(pacePts, s, e);
  const maxSpeedMs = pacePtsInRange.length > 0
    ? Math.max(...pacePtsInRange.map((p) => (p.value > 0 ? 1000 / p.value : 0)))
    : 0;
  const maxSpeedRaw = Math.round(maxSpeedMs * 1000);

  // Heart rate
  const hrIn = getSeriesInRange(hrPts, s, e);
  const avgHr  = hrIn.length ? Math.round(avg(hrIn)!) : INV_U8;
  const maxHr  = hrIn.length ? Math.round(maxVal(hrIn)!) : INV_U8;
  const minHr  = hrIn.length ? Math.round(minVal(hrIn)!) : INV_U8;

  // Cadence (series values are physical spm/rpm; FIT stores half that)
  const cadIn = getSeriesInRange(cadPts, s, e);
  const avgCadRaw = cadIn.length ? Math.min(INV_U8 - 1, Math.round(avg(cadIn)! / 2)) : INV_U8;
  const maxCadRaw = cadIn.length ? Math.min(INV_U8 - 1, Math.round(maxVal(cadIn)! / 2)) : INV_U8;

  // Power
  const pwrIn = getSeriesInRange(powerPts, s, e);
  const avgPower = pwrIn.length ? Math.round(avg(pwrIn)!) : INV_U16;
  const maxPower = pwrIn.length ? Math.round(maxVal(pwrIn)!) : INV_U16;
  const normalizedPower = powerPts.length > 0
    ? (computeNormalizedPower(powerPts, s, e) ?? INV_U16)
    : INV_U16;
  const totalWork = powerPts.length > 0
    ? (computeTotalWork(powerPts, s, e) ?? INV_U32)
    : INV_U32;

  // Elevation
  const elevIn = getSeriesInRange(elevPts, s, e);
  const { ascent, descent } = elevIn.length > 1 ? computeAscDesc(elevIn) : { ascent: 0, descent: 0 };
  const avgAltRaw = elevIn.length ? altRaw(avg(elevIn)!) : INV_U16;
  const maxAltRaw = elevIn.length ? altRaw(maxVal(elevIn)!) : INV_U16;
  const minAltRaw = elevIn.length ? altRaw(minVal(elevIn)!) : INV_U16;
  const totalAscent  = elevIn.length > 1 ? Math.round(ascent)  : INV_U16;
  const totalDescent = elevIn.length > 1 ? Math.round(descent) : INV_U16;

  // Grade (average over interval)
  const avgGradeRaw = (distM > 0 && elevIn.length > 1)
    ? Math.round(((elevIn[elevIn.length - 1].value - elevIn[0].value) / distM) * 100 * 100)
    : INV_S16;

  // VAM (vertical ascent meters/hour × 1000 for raw)
  const avgVam = (totalAscent !== INV_U16 && elapsed > 0)
    ? Math.round((totalAscent / elapsed) * 3600 * 1000)
    : INV_U16;

  return {
    s, e,
    startTimeFit: activityStartFitS + s,
    timestampFit: activityStartFitS + e,
    elapsedRaw, distanceRaw: distRaw,
    avgSpeedRaw, maxSpeedRaw,
    avgHr, maxHr, minHr,
    avgCadRaw, maxCadRaw,
    avgPower, maxPower, normalizedPower, totalWork,
    totalAscent, totalDescent,
    avgAltRaw, maxAltRaw, minAltRaw,
    avgGradeRaw, avgVam,
  };
}

// ---------------------------------------------------------------------------
// Patch a cloned lap data message
// ---------------------------------------------------------------------------

function patchLapMessage(
  msg: Uint8Array,
  template: LapInfo,
  stats: LapStats,
  msgIndex: number,
): void {
  const p = (fieldDef: number, value: number) => {
    const fi = template.fieldOffsets.get(fieldDef);
    if (!fi || fi.size > 4) return; // skip arrays and unknown sizes
    const ao = 1 + fi.off; // +1 for header byte
    writeField(msg, ao, value, fi.size, template.bigEndian);
  };

  // --- Group A: structural (always write) ---
  p(254, msgIndex);
  p(253, stats.timestampFit);
  p(2,   stats.startTimeFit);
  p(7,   stats.elapsedRaw);
  p(8,   stats.elapsedRaw);   // total_timer_time = elapsed (v1 simplification)
  p(9,   stats.distanceRaw);

  // --- Group B: computable from series ---
  p(13,  stats.avgSpeedRaw);
  p(14,  stats.maxSpeedRaw);
  p(110, stats.avgSpeedRaw);  // enhanced_avg_speed (uint32)
  p(111, stats.maxSpeedRaw);  // enhanced_max_speed (uint32)

  p(15,  stats.avgHr);
  p(16,  stats.maxHr);
  p(63,  stats.minHr);

  p(17,  stats.avgCadRaw);
  p(18,  stats.maxCadRaw);

  p(19,  stats.avgPower);
  p(20,  stats.maxPower);
  p(33,  stats.normalizedPower);
  p(41,  stats.totalWork);

  p(21,  stats.totalAscent);
  p(22,  stats.totalDescent);
  p(42,  stats.avgAltRaw);
  p(43,  stats.maxAltRaw);
  p(62,  stats.minAltRaw);
  p(112, stats.avgAltRaw);    // enhanced_avg_altitude
  p(113, stats.minAltRaw);    // enhanced_min_altitude
  p(114, stats.maxAltRaw);    // enhanced_max_altitude

  p(45,  stats.avgGradeRaw);
  p(121, stats.avgVam);

  // --- Group C: set to INVALID (no data / deferred) ---
  p(10,  INV_U32);  // total_cycles
  p(11,  INV_U16);  // total_calories
  p(12,  INV_U16);  // total_fat_calories
  p(52,  INV_U32);  // total_moving_time
  p(70,  INV_U32);  // active_time
  p(44,  INV_U8);   // gps_accuracy
  p(50,  INV_S8);   // avg_temperature
  p(51,  INV_S8);   // max_temperature
  p(124, INV_S8);   // min_temperature
  p(53,  INV_S16);  // avg_pos_vertical_speed
  p(54,  INV_S16);  // avg_neg_vertical_speed
  p(55,  INV_S16);  // max_pos_vertical_speed
  p(56,  INV_S16);  // max_neg_vertical_speed
  p(46,  INV_S16);  // avg_pos_grade
  p(47,  INV_S16);  // avg_neg_grade
  p(48,  INV_S16);  // max_pos_grade
  p(49,  INV_S16);  // max_neg_grade

  // --- Group D: GPS — always INVALID ---
  p(3,   INV_S32);  // start_position_lat
  p(4,   INV_S32);  // start_position_long
  p(5,   INV_S32);  // end_position_lat
  p(6,   INV_S32);  // end_position_long

  // --- Group E: lap_trigger = manual (0) ---
  p(24, 0);

  // --- Group F: running/cycling dynamics — INVALID ---
  p(77,  INV_U16);  // avg_vertical_oscillation
  p(78,  INV_U16);  // avg_stance_time_percent
  p(79,  INV_U16);  // avg_stance_time
  p(80,  INV_U8);   // avg_fractional_cadence
  p(81,  INV_U8);   // max_fractional_cadence
  p(82,  INV_U8);   // total_fractional_cycles
  p(118, INV_U16);  // avg_vertical_ratio
  p(119, INV_U16);  // avg_stance_time_balance
  p(120, INV_U16);  // avg_step_length
  p(91,  INV_U8);   // avg_left_torque_effectiveness
  p(92,  INV_U8);   // avg_right_torque_effectiveness
  p(93,  INV_U8);   // avg_left_pedal_smoothness
  p(94,  INV_U8);   // avg_right_pedal_smoothness
  p(95,  INV_U8);   // avg_combined_pedal_smoothness
  p(98,  INV_U32);  // time_standing
  p(99,  INV_U16);  // stand_count
  p(100, INV_S8);   // avg_left_pco
  p(101, INV_S8);   // avg_right_pco
  p(115, INV_U16);  // avg_lev_motor_power
  p(116, INV_U16);  // max_lev_motor_power
  p(117, INV_U8);   // lev_battery_consumption

  // Zone arrays (fields 57-60): fill all bytes with 0xFF → uint32 INVALID per element.
  // Zone thresholds are not available, so we cannot compute these values.
  const fillWithInvalid = (fieldDef: number) => {
    const fi = template.fieldOffsets.get(fieldDef);
    if (!fi) return;
    msg.fill(0xFF, 1 + fi.off, 1 + fi.off + fi.size);
  };
  fillWithInvalid(57); // time_in_hr_zone
  fillWithInvalid(58); // time_in_speed_zone
  fillWithInvalid(59); // time_in_cadence_zone
  fillWithInvalid(60); // time_in_power_zone

  // hemoglobin, core temp, respiration, grit/flow — preserve template (rare/specialized sensors)
}

// ---------------------------------------------------------------------------
// Shared structural checks (upload-time and export-time)
// ---------------------------------------------------------------------------

function checkLapStructure(activity: FitActivity, laps: LapInfo[]): void {
  if (!activity.summary.startTime) throw new Error('.fit file has no start time');
  if (activity.recordTimestamps.length === 0) throw new Error('.fit file contains no data records');
  if (laps.length === 0) throw new Error('.fit file contains no lap messages');

  if (laps.some((l) => l.hasDeveloperFields)) {
    throw new Error('.fit file contains developer fields in lap messages — not supported');
  }

  for (let i = 1; i < laps.length; i++) {
    if (laps[i].startTimeFit <= laps[i - 1].startTimeFit) {
      throw new Error('Lap timestamps are not strictly increasing — file may be malformed');
    }
  }
}

// Called at upload time — rejects unsupported files before the user starts editing.
export function validateFitForEditing(activity: FitActivity): void {
  if (activity.summary.startTime == null) {
    throw new Error('Activity has no timestamp data and cannot be edited');
  }
  const src = new Uint8Array(activity.rawFitPayload);
  const headerSize = src[0];
  const dataEnd = headerSize + ru32le(src, 4);
  const activityStartFitS = Math.round(activity.summary.startTime) / 1000 - FIT_EPOCH_S;
  const { laps } = scanMessages(src, headerSize, dataEnd, activityStartFitS);
  checkLapStructure(activity, laps);
}

// ---------------------------------------------------------------------------
// Export preflight (adds edit-state checks on top of structural checks)
// ---------------------------------------------------------------------------

function validateForExport(
  activity: FitActivity,
  markers: Marker[],
  laps: LapInfo[],
): void {
  checkLapStructure(activity, laps);

  const intervals = getIntervals(markers);
  if (intervals.length === 0) throw new Error('No valid lap intervals defined');

  const recSet = new Set(activity.recordTimestamps);
  for (const m of markers.slice(1, -1)) {
    if (!recSet.has(m.timeOffsetSeconds)) {
      throw new Error(`Marker at ${m.timeOffsetSeconds}s is not aligned to a record timestamp. Please reset and re-edit`);
    }
  }

  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i].end <= intervals[i - 1].end) {
      throw new Error('Lap boundaries are not strictly increasing — internal state error');
    }
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function rewriteLaps(activity: FitActivity, currentMarkers: Marker[]): ArrayBuffer {
  const startMs = activity.summary.startTime;
  if (!startMs) return activity.rawFitPayload;

  const src = new Uint8Array(activity.rawFitPayload);
  const headerSize = src[0];
  const origDataSize = ru32le(src, 4);
  const dataEnd = headerSize + origDataSize;

  const activityStartFitS = Math.round(startMs / 1000) - FIT_EPOCH_S;
  const { laps } = scanMessages(src, headerSize, dataEnd, activityStartFitS);

  // Run preflight — throws descriptive error on any violation
  validateForExport(activity, currentMarkers, laps);

  const intervals = getIntervals(currentMarkers);
  const N = laps.length;
  const M = intervals.length;

  // Early return if nothing changed
  if (N === M) {
    const allMatch = laps.every((lap, j) => {
      const lapStart = lap.startTimeFit - activityStartFitS;
      return Math.abs(lapStart - intervals[j].start) <= 1;
    });
    if (allMatch) return activity.rawFitPayload;
  }

  // Activity end = last marker's time
  const activityEndOffset = currentMarkers[currentMarkers.length - 1].timeOffsetSeconds;

  // Two-pointer slot assignment
  const slots = buildSlotAssignment(laps, intervals, activityStartFitS, activityEndOffset);

  // Compute stats for every new interval
  const stats = intervals.map((iv) =>
    computeLapStats(iv.start, iv.end, activityStartFitS, activity.series)
  );

  // Template: use laps[0]
  const template = laps[0];
  const lapDataMsgSize = template.dataSize + 1; // +1 for header byte

  // Compute how many new lap data messages will be written total
  const totalNewLaps = slots.reduce((sum, s) => sum + s.length, 0);

  // Accurate size accounting.
  // Each original lap definition is replaced by the template definition (same count, potentially
  // different per-message sizes). Each original lap data message is replaced by 0, 1, or more
  // new messages of template size. Definitions must all be re-written (not skipped) to preserve
  // the local-type ownership chain in the output stream.
  const origLapDefBytes  = laps.reduce((sum, l) => sum + (l.defEnd - l.defStart), 0);
  const origLapDataBytes = laps.reduce((sum, l) => sum + l.dataSize + 1, 0);
  const firstLapDefSize  = template.defEnd - template.defStart;
  const lapDataDelta = (N * firstLapDefSize - origLapDefBytes) + (totalNewLaps * lapDataMsgSize - origLapDataBytes);
  const newDataSize = origDataSize + lapDataDelta;
  const out = new Uint8Array(headerSize + newDataSize + 2);

  // Copy header, update data size
  out.set(src.subarray(0, headerSize));
  wu32le(out, 4, newDataSize);

  // Single-pass assembly — walk source, writing output
  let srcPos = headerSize;
  let outPos = headerSize;
  let lapIndex = 0;
  let msgIndexCounter = 0;
  const localDefsWalk = new Map<number, { globalMsgNum: number; dataSize: number; defSize: number }>();

  while (srcPos < dataEnd) {
    const header = src[srcPos];

    // Compressed timestamp
    if (header & 0x80) {
      const localType = (header >> 5) & 0x03;
      const def = localDefsWalk.get(localType);
      if (!def) { srcPos++; break; }
      const msgSize = def.dataSize + 1;
      out.set(src.subarray(srcPos, srcPos + msgSize), outPos);
      outPos += msgSize;
      srcPos += msgSize;
      continue;
    }

    const isDef = (header & 0x40) !== 0;
    const hasDevData = (header & 0x20) !== 0;
    const localType = header & 0x0F;

    if (isDef) {
      const defMsgStart = srcPos;
      srcPos += 2;
      srcPos++; // endianness
      const globalMsgNum = (src[defMsgStart + 2] !== 0)
        ? ((src[srcPos] << 8) | src[srcPos + 1])
        : (src[srcPos] | (src[srcPos + 1] << 8));
      srcPos += 2;
      const numFields = src[srcPos++];
      let dataSize = 0;
      for (let i = 0; i < numFields; i++) { srcPos++; dataSize += src[srcPos++]; srcPos++; }
      if (hasDevData) {
        const numDev = src[srcPos++];
        for (let i = 0; i < numDev; i++) { srcPos++; dataSize += src[srcPos++]; srcPos++; }
      }
      const defSize = srcPos - defMsgStart;
      localDefsWalk.set(localType, { globalMsgNum, dataSize, defSize });

      if (globalMsgNum === GMSG_LAP) {
        // Write the template definition at every lap definition position. This is necessary
        // because files interleave record and lap definitions on the same local type — skipping
        // a lap definition would leave the local type owned by the preceding record definition,
        // causing consumers to misinterpret subsequent lap data messages.
        out.set(src.subarray(template.defStart, template.defEnd), outPos);
        outPos += firstLapDefSize;
      } else {
        out.set(src.subarray(defMsgStart, srcPos), outPos);
        outPos += defSize;
      }
      continue;
    }

    // Data message
    const def = localDefsWalk.get(localType);
    if (!def) { srcPos++; break; }
    const msgSize = def.dataSize + 1;

    if (def.globalMsgNum === GMSG_LAP) {
      const intervalsForSlot = slots[lapIndex] ?? [];

      for (const intervalIdx of intervalsForSlot) {
        // Clone template data message bytes from source (template = laps[0])
        const templateData = src.subarray(template.dataStart, template.dataEnd);
        const newMsg = new Uint8Array(lapDataMsgSize);
        newMsg.set(templateData);

        patchLapMessage(newMsg, template, stats[intervalIdx], msgIndexCounter++);
        out.set(newMsg, outPos);
        outPos += lapDataMsgSize;
      }

      srcPos += msgSize; // skip original lap data
      lapIndex++;
    } else {
      out.set(src.subarray(srcPos, srcPos + msgSize), outPos);
      outPos += msgSize;
      srcPos += msgSize;
    }
  }

  // Recompute header CRC
  if (headerSize >= 14) {
    const hcrc = computeCrc(out, 0, 12);
    wu16le(out, 12, hcrc);
  }

  // Recompute file CRC
  const fileCrc = computeCrc(out, 0, headerSize + newDataSize);
  wu16le(out, headerSize + newDataSize, fileCrc);

  return out.buffer;
}
