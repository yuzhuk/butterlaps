import { useRef, useState, useEffect, useMemo } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { FitActivity } from '../types';

const CHART_MARGIN = { top: 5, right: 10, bottom: 35, left: 10 } as const;

const PRIMARY_SERIES = ['Pace', 'Power', 'Heart Rate', 'Cadence'] as const;

const SERIES_COLORS: Record<string, string> = {
  Pace: '#6366f1',
  'Heart Rate': '#ef4444',
  Power: '#f59e0b',
  Cadence: '#10b981',
};

const SERIES_YAXIS: Record<string, string> = {
  Pace: 'pace',
  'Heart Rate': 'hr',
  Power: 'power',
  Cadence: 'cadence',
};

function formatXTick(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
  if (s === 0) return `${m}:00`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  activity: FitActivity;
}

export function ChartPanel({ activity }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const [activeSeries, setActiveSeries] = useState<Set<string>>(() => {
    const defaults = new Set<string>();
    if (activity.series.some((s) => s.name === 'Elevation')) defaults.add('Elevation');
    if (activity.series.some((s) => s.name === 'Pace')) defaults.add('Pace');
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
  const domain: [number, number] = [0, totalDuration];

  const availablePrimary = useMemo(
    () => PRIMARY_SERIES.filter((name) => activity.series.some((s) => s.name === name)),
    [activity],
  );

  const elevationSeries = activity.series.find((s) => s.name === 'Elevation');

  const toggleSeries = (name: string) => {
    setActiveSeries((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="chart-section">
      <div className="series-toggles">
        {elevationSeries && (
          <button
            type="button"
            className={`series-toggle series-toggle--elevation ${activeSeries.has('Elevation') ? 'series-toggle--active' : ''}`}
            onClick={() => toggleSeries('Elevation')}
          >
            Elevation
          </button>
        )}
        {availablePrimary.map((name) => (
          <button
            key={name}
            type="button"
            className={`series-toggle series-toggle--${name.toLowerCase().replace(' ', '-')} ${activeSeries.has(name) ? 'series-toggle--active' : ''}`}
            onClick={() => toggleSeries(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div ref={containerRef} className="chart-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={CHART_MARGIN}>
            <defs>
              <linearGradient id="elevGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c8bdb4" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#c8bdb4" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Disable popup; active dots (sliding points) stay on via default activeDot */}
            <Tooltip content={() => null} cursor={false} />

            <XAxis
              type="number"
              dataKey="timeOffsetSeconds"
              domain={domain}
              allowDataOverflow
              tickFormatter={formatXTick}
              tickCount={8}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={{ stroke: '#e2e8f0' }}
            />

            <YAxis yAxisId="elev" hide domain={['dataMin - 10', 'dataMax + 30']} />
            <YAxis yAxisId="pace" hide reversed domain={['auto', 'auto']} />
            <YAxis yAxisId="hr" hide domain={['auto', 'auto']} />
            <YAxis yAxisId="power" hide domain={['auto', 'auto']} />
            <YAxis yAxisId="cadence" hide domain={['auto', 'auto']} />

            {activeSeries.has('Elevation') && elevationSeries && (
              <Area
                data={elevationSeries.values}
                dataKey="value"
                xAxisId={0}
                yAxisId="elev"
                fill="url(#elevGradient)"
                stroke="#b0a098"
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
        </ResponsiveContainer>
      </div>
    </div>
  );
}
