import type { FitActivity, Marker } from '../types';

const FIT_EPOCH_S = 631065600; // seconds from Unix to FIT epoch

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

function ru32le(b: Uint8Array, o: number): number {
  return ((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0);
}
function ru32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function wu32le(b: Uint8Array, o: number, v: number): void {
  b[o] = v & 0xff; b[o + 1] = (v >> 8) & 0xff; b[o + 2] = (v >> 16) & 0xff; b[o + 3] = (v >> 24) & 0xff;
}
function wu32be(b: Uint8Array, o: number, v: number): void {
  b[o] = (v >> 24) & 0xff; b[o + 1] = (v >> 16) & 0xff; b[o + 2] = (v >> 8) & 0xff; b[o + 3] = v & 0xff;
}
function wu16le(b: Uint8Array, o: number, v: number): void { b[o] = v & 0xff; b[o + 1] = (v >> 8) & 0xff; }
function wu16be(b: Uint8Array, o: number, v: number): void { b[o] = (v >> 8) & 0xff; b[o + 1] = v & 0xff; }

interface FieldDef { fieldDef: number; size: number; isDev: boolean; }

interface LapInfo {
  defStart: number; defEnd: number;
  dataStart: number; dataEnd: number;
  bigEndian: boolean;
  fields: FieldDef[];
  fieldOffsets: Map<number, { off: number; size: number }>;
  startTimeFit: number;  // FIT seconds (field 2)
  timestampFit: number;  // FIT seconds (field 253)
  elapsedRaw: number;    // field 7: seconds * 1000
  timerRaw: number;      // field 8: seconds * 1000
  distanceRaw: number;   // field 9: meters * 100
}

function scanLapMessages(src: Uint8Array, dataStart: number, dataEnd: number): LapInfo[] {
  type DefEntry = { globalMsgNum: number; fields: FieldDef[]; size: number; bigEndian: boolean };
  const localDefs = new Map<number, DefEntry>();
  const lastDefPos = new Map<number, { start: number; end: number }>();
  const laps: LapInfo[] = [];
  let pos = dataStart;

  while (pos < dataEnd) {
    const header = src[pos];

    if (header & 0x80) {
      // compressed timestamp
      const localType = (header >> 5) & 0x03;
      const def = localDefs.get(localType);
      if (!def) break;
      pos += def.size + 1;
      continue;
    }

    const isDef = (header & 0x40) !== 0;
    const hasDevData = (header & 0x20) !== 0;
    const localType = header & 0x0F;

    if (isDef) {
      const defStart = pos;
      pos += 2; // header + reserved
      const bigEndian = src[pos++] !== 0;
      const globalMsgNum = bigEndian ? ((src[pos] << 8) | src[pos + 1]) : (src[pos] | (src[pos + 1] << 8));
      pos += 2;
      const numFields = src[pos++];
      const fields: FieldDef[] = [];
      let dataSize = 0;
      for (let i = 0; i < numFields; i++) {
        const fd = src[pos++]; const sz = src[pos++]; pos++;
        fields.push({ fieldDef: fd, size: sz, isDev: false });
        dataSize += sz;
      }
      if (hasDevData) {
        const numDev = src[pos++];
        for (let i = 0; i < numDev; i++) {
          const fd = src[pos++]; const sz = src[pos++]; pos++;
          fields.push({ fieldDef: fd, size: sz, isDev: true });
          dataSize += sz;
        }
      }
      localDefs.set(localType, { globalMsgNum, fields, size: dataSize, bigEndian });
      lastDefPos.set(localType, { start: defStart, end: pos });
    } else {
      const def = localDefs.get(localType);
      if (!def) { pos++; break; }

      if (def.globalMsgNum === 19) {
        const dataPos = pos + 1;
        const fieldOffsets = new Map<number, { off: number; size: number }>();
        let off = 0;
        for (const f of def.fields) {
          fieldOffsets.set(f.fieldDef, { off, size: f.size });
          off += f.size;
        }

        const readU = (fieldDef: number): number => {
          const fi = fieldOffsets.get(fieldDef);
          if (!fi) return 0;
          const ao = dataPos + fi.off;
          if (fi.size === 4) return def.bigEndian ? ru32be(src, ao) : ru32le(src, ao);
          if (fi.size === 2) return def.bigEndian ? ((src[ao] << 8) | src[ao + 1]) : (src[ao] | (src[ao + 1] << 8));
          if (fi.size === 1) return src[ao];
          return 0;
        };

        const defInfo = lastDefPos.get(localType)!;
        laps.push({
          defStart: defInfo.start, defEnd: defInfo.end,
          dataStart: pos, dataEnd: pos + def.size + 1,
          bigEndian: def.bigEndian,
          fields: def.fields,
          fieldOffsets,
          startTimeFit: readU(2),
          timestampFit: readU(253),
          elapsedRaw: readU(7),
          timerRaw: readU(8),
          distanceRaw: readU(9),
        });
      }

      pos += def.size + 1;
    }
  }

  return laps;
}

// Returns current active intervals (same logic as getLapIntervals in App.tsx)
function getIntervals(markers: Marker[]): Array<{ start: number; end: number }> {
  return markers
    .slice(0, -1)
    .map((m, i) => ({ start: m.timeOffsetSeconds, end: markers[i + 1].timeOffsetSeconds }))
    .filter((iv) => iv.end > iv.start);
}

interface LapGroup {
  laps: LapInfo[];           // laps[0] is kept, rest are deleted
  newElapsedRaw: number;
  newTimerRaw: number;
  newDistanceRaw: number;
  newMsgIndex: number;
}

export function rewriteLaps(
  activity: FitActivity,
  currentMarkers: Marker[],
): ArrayBuffer {
  const startMs = activity.summary.startTime;
  if (!startMs) return activity.rawFitPayload;

  const src = new Uint8Array(activity.rawFitPayload);
  const headerSize = src[0];
  const origDataSize = ru32le(src, 4);
  const dataEnd = headerSize + origDataSize;

  const laps = scanLapMessages(src, headerSize, dataEnd);
  if (laps.length === 0) return activity.rawFitPayload;

  const activityStartFitS = Math.round(startMs / 1000) - FIT_EPOCH_S;
  const intervals = getIntervals(currentMarkers);

  // Assign each FIT lap to a group based on which current interval contains it
  const groups: LapGroup[] = [];
  for (let gi = 0; gi < intervals.length; gi++) {
    const { start, end } = intervals[gi];
    const group: LapInfo[] = [];
    for (const lap of laps) {
      const lapOffset = lap.startTimeFit - activityStartFitS;
      if (lapOffset >= start && lapOffset < end) {
        group.push(lap);
      }
    }
    if (group.length === 0) continue;
    groups.push({
      laps: group,
      newElapsedRaw: group.reduce((s, l) => s + l.elapsedRaw, 0),
      newTimerRaw: group.reduce((s, l) => s + l.timerRaw, 0),
      newDistanceRaw: group.reduce((s, l) => s + l.distanceRaw, 0),
      newMsgIndex: gi,
    });
  }

  // If no change (all groups have exactly 1 lap and same count), return original
  if (groups.length === laps.length && groups.every((g) => g.laps.length === 1)) {
    return activity.rawFitPayload;
  }

  // Collect deleted lap byte ranges (def+data where def immediately precedes data)
  const deleteRanges: Array<{ start: number; end: number }> = [];
  for (const group of groups) {
    for (let i = 1; i < group.laps.length; i++) {
      const lap = group.laps[i];
      deleteRanges.push({
        start: lap.defEnd === lap.dataStart ? lap.defStart : lap.dataStart,
        end: lap.dataEnd,
      });
    }
  }

  // Build output: copy original, skipping deleted ranges, patching kept laps
  const deletedBytes = deleteRanges.reduce((s, r) => s + r.end - r.start, 0);
  const newDataSize = origDataSize - deletedBytes;
  // header (no trailing CRC on header in all FIT versions) + data + file CRC (2 bytes)
  const out = new Uint8Array(headerSize + newDataSize + 2);

  // Copy header
  out.set(src.subarray(0, headerSize));
  // Update data_size in header
  wu32le(out, 4, newDataSize);

  // Sort delete ranges
  deleteRanges.sort((a, b) => a.start - b.start);

  // Build a set of ranges to include
  let srcPos = headerSize;
  let outPos = headerSize;

  const skipTo = (targetSrcPos: number) => {
    if (targetSrcPos > srcPos) {
      out.set(src.subarray(srcPos, targetSrcPos), outPos);
      outPos += targetSrcPos - srcPos;
      srcPos = targetSrcPos;
    }
  };

  for (const range of deleteRanges) {
    skipTo(range.start);
    srcPos = range.end; // skip deleted bytes
  }
  skipTo(dataEnd); // copy remaining data after last deletion

  // Now patch surviving lap data messages in the output buffer
  // We need to re-map source positions to output positions
  // Build a position map: for each source byte offset, compute output offset
  const buildSrcToOutOffset = (srcOffset: number): number => {
    let skipped = 0;
    for (const range of deleteRanges) {
      if (range.start >= srcOffset) break;
      const skipEnd = Math.min(range.end, srcOffset);
      skipped += skipEnd - range.start;
    }
    return srcOffset - skipped;
  };

  for (const group of groups) {
    const keeper = group.laps[0];
    const dataOutPos = buildSrcToOutOffset(keeper.dataStart);
    const dataBodyOutPos = dataOutPos + 1; // skip the record header byte

    const writeField = (fieldDef: number, value: number) => {
      const fi = keeper.fieldOffsets.get(fieldDef);
      if (!fi) return;
      const ao = dataBodyOutPos + fi.off;
      const be = keeper.bigEndian;
      if (fi.size === 4) { if (be) wu32be(out, ao, value); else wu32le(out, ao, value); }
      else if (fi.size === 2) { if (be) wu16be(out, ao, value); else wu16le(out, ao, value); }
      else if (fi.size === 1) { out[ao] = value & 0xff; }
    };

    // Renumber message index
    writeField(254, group.newMsgIndex);

    // Update totals
    writeField(7, group.newElapsedRaw);
    writeField(8, group.newTimerRaw);
    writeField(9, group.newDistanceRaw);

    // Update timestamp (field 253) = start_time + elapsed_seconds
    if (keeper.fieldOffsets.has(253) && keeper.fieldOffsets.has(2)) {
      const newTimestamp = keeper.startTimeFit + Math.round(group.newElapsedRaw / 1000);
      writeField(253, newTimestamp);
    }
  }

  // Recompute header CRC (bytes 0–11 → stored at bytes 12–13) if header >= 14
  if (headerSize >= 14) {
    let hcrc = 0;
    for (let i = 0; i < 12; i++) hcrc = crcByte(hcrc, out[i]);
    wu16le(out, 12, hcrc);
  }

  // Compute file CRC over entire header + data
  let fileCrc = 0;
  for (let i = 0; i < headerSize + newDataSize; i++) fileCrc = crcByte(fileCrc, out[i]);
  wu16le(out, headerSize + newDataSize, fileCrc);

  return out.buffer;
}
