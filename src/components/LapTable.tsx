import type { FitActivity, Marker } from '../types';
import { formatDuration } from '../format';

const SERIES_ORDER = ['Distance', 'Pace', 'Speed', 'Power', 'Heart Rate', 'Cadence'];

const SERIES_UNITS: Record<string, string> = {
  Distance: 'm',
  Pace: '/km',
  Speed: 'km/h',
  Power: 'W',
  'Heart Rate': 'bpm',
};

const CELL_CLASS: Record<string, string> = {
  Pace: 'cell-pace',
  Speed: 'cell-pace',
  Power: 'cell-power',
  'Heart Rate': 'cell-hr',
  Cadence: 'cell-cad',
};

const TH_CLASS: Record<string, string> = {
  Pace: 'th-pace',
  Speed: 'th-pace',
  Power: 'th-power',
  'Heart Rate': 'th-hr',
  Cadence: 'th-cad',
};

const COL_LABEL: Record<string, string> = {
  Distance: 'DIST',
  Pace: 'PACE',
  Speed: 'SPD',
  Power: 'PWR',
  'Heart Rate': 'HR',
  Cadence: 'CAD',
};

export function getLapIntervals(markers: Marker[]) {
  return markers
    .slice(0, -1)
    .map((marker, index) => {
      const next = markers[index + 1];
      return {
        lapNumber: index + 1,
        markerIndex: index,
        startOffsetSeconds: marker.timeOffsetSeconds,
        durationSeconds: next.timeOffsetSeconds - marker.timeOffsetSeconds,
      };
    })
    .filter((interval) => interval.durationSeconds > 0);
}

function getTableSeries(activity: FitActivity) {
  return activity.series
    .filter((series) => series.name !== 'Elevation')
    .sort((a, b) => {
      const ai = SERIES_ORDER.indexOf(a.name);
      const bi = SERIES_ORDER.indexOf(b.name);
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    });
}

function getSeriesUnit(seriesName: string, activityType: string): string | undefined {
  if (seriesName === 'Cadence') return activityType === 'running' ? 'spm' : 'rpm';
  return SERIES_UNITS[seriesName];
}

function buildLapRows(activity: FitActivity, markers: Marker[]) {
  const intervals = getLapIntervals(markers);
  const seriesList = getTableSeries(activity);
  return intervals.map((interval, index) => ({
    ...interval,
    lapNumber: index + 1,
    values: seriesList.map((series) => {
      const points = series.values.filter(
        (p) => p.timeOffsetSeconds >= interval.startOffsetSeconds &&
               p.timeOffsetSeconds <= interval.startOffsetSeconds + interval.durationSeconds,
      );
      if (series.name === 'Distance') {
        const last = points.length > 1 ? points[points.length - 1].value : null;
        const first = points.length > 1 ? points[0].value : null;
        const value = last !== null && first !== null ? last - first : null;
        return { name: series.name, value };
      }
      const nonNull = points.filter((p): p is { timeOffsetSeconds: number; value: number } => p.value !== null);
      const average = nonNull.length ? nonNull.reduce((sum, p) => sum + p.value, 0) / nonNull.length : null;
      return { name: series.name, value: average };
    }),
  }));
}

function getSummaryRow(activity: FitActivity, markers: Marker[]) {
  const seriesList = getTableSeries(activity);
  const lapRows = buildLapRows(activity, markers);
  const totalDuration = lapRows.reduce((sum, row) => sum + row.durationSeconds, 0);
  const distanceSeries = activity.series.find((s) => s.name === 'Distance');
  const lastDist = distanceSeries && distanceSeries.values.length > 1
    ? distanceSeries.values[distanceSeries.values.length - 1].value : null;
  const firstDist = distanceSeries && distanceSeries.values.length > 1
    ? distanceSeries.values[0].value : null;
  const totalDistance = lastDist !== null && firstDist !== null ? lastDist - firstDist : null;
  return {
    durationSeconds: totalDuration,
    values: seriesList.map((series) => {
      if (series.name === 'Distance') return { name: series.name, value: totalDistance };
      if (series.name === 'Pace') {
        const value = totalDistance && totalDistance > 0 ? (totalDuration / totalDistance) * 1000 : null;
        return { name: series.name, value };
      }
      if (series.name === 'Speed') {
        const value = totalDistance && totalDuration > 0 ? (totalDistance / totalDuration) * 3.6 : null;
        return { name: series.name, value };
      }
      const nonNull = series.values.filter((p): p is { timeOffsetSeconds: number; value: number } => p.value !== null);
      const aggregate = nonNull.length
        ? nonNull.reduce((sum, p) => sum + p.value, 0) / nonNull.length
        : null;
      return { name: series.name, value: aggregate };
    }),
  };
}

function formatLapValue(value: number | null, metric?: string) {
  if (value == null) return '—';
  if (metric === 'Pace') {
    const totalSeconds = Math.round(value);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
  }
  if (metric === 'Speed') return value.toFixed(1);
  return String(Math.round(value));
}

interface Props {
  activity: FitActivity;
  markers: Marker[];
  onMergeLap: (markerIndex: number) => void;
  onSelectLap: (start: number, end: number) => void;
  onClearZoom: () => void;
  onReset: () => void;
}

export function LapTable({ activity, markers, onMergeLap, onSelectLap, onClearZoom, onReset }: Props) {
  const lapRows = buildLapRows(activity, markers);
  const summaryRow = getSummaryRow(activity, markers);
  const tableSeries = getTableSeries(activity);

  return (
    <>
      <div className="table-head">
        <div className="table-head__title">
          <h2>Laps</h2>
          <span className="table-head__count">{lapRows.length}</span>
        </div>
        <button type="button" className="btn-danger" onClick={onReset}>Reset</button>
      </div>
      <div className="table-scroll">
        <table className="lap-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Start</th>
              <th>Dur</th>
              {tableSeries.map((series) => (
                <th key={series.name} className={TH_CLASS[series.name] ?? ''}>
                  {COL_LABEL[series.name] ?? series.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lapRows.map((row, index) => (
              <tr
                key={row.lapNumber}
                onClick={() => onSelectLap(row.startOffsetSeconds, row.startOffsetSeconds + row.durationSeconds)}
              >
                <td>
                  <span className="lap-num-text">L{String(row.lapNumber).padStart(2, '0')}</span>
                  {index < lapRows.length - 1 && (
                    <button
                      type="button"
                      className="lap-merge-btn"
                      aria-label={`Merge lap ${row.lapNumber} with lap ${lapRows[index + 1].lapNumber}`}
                      onClick={(e) => { e.stopPropagation(); onMergeLap(lapRows[index + 1].markerIndex); }}
                    >
                      <svg className="lap-merge-half lap-merge-half--l" width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                        <path d="M1.5 1.5 L4.5 4.5 L1.5 7.5" />
                      </svg>
                      <span className="lap-merge-label">merge</span>
                      <svg className="lap-merge-half lap-merge-half--r" width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                        <path d="M7.5 1.5 L4.5 4.5 L7.5 7.5" />
                      </svg>
                    </button>
                  )}
                </td>
                <td>{formatDuration(row.startOffsetSeconds)}</td>
                <td>{formatDuration(row.durationSeconds)}</td>
                {row.values.map((value) => (
                  <td key={value.name} className={CELL_CLASS[value.name] ?? ''}>
                    {formatLapValue(value.value, value.name)}
                    {value.value != null && getSeriesUnit(value.name, activity.summary.activityType) && (
                      <span className="col-unit">{getSeriesUnit(value.name, activity.summary.activityType)}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {summaryRow && (
            <tfoot>
              <tr onClick={onClearZoom}>
                <td colSpan={2}>Σ Total / Avg</td>
                <td>{formatDuration(summaryRow.durationSeconds)}</td>
                {summaryRow.values.map((value) => (
                  <td key={value.name} className={CELL_CLASS[value.name] ?? ''}>
                    {formatLapValue(value.value, value.name)}
                    {value.value != null && getSeriesUnit(value.name, activity.summary.activityType) && (
                      <span className="col-unit">{getSeriesUnit(value.name, activity.summary.activityType)}</span>
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
