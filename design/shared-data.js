// Shared lap data + procedural chart series for all 3 directions.
// Reads roughly off the current screenshot so everyone compares apples to apples.

window.LAP_DATA = {
  filename: "1776949031-GIR.fit",
  size: "186.2 KB",
  when: "23 Apr 2026, 14:57",
  totalDurationSec: 53 * 60 + 2,
  rows: [
    // start, duration(s), distance(m), pace(s/km), power(W), hr(bpm), cad(spm)
    { n: 1,  start:    0, dur:  358, dist:  974, pace: 379, power: 241, hr: 116, cad: 162 },
    { n: 2,  start:  358, dur:  362, dist: 1058, pace: 345, power: 247, hr: 127, cad: 163 },
    { n: 3,  start:  720, dur:   60, dist:  223, pace: 273, power: 325, hr: 138, cad: 179 },
    { n: 4,  start:  780, dur:  120, dist:  318, pace: 376, power: 241, hr: 138, cad: 162 },
    { n: 5,  start:  900, dur:   60, dist:  231, pace: 265, power: 329, hr: 142, cad: 183 },
    { n: 6,  start:  960, dur:  240, dist:  676, pace: 354, power: 247, hr: 141, cad: 165 },
    { n: 7,  start: 1200, dur:  660, dist: 2402, pace: 276, power: 310, hr: 160, cad: 180 },
    { n: 8,  start: 1860, dur:  180, dist:  433, pace: 418, power: 228, hr: 153, cad: 159 },
    { n: 9,  start: 2040, dur:  660, dist: 2458, pace: 269, power: 311, hr: 164, cad: 180 },
    { n: 10, start: 2700, dur:  482, dist: 1261, pace: 383, power: 234, hr: 149, cad: 161 },
  ],
  total: { dur: 3182, dist: 10034, pace: 317, power: 272, hr: 147, cad: 170 },
  removedBoundaries: ["18:00", "48:00", "50:00"],
  addedBoundaries: ["5:58"],
};

// Deterministic noise-y series for the mock chart.
// duration in seconds, returns array of {x, y} where x∈[0..1], y is the value.
window.genSeries = function genSeries(seed, samples, valueAt) {
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
  const out = [];
  let prev = valueAt(0);
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const target = valueAt(t);
    const jitter = (rand() - 0.5) * (target * 0.06);
    const smoothed = prev * 0.55 + (target + jitter) * 0.45;
    prev = smoothed;
    out.push({ x: t, y: smoothed });
  }
  return out;
};

// Returns a smooth SVG path "M x,y L x,y …" for a series.
// xPct/yVal in [0..1] of the plot area.
window.toPolyPath = function toPolyPath(series, w, h, yMin, yMax, yInverted = false) {
  if (!series.length) return "";
  const yRange = yMax - yMin || 1;
  const pts = series.map((p, i) => {
    const x = p.x * w;
    let yNorm = (p.y - yMin) / yRange; // 0..1
    if (yInverted) yNorm = 1 - yNorm;
    const y = (1 - yNorm) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return "M" + pts.join(" L");
};

// Elevation as an area path (closed at the bottom)
window.toAreaPath = function toAreaPath(series, w, h, yMin, yMax) {
  if (!series.length) return "";
  const yRange = yMax - yMin || 1;
  const pts = series.map((p) => {
    const x = p.x * w;
    const yNorm = (p.y - yMin) / yRange;
    const y = (1 - yNorm) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const first = pts[0].split(",")[0];
  const last = pts[pts.length - 1].split(",")[0];
  return `M${first},${h} L${pts.join(" L")} L${last},${h} Z`;
};

// Format seconds → "m:ss" or "h:mm:ss"
window.fmtDur = function fmtDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
};

// Format pace seconds-per-km → "m:ss"
window.fmtPace = function fmtPace(secPerKm) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};
