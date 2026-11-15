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

export function anchoredScroll(
  playheadMs: number,
  oldScale: number,
  newScale: number,
  oldScroll: number,
  durationMs: number,
  viewportWidth: number
): number {
  const anchor = playheadMs * oldScale - oldScroll;
  return Math.max(
    0,
    Math.min(durationMs * newScale - viewportWidth, playheadMs * newScale - anchor)
  );
}
