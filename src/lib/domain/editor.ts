import type { Keyframe, Sample } from './types';
import { keyframeToSample } from './sample';

export interface LanePaintPoint {
  id: string;
  time: number;
  transition: number;
  interpolation: string;
  color: Sample;
}

/** Immutable scalar cache: authoring invalidates this, panning/zooming does not. */
export function projectLanePoints(frames: readonly Keyframe[]): LanePaintPoint[] {
  return frames.map((frame) => ({
    id: frame.id,
    time: frame.timestampMs,
    transition: frame.transitionMs,
    interpolation: frame.interpolation,
    color: keyframeToSample(frame),
  }));
}

export function lowerBoundLanePoints(points: readonly LanePaintPoint[], time: number): number {
  let lo = 0,
    hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function hitLanePoint(
  points: readonly LanePaintPoint[],
  x: number,
  scale: number,
  scroll: number,
  radius = 9
): string {
  if (!(scale > 0) || !Number.isFinite(x)) return '';
  const time = (x + scroll) / scale,
    index = lowerBoundLanePoints(points, time);
  const nearest = [points[index - 1], points[index]]
    .filter(Boolean)
    .toSorted((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0];
  return nearest && Math.abs(nearest.time * scale - scroll - x) <= radius ? nearest.id : '';
}

/** Pointer moves retain a keyframe's order on its lane, including when spacing is disabled. */
export function dragKeepsOrder(
  current: Keyframe,
  others: Keyframe[],
  targetMs: number,
  spacingMs: number
): boolean {
  const spacing = Math.max(1, spacingMs);
  return others.every((other) =>
    other.timestampMs < current.timestampMs
      ? targetMs >= other.timestampMs + spacing
      : targetMs <= other.timestampMs - spacing
  );
}

/** Convert a displayed image coordinate to an original, unscaled source pixel. */
export function sourcePixel(
  x: number,
  y: number,
  displayWidth: number,
  displayHeight: number,
  sourceWidth: number,
  sourceHeight: number
) {
  return {
    x: Math.min(sourceWidth - 1, Math.max(0, Math.floor((x * sourceWidth) / displayWidth))),
    y: Math.min(sourceHeight - 1, Math.max(0, Math.floor((y * sourceHeight) / displayHeight))),
  };
}

export function displayedRgb(sample: Pick<Sample, 'r' | 'g' | 'b' | 'brightness'>): string {
  return [sample.r, sample.g, sample.b]
    .map((value) => Math.round((value * sample.brightness) / 100))
    .join(',');
}

export const MIN_TIMELINE_SCALE = 0.0001;
export const MAX_TIMELINE_SCALE = 2;
/** Cap the physical timeline width so long movies remain scrollable in browser engines. */
export const MAX_TIMELINE_CONTENT_WIDTH = 10_000_000;

export function boundedTimelineScale(
  scale: number,
  durationMs?: number,
  viewportWidth?: number
): number {
  let minimum = MIN_TIMELINE_SCALE;
  let maximum = MAX_TIMELINE_SCALE;
  if (
    Number.isFinite(durationMs) &&
    durationMs! > 0 &&
    Number.isFinite(viewportWidth) &&
    viewportWidth! > 0
  ) {
    minimum = Math.min(minimum, viewportWidth! / durationMs!);
    maximum = Math.min(maximum, MAX_TIMELINE_CONTENT_WIDTH / durationMs!);
    maximum = Math.max(minimum, maximum);
  }
  return Number.isFinite(scale) ? Math.max(minimum, Math.min(maximum, scale)) : minimum;
}

/** Keep the content-time under a viewport coordinate fixed, subject to scroll bounds. */
export function anchoredScrollAt(
  oldScale: number,
  newScale: number,
  oldScroll: number,
  durationMs: number,
  viewportWidth: number,
  anchorX: number
): number {
  const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const width = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  const old = boundedTimelineScale(oldScale, duration, width);
  const next = boundedTimelineScale(newScale, duration, width);
  const scroll = Number.isFinite(oldScroll) ? Math.max(0, oldScroll) : 0;
  const x = Number.isFinite(anchorX) ? anchorX : width / 2;
  const contentTime = (scroll + x) / old;
  return Math.max(0, Math.min(Math.max(0, duration * next - width), contentTime * next - x));
}

export function anchoredScroll(
  playheadMs: number,
  oldScale: number,
  newScale: number,
  oldScroll: number,
  durationMs: number,
  viewportWidth: number
): number {
  const old = boundedTimelineScale(oldScale, durationMs, viewportWidth);
  const playheadX = Number.isFinite(playheadMs) ? playheadMs * old - oldScroll : NaN;
  const visible = playheadX >= 0 && playheadX <= viewportWidth;
  return anchoredScrollAt(
    old,
    newScale,
    oldScroll,
    durationMs,
    viewportWidth,
    visible ? playheadX : viewportWidth / 2
  );
}
