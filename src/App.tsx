import { useRef, useState, useEffect, type ChangeEvent } from 'react';
import { version } from '../package.json';
import { parseFitFile, snapToNearestTimestamp } from './fit/fitParser';
import { rewriteLaps } from './fit/fitWriter';
import { ChartPanel } from './components/ChartPanel';
import type { FitActivity, Marker } from './types';

// ---- Formatters ----

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatActivityDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatPace(secondsPerKm: number): string {
  const t = Math.round(secondsPerKm);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function getExportFileName(originalName: string): string {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const ext  = dot > 0 ? originalName.slice(dot) : '';
  const match = base.match(/^(.*-butterlaps)(\d*)$/i);
  if (match) {
    const n = match[2] === '' ? 1 : parseInt(match[2], 10);
    return `${match[1]}${n + 1}${ext}`;
  }
  return `${base}-butterlaps${ext}`;
}

// ---- Lap helpers ----

function getLapIntervals(markers: Marker[]) {
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

const SERIES_ORDER = ['Distance', 'Pace', 'Power', 'Heart Rate', 'Cadence'];

const SERIES_UNITS: Record<string, string> = {
  Distance: 'm',
  Pace: '/km',
  Power: 'W',
  'Heart Rate': 'bpm',
};

function getSeriesUnit(seriesName: string, activityType: string): string | undefined {
  if (seriesName === 'Cadence') return activityType === 'running' ? 'spm' : 'rpm';
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

function buildLapRows(activity: FitActivity, markers: Marker[]) {
  const intervals = getLapIntervals(markers);
  const seriesList = getTableSeries(activity);
  return intervals.map((interval, index) => ({
    ...interval,
    lapNumber: index + 1,
    values: seriesList.map((series) => {
      const points = series.values.filter(
        (p) => p.timeOffsetSeconds >= interval.startOffsetSeconds &&
               p.timeOffsetSeconds <= interval.startOffsetSeconds + interval.durationSeconds
      );
      if (series.name === 'Distance') {
        const value = points.length > 1 ? points[points.length - 1].value - points[0].value : null;
        return { name: series.name, value };
      }
      const average = points.length
        ? points.reduce((sum, p) => sum + p.value, 0) / points.length
        : null;
      return { name: series.name, value: average };
    }),
  }));
}

function getSummaryRow(activity: FitActivity, markers: Marker[]) {
  const seriesList = getTableSeries(activity);
  const lapRows = buildLapRows(activity, markers);
  const totalDuration = lapRows.reduce((sum, row) => sum + row.durationSeconds, 0);
  const distanceSeries = activity.series.find((s) => s.name === 'Distance');
  const totalDistance = distanceSeries && distanceSeries.values.length > 1
    ? distanceSeries.values[distanceSeries.values.length - 1].value - distanceSeries.values[0].value
    : null;
  return {
    durationSeconds: totalDuration,
    values: seriesList.map((series) => {
      if (series.name === 'Distance') return { name: series.name, value: totalDistance };
      if (series.name === 'Pace') {
        const value = totalDistance && totalDistance > 0 ? (totalDuration / totalDistance) * 1000 : null;
        return { name: series.name, value };
      }
      const allPoints = series.values;
      const aggregate = allPoints.length
        ? allPoints.reduce((sum, p) => sum + p.value, 0) / allPoints.length
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
  return String(Math.round(value));
}

// ---- Series cell/header class maps ----

const CELL_CLASS: Record<string, string> = {
  Pace: 'cell-pace',
  Power: 'cell-power',
  'Heart Rate': 'cell-hr',
  Cadence: 'cell-cad',
};

const TH_CLASS: Record<string, string> = {
  Pace: 'th-pace',
  Power: 'th-power',
  'Heart Rate': 'th-hr',
  Cadence: 'th-cad',
};

const COL_LABEL: Record<string, string> = {
  Distance: 'DIST',
  Pace: 'PACE',
  Power: 'PWR',
  'Heart Rate': 'HR',
  Cadence: 'CAD',
};

// ---- Theme ----

type ThemeSetting = 'light' | 'dark' | 'system';

function resolveTheme(setting: ThemeSetting): 'light' | 'dark' {
  if (setting === 'system') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }
  return setting;
}

const THEME_CYCLE: Record<ThemeSetting, ThemeSetting> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

// ---- Inline SVG icons ----

function IconUpload() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 9.5 L6.5 1.5" />
      <path d="M3 5 L6.5 1.5 L10 5" />
      <path d="M1.5 11.5 L11.5 11.5" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 1.5 L6.5 9.5" />
      <path d="M3 6 L6.5 9.5 L10 6" />
      <path d="M1.5 11.5 L11.5 11.5" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="2.4" />
      {[0,1,2,3,4,5,6,7].map((i) => {
        const a = (i * Math.PI) / 4;
        const x1 = (6.5 + Math.cos(a) * 3.9).toFixed(1);
        const y1 = (6.5 + Math.sin(a) * 3.9).toFixed(1);
        const x2 = (6.5 + Math.cos(a) * 5.3).toFixed(1);
        const y2 = (6.5 + Math.sin(a) * 5.3).toFixed(1);
        return <path key={i} d={`M${x1} ${y1} L${x2} ${y2}`} />;
      })}
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true">
      <path d="M10.5 8.2 A5 5 0 1 1 4.8 2.5 A4 4 0 0 0 10.5 8.2 Z" />
    </svg>
  );
}

function IconSystem() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="4.4" />
      <path d="M6.5 2.1 A4.4 4.4 0 0 1 6.5 10.9 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ---- Section heading ----

function SectionHead({ num, label }: { num: string; label: string }) {
  return (
    <div className="section-head">
      <span className="section-head__num">{num}</span>
      <span className="section-head__label">{label}</span>
      <span className="section-head__rule" />
    </div>
  );
}

// ---- Main component ----

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [activity, setActivity] = useState<FitActivity | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [zoom, setZoom] = useState<{ start: number; end: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [exportName, setExportName] = useState('');
  const [theme, setTheme] = useState<ThemeSetting>(() => {
    try {
      const stored = localStorage.getItem('butterlaps-theme');
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch { /* ignore */ }
    return 'light';
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resolved = resolveTheme(theme);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  useEffect(() => {
    try { localStorage.setItem('butterlaps-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { document.documentElement.dataset.theme = resolveTheme('system'); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  useEffect(() => {
    if (!file) { setExportName(''); return; }
    const proposed = getExportFileName(file.name);
    const dot = proposed.lastIndexOf('.');
    setExportName(dot > 0 ? proposed.slice(0, dot) : proposed);
  }, [file]);

  const openFilePicker = () => fileInputRef.current?.click();

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) await loadFile(droppedFile);
  };

  const loadFile = async (selectedFile: File) => {
    setError(null);
    setIsLoading(true);
    try {
      if (!selectedFile.name.toLowerCase().endsWith('.fit')) {
        throw new Error('Only .fit files are supported.');
      }
      const parsedActivity = await parseFitFile(selectedFile);
      setFile(selectedFile);
      setActivity(parsedActivity);
      setMarkers(parsedActivity.markers);
      setZoom(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setFile(null);
      setActivity(null);
      setMarkers([]);
      setZoom(null);
      setError(err instanceof Error ? err.message : 'Unable to read the uploaded file.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) await loadFile(selectedFile);
  };

  const handleClear = () => {
    setFile(null);
    setActivity(null);
    setMarkers([]);
    setZoom(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeLap = (markerIndex: number) => {
    setMarkers((prev) => prev.filter((_, i) => i !== markerIndex));
  };

  const addMarker = (timeOffsetSeconds: number) => {
    if (!activity) return;
    const snapped = snapToNearestTimestamp(timeOffsetSeconds, activity.recordTimestamps);
    setMarkers((prev) => {
      if (prev.some((m) => m.timeOffsetSeconds === snapped)) return prev;
      return [...prev, { timeOffsetSeconds: snapped, label: 'Lap' }].sort((a, b) => a.timeOffsetSeconds - b.timeOffsetSeconds);
    });
  };

  const moveMarker = (originalTime: number, newTime: number) => {
    if (!activity) return;
    const snapped = snapToNearestTimestamp(newTime, activity.recordTimestamps);
    setMarkers((prev) => {
      if (prev.some((m) => m.timeOffsetSeconds === snapped && m.timeOffsetSeconds !== originalTime)) return prev;
      return prev.map((m) => m.timeOffsetSeconds === originalTime ? { ...m, timeOffsetSeconds: snapped } : m)
        .sort((a, b) => a.timeOffsetSeconds - b.timeOffsetSeconds);
    });
  };

  const mergeMarker = (draggedTime: number) => {
    setMarkers((prev) => prev.filter((m) => m.timeOffsetSeconds !== draggedTime));
  };

  const resetMarkers = () => {
    if (activity) setMarkers(activity.markers);
  };

  const handleExport = () => {
    if (!file || !activity) return;
    let payload: ArrayBuffer;
    try {
      payload = rewriteLaps(activity, markers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
      return;
    }
    const blob = new Blob([payload], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = (exportName.trim() || getExportFileName(file.name).replace(/\.[^.]+$/, '')) + '.fit';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  // ---- Derived state ----

  const lapRows = activity ? buildLapRows(activity, markers) : [];
  const summaryRow = activity ? getSummaryRow(activity, markers) : null;
  const originalLapCount = activity ? getLapIntervals(activity.markers).length : 0;
  const { removedBoundaries, addedBoundaries } = activity ? (() => {
    const originalStarts = new Set(getLapIntervals(activity.markers).slice(1).map((iv) => iv.startOffsetSeconds));
    const currentStarts = new Set(getLapIntervals(markers).slice(1).map((iv) => iv.startOffsetSeconds));
    return {
      removedBoundaries: [...originalStarts].filter((t) => !currentStarts.has(t)),
      addedBoundaries: [...currentStarts].filter((t) => !originalStarts.has(t)),
    };
  })() : { removedBoundaries: [] as number[], addedBoundaries: [] as number[] };

  const hasChanges = removedBoundaries.length > 0 || addedBoundaries.length > 0;

  // Activity-level metrics for the inline metric line
  const activityMetrics = activity ? (() => {
    const dist = activity.summary.distanceMeters;
    const dur = activity.summary.durationSeconds;
    const pace = dist > 0 ? (dur / dist) * 1000 : null;

    const avg = (name: string) => {
      const s = activity.series.find((ser) => ser.name === name);
      if (!s || !s.values.length) return null;
      return s.values.reduce((sum, v) => sum + v.value, 0) / s.values.length;
    };

    return {
      dist: dist >= 1000 ? `${(dist / 1000).toFixed(2)}` : `${Math.round(dist)}`,
      distUnit: dist >= 1000 ? 'km' : 'm',
      time: formatDuration(dur),
      pace: pace != null ? formatPace(pace) : null,
      power: avg('Power'),
      hr: avg('Heart Rate'),
      cad: avg('Cadence'),
    };
  })() : null;

  const sport = activity?.summary.activityType
    ? activity.summary.activityType.charAt(0).toUpperCase() + activity.summary.activityType.slice(1)
    : null;

const tableSeries = activity ? getTableSeries(activity) : [];

  return (
    <div data-theme={resolved}>

      {/* Status bar */}
      <div className="status-bar">
        <span className="status-bar__brand">
          <span className="brand-mark">◐</span>
          BUTTERLAPS
        </span>
        <span className="status-bar__cell">VER. {version}</span>
        <span className="status-bar__spacer" />
        <button
          type="button"
          className={`theme-toggle${theme === 'system' ? ' theme-toggle--system' : ''}`}
          onClick={() => setTheme(THEME_CYCLE[theme])}
          title={`Theme: ${theme}. Click to switch.`}
        >
          {theme === 'light' ? <IconSun /> : theme === 'dark' ? <IconMoon /> : <IconSystem />}
        </button>
      </div>

      <div className="page">

        {/* Header */}
        <header className="head">
          <h1 className="head-title">
            Butter-smooth lap fixes
          </h1>
          <p className="head-lede">
            Fix accidental splits and missed lap presses without collateral damage to your FIT file
          </p>
        </header>

        {/* Card */}
        <section className="card">

          {/* 01 — Upload */}
          <div className="section">
            <SectionHead num="01" label="Upload" />

            <div
              className={`upload-frame${isDragOver ? ' upload-frame--drag-over' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".fit"
                onChange={handleFileChange}
                className="file-input"
              />
              <button type="button" className="upload-btn" onClick={openFilePicker}>
                <IconUpload />
                Load .FIT file
              </button>
              <span className="upload-hint">or drag and drop a .fit file here</span>
              <span className="upload-spec">
                ACCEPT<span className="upload-spec__sep">·</span>*.fit
                <span className="upload-spec__sep">·</span>MAX 50 MB
                <span className="upload-spec__sep">·</span>CLIENT-ONLY
              </span>
            </div>

            {error && <div className="alert">{error}</div>}
            {isLoading && <div className="alert">Loading…</div>}

            {file && activity && (
              <div className="loaded">
                <div className="loaded__file">
                  <span className="loaded__icon">▤</span>
                  <span className="loaded__name">{file.name}</span>
                  <span className="loaded__spacer" />
                  <button type="button" className="btn-danger" onClick={handleClear}>
                    Clear
                  </button>
                </div>
                <div className="loaded__meta">
                  <span>{formatFileSize(file.size)}</span>
                  {activity.summary.startTime != null && (
                    <>
                      <span className="loaded__sep">·</span>
                      <span>{formatActivityDate(activity.summary.startTime)}</span>
                    </>
                  )}
                  {sport && (
                    <>
                      <span className="loaded__sep">·</span>
                      <span className="loaded__sport">
                        <span className="loaded__k">Sport</span>
                        {sport}
                      </span>
                    </>
                  )}
                  <span className="loaded__sep">·</span>
                  <span>{activity.series.length} series</span>
                </div>

                {activityMetrics && (
                  <div className="metric-line">
                    <span className="metric">
                      <span className="m-k">Dist</span>
                      <span className="m-v">{activityMetrics.dist}</span>
                      <span className="m-u">{activityMetrics.distUnit}</span>
                    </span>
                    <span className="metric-sep">·</span>
                    <span className="metric">
                      <span className="m-k">Time</span>
                      <span className="m-v">{activityMetrics.time}</span>
                    </span>
                    {activityMetrics.pace != null && (
                      <>
                        <span className="metric-sep">·</span>
                        <span className="metric metric--pace">
                          <span className="m-k">Pace</span>
                          <span className="m-v">{activityMetrics.pace}</span>
                          <span className="m-u">/km</span>
                        </span>
                      </>
                    )}
                    {activityMetrics.power != null && (
                      <>
                        <span className="metric-sep">·</span>
                        <span className="metric metric--power">
                          <span className="m-k">Pwr</span>
                          <span className="m-v">{Math.round(activityMetrics.power)}</span>
                          <span className="m-u">W</span>
                        </span>
                      </>
                    )}
                    {activityMetrics.hr != null && (
                      <>
                        <span className="metric-sep">·</span>
                        <span className="metric metric--hr">
                          <span className="m-k">HR</span>
                          <span className="m-v">{Math.round(activityMetrics.hr)}</span>
                          <span className="m-u">bpm</span>
                        </span>
                      </>
                    )}
                    {activityMetrics.cad != null && (
                      <>
                        <span className="metric-sep">·</span>
                        <span className="metric metric--cad">
                          <span className="m-k">Cad</span>
                          <span className="m-v">{Math.round(activityMetrics.cad)}</span>
                          <span className="m-u">{activity.summary.activityType === 'running' ? 'spm' : 'rpm'}</span>
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Workspace: 02 chart (left) / laps (right, bleeds into 03+04) / 03 review / 04 download */}
          {activity && (
            <div className="workspace">

              {/* Left col row 1 — 02 Edit */}
              <div className="workspace__chart-area">
                <SectionHead num="02" label="Edit" />
                <ChartPanel
                  activity={activity}
                  markers={markers}
                  zoom={zoom}
                  onZoom={(start, end) => setZoom({ start, end })}
                  onZoomReset={() => setZoom(null)}
                  onAddMarker={addMarker}
                  onMoveMarker={moveMarker}
                  onMergeMarker={mergeMarker}
                />
              </div>

              {/* Right col — laps (spans rows 1–3 in wide mode) */}
              <div className="workspace__laps">
                <div className="table-head">
                  <div className="table-head__title">
                    <h2>Laps</h2>
                    <span className="table-head__count">{lapRows.length}</span>
                  </div>
                  <button type="button" className="btn-danger" onClick={resetMarkers}>
                    Reset
                  </button>
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
                          onClick={() => setZoom({ start: row.startOffsetSeconds, end: row.startOffsetSeconds + row.durationSeconds })}
                        >
                          <td>
                            <span className="lap-num-text">L{String(row.lapNumber).padStart(2, '0')}</span>
                            {index < lapRows.length - 1 && (
                              <button
                                type="button"
                                className="lap-merge-btn"
                                title="Merge with next lap"
                                aria-label={`Merge lap ${row.lapNumber} with lap ${lapRows[index + 1].lapNumber}`}
                                onClick={(e) => { e.stopPropagation(); removeLap(lapRows[index + 1].markerIndex); }}
                              >
                                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                                  <path d="M1.5 1.5 L7.5 7.5" />
                                  <path d="M7.5 1.5 L1.5 7.5" />
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
                        <tr onClick={() => setZoom(null)}>
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
              </div>

              {/* Left col row 2 — 03 Review */}
              <div className="workspace__review">
                <SectionHead num="03" label="Review" />
                {hasChanges ? (
                  <div className="review">
                    <div className="review__delta">
                      {removedBoundaries.length > 0 && (
                        <span className="delta delta--rm">
                          <span className="delta-sign">−</span>
                          {removedBoundaries.length}
                        </span>
                      )}
                      {addedBoundaries.length > 0 && (
                        <span className="delta delta--add">
                          <span className="delta-sign">+</span>
                          {addedBoundaries.length}
                        </span>
                      )}
                      <span className="delta__count">
                        <span>{originalLapCount}</span>
                        <span className="arrow">→</span>
                        <span className="after">{lapRows.length}</span>
                        <span className="lbl">laps</span>
                      </span>
                    </div>
                    <div className="review__lines">
                      {removedBoundaries.length > 0 && (
                        <div className="boundary-line">
                          <span className="tag rm">−</span>
                          <span className="boundary-label">Removed @</span>
                          <span className="boundary-times">
                            {removedBoundaries.map((t) => (
                              <span key={t} className="boundary-time">
                                <code>{formatDuration(t)}</code>
                              </span>
                            ))}
                          </span>
                        </div>
                      )}
                      {addedBoundaries.length > 0 && (
                        <div className="boundary-line">
                          <span className="tag add">+</span>
                          <span className="boundary-label">Added @</span>
                          <span className="boundary-times">
                            {addedBoundaries.sort((a, b) => a - b).map((t) => (
                              <span key={t} className="boundary-time">
                                <code>{formatDuration(t)}</code>
                              </span>
                            ))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="review__no-changes">No changes — lap boundaries match the original file</p>
                )}
              </div>

              {/* Left col row 3 — 04 Download */}
              <div className="workspace__download">
                <SectionHead num="04" label="Download" />
                <div className="download">
                  <button
                    type="button"
                    className="export-btn"
                    onClick={handleExport}
                    disabled={!hasChanges}
                  >
                    <IconDownload />
                    Export edited FIT
                  </button>
                  {hasChanges && (
                    <div className="filename-preview">
                      <span className="k">OUTPUT:</span>
                      <input
                        className="filename-input"
                        type="text"
                        value={exportName}
                        onChange={(e) => setExportName(e.target.value)}
                        spellCheck={false}
                        size={Math.max(10, exportName.length)}
                      />
                      <span className="filename-ext">.fit</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

        </section>
      </div>
    </div>
  );
}

export default App;
