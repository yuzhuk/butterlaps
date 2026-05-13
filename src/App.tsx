import { useRef, useState, type ChangeEvent } from 'react';
import { version } from '../package.json';
import { parseFitFile } from './fit/fitParser';
import { ChartPanel } from './components/ChartPanel';
import type { FitActivity } from './types';

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatActivityDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getExportFileName(originalName: string): string {
  const lastDotIndex = originalName.lastIndexOf('.');
  if (lastDotIndex <= 0) {
    return `${originalName}-betterlaps`;
  }

  const baseName = originalName.slice(0, lastDotIndex);
  const extension = originalName.slice(lastDotIndex);
  return `${baseName}-betterlaps${extension}`;
}

function getLapIntervals(markers: Array<{ timeOffsetSeconds: number; label: string }>) {
  return markers
    .slice(0, -1)
    .map((marker, index) => {
      const next = markers[index + 1];
      return {
        lapNumber: index + 1,
        startOffsetSeconds: marker.timeOffsetSeconds,
        durationSeconds: next.timeOffsetSeconds - marker.timeOffsetSeconds,
      };
    })
    .filter((interval) => interval.durationSeconds > 0);
}

const SERIES_ORDER = ['Distance', 'Pace', 'Power', 'Heart Rate', 'Cadence'];

const SERIES_UNITS: Record<string, string> = {
  Distance: 'm',
  Pace: '/km',
  Power: 'W',
  'Heart Rate': 'bpm',
};

function getSeriesUnit(seriesName: string, activityType: string): string | undefined {
  if (seriesName === 'Cadence') {
    return activityType === 'running' ? 'spm' : 'rpm';
  }
  return SERIES_UNITS[seriesName];
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

function buildLapRows(activity: FitActivity) {
  const intervals = getLapIntervals(activity.markers);
  const seriesList = getTableSeries(activity);

  return intervals.map((interval, index) => ({
    ...interval,
    lapNumber: index + 1,
    values: seriesList.map((series) => {
      const points = series.values.filter(
        (point) => point.timeOffsetSeconds >= interval.startOffsetSeconds && point.timeOffsetSeconds < interval.startOffsetSeconds + interval.durationSeconds
      );

      if (series.name === 'Distance') {
        const value = points.length > 1 ? points[points.length - 1].value - points[0].value : null;
        return { name: series.name, value };
      }

      const average = points.length
        ? points.reduce((sum, point) => sum + point.value, 0) / points.length
        : null;
      return { name: series.name, value: average };
    }),
  }));
}

function getSummaryRow(activity: FitActivity) {
  const seriesList = getTableSeries(activity);
  const lapRows = buildLapRows(activity);
  const totalDuration = lapRows.reduce((sum, row) => sum + row.durationSeconds, 0);
  const distanceSeries = activity.series.find((series) => series.name === 'Distance');
  const totalDistance = distanceSeries && distanceSeries.values.length > 1
    ? distanceSeries.values[distanceSeries.values.length - 1].value - distanceSeries.values[0].value
    : null;

  return {
    lapNumber: 'Total / Avg',
    startOffsetSeconds: 0,
    durationSeconds: totalDuration,
    values: seriesList.map((series) => {
      const allPoints = series.values;
      if (series.name === 'Distance') {
        return { name: series.name, value: totalDistance };
      }

      if (series.name === 'Pace') {
        const value = totalDistance && totalDistance > 0 ? (totalDuration / totalDistance) * 1000 : null;
        return { name: series.name, value };
      }

      const aggregate = allPoints.length
        ? allPoints.reduce((sum, point) => sum + point.value, 0) / allPoints.length
        : null;
      return { name: series.name, value: aggregate };
    }),
  };
}

function formatLapValue(value: number | null, metric?: string) {
  if (value == null) {
    return '—';
  }

  if (metric === 'Pace') {
    const totalSeconds = Math.round(value);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  return String(Math.round(value));
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [activity, setActivity] = useState<FitActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [zoom, setZoom] = useState<{ start: number; end: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      if (!selectedFile.name.toLowerCase().endsWith('.fit')) {
        throw new Error('Only .fit files are supported.');
      }

      const parsedActivity = await parseFitFile(selectedFile);
      setFile(selectedFile);
      setActivity(parsedActivity);
      setZoom(null);
    } catch (err) {
      setFile(null);
      setActivity(null);
      setZoom(null);
      setError(err instanceof Error ? err.message : 'Unable to read the uploaded file.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!file) {
      return;
    }

    const payload = activity?.rawFitPayload ?? file;
    const blob = payload instanceof File ? payload : new Blob([payload], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = getExportFileName(file.name);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const summaryRow = activity ? getSummaryRow(activity) : null;

  return (
    <div className="container">
      <header className="page-header">
        <div>
          <p className="eyebrow">BetterLaps</p>
          <h1>Edit lap boundaries without damaging FIT data</h1>
        </div>
        <p>
          Upload a `.fit` activity, inspect lap boundaries on an interactive chart, and export a corrected file that preserves the original FIT structure.
        </p>
      </header>

      <section className="panel">
        <div className="upload-box">
          <input
            ref={fileInputRef}
            type="file"
            accept=".fit"
            onChange={handleFileChange}
            className="file-input"
          />
          <button type="button" onClick={openFilePicker}>Upload FIT file</button>
        </div>
        {error ? <div className="alert">{error}</div> : null}
        {isLoading ? <p>Loading file…</p> : null}

        {file && (
          <div className="activity-section">
            <p className="file-meta">
              {file.name}
              <span className="file-meta-sep">·</span>
              {formatFileSize(file.size)}
              {activity?.summary.startTime != null && (
                <>
                  <span className="file-meta-sep">·</span>
                  {formatActivityDate(activity.summary.startTime)}
                </>
              )}
            </p>

            {activity && (
              <div className="activity-layout">
                <ChartPanel
                  activity={activity}
                  zoom={zoom}
                  onZoom={(start, end) => setZoom({ start, end })}
                  onZoomReset={() => setZoom(null)}
                />
                <div className="lap-details">
                  <h2>Lap details</h2>
                  <div className="table-scroll">
                    <table className="lap-table">
                      <thead>
                        <tr>
                          <th>Lap</th>
                          <th>Start</th>
                          <th>Duration</th>
                          {getTableSeries(activity).map((series) => (
                            <th key={series.name}>{series.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {buildLapRows(activity).map((row) => (
                          <tr
                            key={row.lapNumber}
                            onClick={() => setZoom({ start: row.startOffsetSeconds, end: row.startOffsetSeconds + row.durationSeconds })}
                          >
                            <td>{row.lapNumber}</td>
                            <td>{formatDuration(row.startOffsetSeconds)}</td>
                            <td>{formatDuration(row.durationSeconds)}</td>
                            {row.values.map((value) => (
                              <td key={value.name}>
                                {formatLapValue(value.value, value.name)}
                                {value.value != null && getSeriesUnit(value.name, activity.summary.activityType) && (
                                  <span className="col-unit">{getSeriesUnit(value.name, activity.summary.activityType)}</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      {summaryRow ? (
                        <tfoot>
                          <tr onClick={() => setZoom(null)}>
                            <td colSpan={2}>{summaryRow.lapNumber}</td>
                            <td>{formatDuration(summaryRow.durationSeconds)}</td>
                            {summaryRow.values.map((value) => (
                              <td key={value.name}>
                                {formatLapValue(value.value, value.name)}
                                {value.value != null && getSeriesUnit(value.name, activity.summary.activityType) && (
                                  <span className="col-unit">{getSeriesUnit(value.name, activity.summary.activityType)}</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      ) : null}
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="summary-section">
          <h2>File summary</h2>
          {file ? (
            <div className="lap-list">
              <div className="lap-item">
                <strong>File ready to export</strong>
                <span>The uploaded file will be downloaded unchanged when you export it.</span>
              </div>
            </div>
          ) : (
            <p>Upload a FIT file to see basic information and enable export.</p>
          )}
          {file && (
            <div className="file-actions">
              <button type="button" onClick={handleExport}>Export same FIT file</button>
            </div>
          )}
        </div>
      </section>
      <div className="version">v{version}</div>
    </div>
  );
}

export default App;
