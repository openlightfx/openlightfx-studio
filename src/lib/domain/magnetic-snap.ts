export type SnapTargetKind = 'playhead' | 'boundary' | 'marker' | 'keyframe' | 'tick';
export interface SnapTarget {
  timeMs: number;
  kind: SnapTargetKind;
  label: string;
}
const priority: Record<SnapTargetKind, number> = {
  playhead: 0,
  boundary: 1,
  marker: 1,
  keyframe: 2,
  tick: 3,
};

/** Pixel-space magnet, independent of frame quantization and minimum cue spacing. */
export function magneticSnap(
  timeMs: number,
  pxPerMs: number,
  targets: readonly SnapTarget[],
  accepts: (timeMs: number) => boolean = () => true
): SnapTarget | null {
  if (!Number.isFinite(timeMs) || !Number.isFinite(pxPerMs) || pxPerMs <= 0) return null;
  const nearby = targets.filter(
    (target) => Number.isFinite(target.timeMs) && Math.abs(target.timeMs - timeMs) * pxPerMs <= 8
  );
  nearby.sort(
    (a, b) =>
      Math.abs(a.timeMs - timeMs) - Math.abs(b.timeMs - timeMs) ||
      priority[a.kind] - priority[b.kind] ||
      a.timeMs - b.timeMs ||
      a.label.localeCompare(b.label)
  );
  return nearby.find((target) => accepts(target.timeMs)) ?? null;
}
