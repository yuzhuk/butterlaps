export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

export function formatPace(secondsPerKm: number): string {
  const t = Math.round(secondsPerKm);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const WEEKDAY_2 = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function formatActivityDate(ms: number): string {
  const d = new Date(ms);
  const rest = d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  return `${WEEKDAY_2[d.getDay()]} ${rest}`;
}
