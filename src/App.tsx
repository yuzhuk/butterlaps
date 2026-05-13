import { useRef, useState, type ChangeEvent } from 'react';
import { version } from '../package.json';

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [hours, minutes, secs]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
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

function getExportFileName(originalName: string): string {
  const lastDotIndex = originalName.lastIndexOf('.');
  if (lastDotIndex <= 0) {
    return `${originalName}-betterlaps`;
  }

  const baseName = originalName.slice(0, lastDotIndex);
  const extension = originalName.slice(lastDotIndex);
  return `${baseName}-betterlaps${extension}`;
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

      setFile(selectedFile);
    } catch (err) {
      setFile(null);
      setError(err instanceof Error ? err.message : 'Unable to read the uploaded file.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!file) {
      return;
    }

    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = getExportFileName(file.name);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

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

      <div className="grid-layout">
        <section className="panel">
          <div className="upload-box">
            <div>
              <p>Choose a FIT file to begin editing.</p>
              <p>Desktop-first experience with interactive lap marker editing.</p>
            </div>
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

          {file ? (
            <div className="activity-section">
              <div className="metric-row">
                <dl className="metric-card">
                  <dt>File name</dt>
                  <dd>{file.name}</dd>
                </dl>
                <dl className="metric-card">
                  <dt>File size</dt>
                  <dd>{formatFileSize(file.size)}</dd>
                </dl>
              </div>

              <div className="chart-placeholder">
                <div>
                  <strong>File loaded</strong>
                  <p>This is a placeholder for future FIT parsing and metadata display.</p>
                </div>
              </div>

              <div className="file-actions">
                <button type="button" onClick={handleExport}>Export same FIT file</button>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="panel">
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
        </aside>
      </div>
      <div className="version">v{version}</div>
    </div>
  );
}

export default App;
