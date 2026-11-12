export interface SnapTarget {
  timeMs: number;
  kind: 'playhead' | 'keyframe' | 'effect' | 'marker';
}

export interface SnapResult {
  timeMs: number;
  guide: SnapTarget | null;
}

/** Snap timeMs to the nearest target within thresholdMs. Equal distances prefer playhead. */
export function snapTime(
  timeMs: number,
  targets: readonly SnapTarget[],
  thresholdMs: number,
  enabled: boolean
): SnapResult {
  if (!enabled || thresholdMs <= 0 || targets.length === 0) return { timeMs, guide: null };
  let best: SnapTarget | null = null;
  let bestDist = thresholdMs;
  for (const target of targets) {
    const dist = Math.abs(target.timeMs - timeMs);
    if (dist < bestDist || (dist === bestDist && best && target.kind === 'playhead')) {
      best = target;
      bestDist = dist;
    }
  }
  if (!best || bestDist > thresholdMs) return { timeMs, guide: null };
  return { timeMs: best.timeMs, guide: best };
}
