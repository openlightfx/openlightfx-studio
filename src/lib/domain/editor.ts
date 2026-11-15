import type { Keyframe, Sample } from './types';

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
