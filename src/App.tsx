import { useRef, useState, useEffect, type ChangeEvent } from 'react';
import { version } from '../package.json';
import { parseFitFile, snapToNearestTimestamp } from './fit/fitParser';
import { rewriteLaps, validateFitForEditing } from './fit/fitWriter';
import { ChartPanel } from './components/ChartPanel';
import { LapTable, getLapIntervals } from './components/LapTable';
import { formatDuration, formatPace, formatFileSize, formatActivityDate } from './format';
import type { FitActivity, Marker } from './types';

function withFitCode(msg: string) {
  const parts = msg.split('.fit');
  return parts.map((part, i) => (
    <span key={i}>{part}{i < parts.length - 1 && <code>.fit</code>}</span>
  ));
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

const SERIES_SHORT: Record<string, string> = {
  Elevation: 'Elev',
  'Heart Rate': 'HR',
  Distance: 'Dist',
  Power: 'Pwr',
  Cadence: 'Cad',
  Pace: 'Pace',
  Speed: 'Spd',
};

// ---- Theme ----

type ThemeSetting = 'light' | 'dark' | 'system';

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
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  useEffect(() => {
    try { localStorage.setItem('butterlaps-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    if (!file) { setExportName(''); return; }
    const proposed = getExportFileName(file.name);
    const dot = proposed.lastIndexOf('.');
    setExportName(dot > 0 ? proposed.slice(0, dot) : proposed);
  }, [file]);

  const openFilePicker = () => fileInputRef.current?.click();

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) await loadFile(droppedFile);
  };

  // TESTING ONLY — remove before release
  useEffect(() => {
    const signalCopy = (e: DragEvent) => {
      e.preventDefault();
      if (!e.dataTransfer) return;
      const allowed = e.dataTransfer.effectAllowed;
      // Only signal 'copy' if the drag source permits it; otherwise honour 'move'
      // so Finder doesn't get conflicting signals and visually removes the item.
      e.dataTransfer.dropEffect =
        allowed === 'all' || allowed === 'copy' || allowed === 'copyMove' || allowed === 'copyLink'
          ? 'copy'
          : 'move';
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer?.files[0];
      if (droppedFile) loadFile(droppedFile);
    };
    window.addEventListener('dragenter', signalCopy);
    window.addEventListener('dragover', signalCopy);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', signalCopy);
      window.removeEventListener('dragover', signalCopy);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const loadFile = async (selectedFile: File) => {
    setError(null);
    setIsLoading(true);
    try {
      if (!selectedFile.name.toLowerCase().endsWith('.fit')) {
        throw new Error('Only .fit files are supported');
      }
      const parsedActivity = await parseFitFile(selectedFile);
      try {
        validateFitForEditing(parsedActivity);
      } catch (err) {
        if (err instanceof Error && err.message.includes('developer fields in lap messages') && parsedActivity.lapDevFields.length > 0) {
          throw new Error(`${err.message}: ${parsedActivity.lapDevFields.join(', ')}`);
        }
        throw err;
      }
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
      setError(err instanceof Error ? err.message : 'Unable to read the uploaded file');
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

  // TESTING ONLY — reloads file instead of just resetting markers; revert before release
  const resetMarkers = () => {
    if (file) loadFile(file);
  };

  const handleExport = () => {
    if (!file || !activity) return;
    let payload: ArrayBuffer;
    try {
      payload = rewriteLaps(activity, markers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
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

  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  const activityMetrics = activity ? (() => {
    const dist = activity.summary.distanceMeters;
    const dur = activity.summary.durationSeconds;
    const isCycling = activity.summary.activityType === 'cycling';
    const pace = !isCycling && dist > 0 ? (dur / dist) * 1000 : null;
    const speed = isCycling && dist > 0 && dur > 0 ? (dist / dur) * 3.6 : null;

    const avg = (name: string) => {
      const s = activity.series.find((ser) => ser.name === name);
      if (!s) return null;
      const nonNull = s.values.filter((v): v is { timeOffsetSeconds: number; value: number } => v.value !== null);
      return nonNull.length ? nonNull.reduce((sum, v) => sum + v.value, 0) / nonNull.length : null;
    };

    return {
      dist: dist >= 1000 ? `${(dist / 1000).toFixed(2)}` : `${Math.round(dist)}`,
      distUnit: dist >= 1000 ? 'km' : 'm',
      time: formatDuration(dur),
      pace: pace != null ? formatPace(pace) : null,
      speed: speed != null ? speed.toFixed(1) : null,
      power: avg('Power'),
      hr: avg('Heart Rate'),
      cad: avg('Cadence'),
    };
  })() : null;

  const sport = activity?.summary.activityType ?? null;
  const subSport = activity?.summary.subSport ?? null;
  const device = activity?.summary.device ?? null;
  const deviceApp = activity?.summary.deviceApp ?? null;

  return (
    <div data-theme={resolved}>

      {/* Status bar */}
      <div className="status-bar">
        <span className="status-bar__brand">
          <span className="brand-mark">◐</span>
          BUTTERLAPS
        </span>
        <span className="status-bar__cell">VER. {version.split('.').slice(0, 3).join('.')}</span>
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
            Fix accidental splits and missed lap presses without collateral damage to your <code>.fit</code> file
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
                Load .fit file
              </button>
              <span className="upload-hint">or drag and drop a .fit file here</span>
              <span className="upload-spec">
                ACCEPT<span className="upload-spec__sep">·</span>*.fit
                <span className="upload-spec__sep">·</span>MAX 50 MB
                <span className="upload-spec__sep">·</span>CLIENT-ONLY
              </span>
            </div>

            {error && <div className="alert">{withFitCode(error)}</div>}
            {isLoading && <div className="alert">Loading…</div>}

            {file && activity && (
              <div className="loaded">
                <div className="loaded__file">
                  <span className="loaded__icon">▤</span>
                  <span className="loaded__name">{file.name}</span>
                  {sport && <><span className="loaded__sep">·</span><span className="loaded__k">{sport}</span></>}
                  {subSport && <><span className="loaded__sep">·</span><span className="loaded__k">{subSport}</span></>}
                  {device && <><span className="loaded__sep">·</span><span className="loaded__k">{device}</span></>}
                  {deviceApp && <><span className="loaded__sep">·</span><span className="loaded__k">{deviceApp}</span></>}
                  <span className="loaded__spacer" />
                  <button type="button" className="btn-danger" onClick={handleClear}>Clear</button>
                </div>
                <div className="loaded__meta">
                  <span>{formatFileSize(file.size)}</span>
                  <span className="loaded__sep">·</span>
                  <span>{activity.recordTimestamps.length.toLocaleString()} pts</span>
                  {activity.summary.startTime != null && (
                    <>
                      <span className="loaded__sep">·</span>
                      <span><span className="loaded__k">Recorded: </span>{formatActivityDate(activity.summary.startTime)}</span>
                    </>
                  )}
                  <span className="loaded__sep">·</span>
                  <span>
                    <span className="loaded__k">Metrics: </span>
                    {activity.series.map((s) => SERIES_SHORT[s.name] ?? s.name).join(' · ')}
                    {activity.unshownSeries.length > 0 && (
                      <> · <span className="unshown-pill">
                        +{activity.unshownSeries.length} not shown
                        <span className="unshown-tooltip">
                          {activity.unshownSeries.map((name) => (
                            <span key={name} className="unshown-tooltip__row">{name}</span>
                          ))}
                        </span>
                      </span></>
                    )}
                  </span>
                </div>
                <div className="loaded__meta">
                  <span><span className="loaded__k">Lap dev fields: </span>{activity.lapDevFields.length > 0 ? activity.lapDevFields.join(', ') : 'none'}</span>
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
                    {activityMetrics.speed != null && (
                      <>
                        <span className="metric-sep">·</span>
                        <span className="metric metric--pace">
                          <span className="m-k">Speed</span>
                          <span className="m-v">{activityMetrics.speed}</span>
                          <span className="m-u">km/h</span>
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
                <SectionHead num="03" label="Laps" />
                <LapTable
                  activity={activity}
                  markers={markers}
                  onMergeLap={removeLap}
                  onSelectLap={(start, end) => setZoom({ start, end })}
                  onClearZoom={() => setZoom(null)}
                  onReset={resetMarkers}
                />
              </div>

              {/* Left col row 2 — 04 Review */}
              <div className="workspace__review">
                <SectionHead num="04" label="Review" />
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
                        <span className="after">{getLapIntervals(markers).length}</span>
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

              {/* Left col row 3 — 05 Download */}
              <div className="workspace__download">
                <SectionHead num="05" label="Download" />
                <div className="download">
                  <button
                    type="button"
                    className="export-btn"
                    onClick={handleExport}
                    disabled={!hasChanges}
                  >
                    <IconDownload />
                    Export edited .fit
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
