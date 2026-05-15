import { useRef, useState, useEffect, useMemo } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceArea } from 'recharts';
import type { FitActivity, Marker } from '../types';
import { ChartZoomOverlay, type HoverSeriesInfo } from './ChartZoomOverlay';

const CHART_MARGIN = { top: 18, right: 10, bottom: 24, left: 10 } as const;
const CHART_HEIGHT = 300;
const XAXIS_HEIGHT = 24;
const PLOT_HEIGHT = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom - XAXIS_HEIGHT;
const ZOOM_PADDING = 0.10;

const PRIMARY_SERIES = ['Pace', 'Speed', 'Power', 'Heart Rate', 'Cadence'] as const;

const STORAGE_BASE = 'butterlaps-active-series';
const SPORT_FALLBACK_ORDER = ['running', 'cycling', 'swimming'];

// Pace and Speed are the same toggle concept; stored as 'Pace', resolved on read.
function normForStorage(name: string): string {
  return name === 'Speed' ? 'Pace' : name;
}
function normForSport(name: string, activityType: string): string {
  return name === 'Pace' && activityType === 'cycling' ? 'Speed' : name;
}

function readStoredSeries(activityType: string): Set<string> | null {
  try {
    const order = [activityType, ...SPORT_FALLBACK_ORDER.filter((s) => s !== activityType)];
    for (const sport of order) {
      const raw = localStorage.getItem(`${STORAGE_BASE}-${sport}`);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set((parsed as string[]).map((n) => normForSport(n, activityType)));
      }
    }
  } catch { /* ignore */ }
  return null;
}

function writeStoredSeries(active: Set<string>, activityType: string) {
  try {
    localStorage.setItem(
      `${STORAGE_BASE}-${activityType}`,
      JSON.stringify([...active].map(normForStorage)),
    );
  } catch { /* ignore */ }
}

const SERIES_COLORS: Record<string, string> = {
  Pace: '#4f3bcc',
  Speed: '#4f3bcc',
  'Heart Rate': '#9e2020',
  Power: '#c5701b',
  Cadence: '#2e7a4e',
};

const SERIES_UNITS: Record<string, string> = {
  Pace: '/km',
  Speed: 'km/h',
  Power: 'W',
  'Heart Rate': 'bpm',
};

function getUnit(name: string, activityType: string): string {
  if (name === 'Cadence') return activityType === 'running' ? 'spm' : 'rpm';
  return SERIES_UNITS[name] ?? '';
}

const SERIES_YAXIS: Record<string, string> = {
  Pace: 'pace',
  Speed: 'speed',
  'Heart Rate': 'hr',
  Power: 'power',
  Cadence: 'cadence',
};

function computeTicks(start: number, end: number): number[] {
  const NICE = [5, 10, 15, 20, 30, 60, 120, 180, 300, 600, 900, 1800, 3600];
  const interval = NICE.find((i) => i >= (end - start) / 6) ?? 3600;
  const ticks: number[] = [start];
  const first = Math.ceil(start / interval) * interval;
  for (let t = first; t < end; t += interval) {
    if (t > start) ticks.push(t);
  }
  if (ticks[ticks.length - 1] !== end) ticks.push(end);
  return ticks;
}

function formatXTick(raw: number): string {
  const t = Math.round(raw);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  if (s === 0) return `${m}:00`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  activity: FitActivity;
  markers: Marker[];
  zoom: { start: number; end: number } | null;
  onZoom: (start: number, end: number) => void;
  onZoomReset: () => void;
  onAddMarker: (t: number) => void;
  onMoveMarker: (originalTime: number, newTime: number) => void;
  onMergeMarker: (draggedTime: number) => void;
}

export function ChartPanel({ activity, markers, zoom, onZoom, onZoomReset, onAddMarker, onMoveMarker, onMergeMarker }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const [activeSeries, setActiveSeries] = useState<Set<string>>(() => {
    const available = new Set(activity.series.map((s) => s.name));
    const stored = readStoredSeries(activity.summary.activityType);
    if (stored) return new Set([...stored].filter((name) => available.has(name)));
    const defaults = new Set<string>();
    if (available.has('Elevation')) defaults.add('Elevation');
    if (available.has('Pace')) defaults.add('Pace');
    if (available.has('Speed')) defaults.add('Speed');
    return defaults;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalDuration = activity.summary.durationSeconds;

  const displayDomain = useMemo((): [number, number] => {
    if (!zoom) return [0, totalDuration];
    const pad = Math.round((zoom.end - zoom.start) * ZOOM_PADDING);
    return [Math.max(0, zoom.start - pad), Math.min(totalDuration, zoom.end + pad)];
  }, [zoom, totalDuration]);

  const ticks = useMemo(() => {
    const base = computeTicks(displayDomain[0], displayDomain[1]);
    if (!zoom) return base;
    const set = new Set(base);
    const result = [...base];
    for (const t of [zoom.start, zoom.end]) {
      if (!set.has(t)) {
        const i = result.findIndex((v) => v > t);
        result.splice(i === -1 ? result.length : i, 0, t);
      }
    }
    return result;
  }, [displayDomain, zoom]);

  const xTick = useMemo(() => {
    const leftAnchors = new Set([displayDomain[0], zoom?.start]);
    const rightAnchors = new Set([displayDomain[1], zoom?.end]);
    return function XTick({ x, y, payload }: { x: string | number; y: string | number; payload: { value: number } }) {
      const v = payload.value;
      const anchor = leftAnchors.has(v) ? 'start' : rightAnchors.has(v) ? 'end' : 'middle';
      return (
        <text x={x} y={y} dy={10} textAnchor={anchor} fontSize={10} fill="#969389" fontFamily="JetBrains Mono, monospace">
          {formatXTick(v)}
        </text>
      );
    };
  }, [displayDomain, zoom]);

  const availablePrimary = useMemo(
    () => PRIMARY_SERIES.filter((name) => activity.series.some((s) => s.name === name)),
    [activity],
  );

  const elevationSeries = activity.series.find((s) => s.name === 'Elevation');
  const distanceSeries = activity.series.find((s) => s.name === 'Distance');

  const minElevation = useMemo(() => {
    if (!elevationSeries || !elevationSeries.values.length) return 0;
    return elevationSeries.values.reduce((min, v) => v.value !== null ? Math.min(min, v.value) : min, Infinity);
  }, [elevationSeries]);

  function domainClipZeros(series: typeof hrSeries): [(d: number) => number, (d: number) => number] {
    if (!series || !series.values.length) return [(d) => d, (d) => d];
    const hasZero = series.values.some((v) => v.value === 0);
    if (!hasZero) return [(d) => d, (d) => d * 1.15];
    const minNonZero = series.values.reduce(
      (min, v) => (v.value !== null && v.value > 0 ? Math.min(min, v.value) : min),
      Infinity,
    );
    const floor = isFinite(minNonZero) ? minNonZero / 2 : 0;
    return [() => floor, (d) => d * 1.15];
  }

  const hrSeries = activity.series.find((s) => s.name === 'Heart Rate');
  const hrDomain = useMemo(() => domainClipZeros(hrSeries), [hrSeries]);

  const paceSeries = activity.series.find((s) => s.name === 'Pace');
  const paceDomain = useMemo((): [(d: number) => number, (d: number) => number] => {
    if (!paceSeries?.values.length) return [(d) => d, (d) => d];
    // cap outliers (GPS drift / stops) at a sport-specific max pace
    const CAP: Record<string, number> = {
      running:  900,   // 15:00/km
      walking:  1500,  // 25:00/km
      hiking:   1800,  // 30:00/km
      swimming: 2400,  // ~40:00/km
    };
    const cap = CAP[activity.summary.activityType] ?? 1800;
    let minPace = Infinity, maxPace = -Infinity;
    for (const v of paceSeries.values) {
      if (v.value === null || v.value > cap) continue;
      if (v.value < minPace) minPace = v.value;
      if (v.value > maxPace) maxPace = v.value;
    }
    if (!isFinite(minPace)) return [(d) => d, (d) => d];
    const pad = Math.max((maxPace - minPace) * 0.15, 10); // ≥10s so flat efforts still breathe
    return [() => Math.max(0, minPace - pad), () => maxPace + pad];
  }, [paceSeries, activity.summary.activityType]);

  const hoverSeriesData = useMemo((): HoverSeriesInfo[] => {
    const result: HoverSeriesInfo[] = [];

    for (const name of availablePrimary) {
      if (!activeSeries.has(name)) continue;
      const s = activity.series.find((ser) => ser.name === name);
      if (!s || !s.values.length) continue;
      result.push({
        name,
        color: SERIES_COLORS[name],
        unit: getUnit(name, activity.summary.activityType),
        values: s.values,
      });
    }

    if (activeSeries.has('Elevation') && elevationSeries) {
      result.push({ name: 'Elevation', color: '#9c8060', unit: 'm', values: elevationSeries.values });
    }

    if (distanceSeries && distanceSeries.values.length) {
      result.push({ name: 'Distance', color: '', unit: 'm', values: distanceSeries.values });
    }

    return result;
  }, [availablePrimary, activeSeries, activity, elevationSeries, distanceSeries]);

  const toggleSeries = (name: string) => {
    setActiveSeries((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      writeStoredSeries(next, activity.summary.activityType);
      return next;
    });
  };

  return (
    <div>
      <div className="chips">
        {elevationSeries && (
          <button
            type="button"
            className={`series-chip${activeSeries.has('Elevation') ? ' is-on' : ''}`}
            style={activeSeries.has('Elevation') ? { color: '#7a6448', borderColor: '#7a6448' } : undefined}
            onClick={() => toggleSeries('Elevation')}
          >
            <span
              className="series-chip__led"
              style={activeSeries.has('Elevation') ? { background: '#7a6448', boxShadow: '0 0 5px #7a6448' } : undefined}
            />
            Elev
          </button>
        )}
        {availablePrimary.map((name) => {
          const color = SERIES_COLORS[name];
          const on = activeSeries.has(name);
          return (
            <button
              key={name}
              type="button"
              className={`series-chip${on ? ' is-on' : ''}`}
              style={on ? { color, borderColor: color } : undefined}
              onClick={() => toggleSeries(name)}
            >
              <span
                className="series-chip__led"
                style={on ? { background: color, boxShadow: `0 0 5px ${color}` } : undefined}
              />
              {name === 'Heart Rate' ? 'HR' : name === 'Cadence' ? 'Cad' : name}
            </button>
          );
        })}
      </div>

      <div ref={containerRef} className="chart-wrapper">
        {containerWidth > 0 && <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={CHART_MARGIN}>
            <defs>
              <linearGradient id="elevGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c8b080" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#c8b080" stopOpacity={0.08} />
              </linearGradient>
            </defs>

            {/* Disable popup; active dots (sliding points) stay on via default activeDot */}
            <Tooltip content={() => null} cursor={false} />

            <XAxis
              type="number"
              dataKey="timeOffsetSeconds"
              domain={displayDomain}
              allowDataOverflow
              height={XAXIS_HEIGHT}
              ticks={ticks}
              tick={xTick}
              axisLine={{ stroke: '#e0ddd3' }}
              tickLine={{ stroke: '#e0ddd3' }}
            />

            {zoom && displayDomain[0] < zoom.start && (
              <ReferenceArea x1={displayDomain[0]} x2={zoom.start} yAxisId="elev" fill="rgb(203,213,225)" fillOpacity={0.55} strokeOpacity={0} />
            )}
            {zoom && zoom.end < displayDomain[1] && (
              <ReferenceArea x1={zoom.end} x2={displayDomain[1]} yAxisId="elev" fill="rgb(203,213,225)" fillOpacity={0.55} strokeOpacity={0} />
            )}

            <YAxis yAxisId="elev" hide domain={['dataMin - 10', 'dataMax + 30']} />
            <YAxis yAxisId="pace" hide reversed domain={paceDomain} allowDataOverflow />
            <YAxis yAxisId="speed" hide domain={['auto', 'auto']} />
            <YAxis yAxisId="hr" hide domain={hrDomain} allowDataOverflow />
            <YAxis yAxisId="power" hide domain={[0, (d: number) => d * 1.15]} />
            <YAxis yAxisId="cadence" hide domain={[0, (d: number) => d * 1.15]} />

            {activeSeries.has('Elevation') && elevationSeries && (
              <Area
                data={elevationSeries.values}
                dataKey="value"
                xAxisId={0}
                yAxisId="elev"
                baseValue={minElevation - 10}
                fill="url(#elevGradient)"
                stroke="#9c8060"
                activeDot={false}
                strokeWidth={1}
                dot={false}
                isAnimationActive={false}
              />
            )}


            {availablePrimary
              .filter((name) => activeSeries.has(name))
              .map((name) => {
                const s = activity.series.find((series) => series.name === name);
                if (!s) return null;
                return (
                  <Line
                    key={name}
                    data={s.values}
                    dataKey="value"
                    xAxisId={0}
                    yAxisId={SERIES_YAXIS[name]}
                    stroke={SERIES_COLORS[name]}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                );
              })}
          </ComposedChart>
        </ResponsiveContainer>}

        {containerWidth > 0 && (
          <ChartZoomOverlay
            plotWidth={Math.max(0, containerWidth - CHART_MARGIN.left - CHART_MARGIN.right)}
            plotHeight={PLOT_HEIGHT}
            marginLeft={CHART_MARGIN.left}
            marginTop={CHART_MARGIN.top}
            domain={displayDomain}
            onZoom={onZoom}
            onZoomReset={onZoomReset}
            hoverSeries={hoverSeriesData}
            recordTimestamps={activity.recordTimestamps}
            markerTimes={markers.map((m) => m.timeOffsetSeconds)}
            draggableMarkerTimes={(() => {
              const startT = markers[0]?.timeOffsetSeconds ?? -1;
              const endT = markers[markers.length - 1]?.timeOffsetSeconds ?? -1;
              return markers
                .filter((m) => m.timeOffsetSeconds > startT && m.timeOffsetSeconds < endT)
                .map((m) => m.timeOffsetSeconds);
            })()}
            onAddMarker={onAddMarker}
            onMoveMarker={onMoveMarker}
            onMergeMarker={onMergeMarker}
          />
        )}
      </div>
      <p className="plot-foot">
        drag to zoom · double-click to add marker · drag marker to adjust · drop on neighbour to delete
      </p>
    </div>
  );
}
