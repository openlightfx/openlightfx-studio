export const RULER_H = 28;
export const ROW_H = 40;
export const HANDLE_PX = 8;
export const DIAMOND_R = 7;
export const SNAP_PX = 8;
export const MAX_PX_PER_MS = 6;

export interface View {
  viewStartMs: number;
  pixelsPerMs: number;
  widthPx: number;
  heightPx: number;
  scrollY: number;
  durationMs: number;
}

export function timeToX(view: View, ms: number): number {
  return (ms - view.viewStartMs) * view.pixelsPerMs;
}

export function xToTime(view: View, x: number): number {
  return view.viewStartMs + x / view.pixelsPerMs;
}

export function rowIndexAt(view: View, y: number): number {
  if (y < RULER_H) return -1;
  return Math.floor((y - RULER_H + view.scrollY) / ROW_H);
}

export function rowTop(view: View, index: number): number {
  return RULER_H + index * ROW_H - view.scrollY;
}

export function visibleRowRange(view: View, channelCount: number): { start: number; end: number } {
  const start = Math.max(0, Math.floor(view.scrollY / ROW_H));
  const end = Math.min(
    channelCount,
    Math.ceil((view.scrollY + Math.max(0, view.heightPx - RULER_H)) / ROW_H)
  );
  return { start, end };
}

export function minPixelsPerMs(viewWidth: number, durationMs: number): number {
  const dur = Math.max(durationMs, 1000);
  const width = Math.max(viewWidth, 1);
  return width / dur;
}

export function clampViewStart(view: View): number {
  const visible = view.widthPx / Math.max(view.pixelsPerMs, 1e-9);
  const maxStart = Math.max(0, view.durationMs - visible);
  return Math.min(maxStart, Math.max(0, view.viewStartMs));
}

/** Zoom while keeping the time under cursorX fixed. */
export function zoomAround(
  view: View,
  cursorX: number,
  factor: number
): { viewStartMs: number; pixelsPerMs: number } {
  const minPpm = minPixelsPerMs(view.widthPx, view.durationMs);
  const cursorMs = xToTime(view, cursorX);
  const next = Math.min(MAX_PX_PER_MS, Math.max(minPpm, view.pixelsPerMs * factor));
  let viewStartMs = cursorMs - cursorX / next;
  const visible = view.widthPx / next;
  const maxStart = Math.max(0, view.durationMs - visible);
  if (viewStartMs < 0) viewStartMs = 0;
  if (viewStartMs > maxStart) viewStartMs = maxStart;
  return { viewStartMs, pixelsPerMs: next };
}

/** Positive dx moves the view later in time. */
export function panBy(view: View, dxPx: number): number {
  const next = {
    ...view,
    viewStartMs: view.viewStartMs + dxPx / Math.max(view.pixelsPerMs, 1e-9)
  };
  return clampViewStart(next);
}

export function fitAll(viewWidth: number, durationMs: number): { viewStartMs: number; pixelsPerMs: number } {
  return { viewStartMs: 0, pixelsPerMs: minPixelsPerMs(viewWidth, durationMs) };
}

export function chooseTickStep(pixelsPerMs: number): number {
  const candidates = [
    1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000,
    120_000, 300_000, 600_000, 1_800_000
  ];
  for (const step of candidates) {
    if (step * pixelsPerMs >= 72) return step;
  }
  return candidates[candidates.length - 1];
}

export function contentHeight(channelCount: number): number {
  return RULER_H + channelCount * ROW_H;
}
