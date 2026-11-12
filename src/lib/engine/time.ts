export const DEFAULT_FPS = 24;

export function frameDurationMs(fps: number): number {
  return 1000 / Math.max(1, fps);
}

export function formatTimecode(ms: number, fps = DEFAULT_FPS): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const frame = Math.min(fps - 1, Math.floor((clamped % 1000) / frameDurationMs(fps)));
  const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');
  return `${h}:${pad(m)}:${pad(s)}:${pad(frame)}`;
}

export function formatRuler(ms: number, stepMs: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (stepMs < 1000) {
    const frac = Math.floor(clamped % 1000);
    return `${h > 0 ? `${h}:` : ''}${pad(m)}:${pad(s)}.${String(frac).padStart(3, '0')}`;
  }
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
