import type { Keyframe, EffectKeyframe } from '$lib/types/track.js';
import type { SceneMarker } from '$lib/types/timeline.js';

export type SnapTargetType = 'keyframe' | 'effect' | 'second' | 'half-second' | 'frame' | 'scene-marker';

export interface SnapTarget {
  timestampMs: number;
  type: SnapTargetType;
}

export function computeSnapTargets(
  keyframes: Keyframe[],
  effects: EffectKeyframe[],
  markers: SceneMarker[],
  durationMs: number,
  framerate: number,
): SnapTarget[] {
  const targets: SnapTarget[] = [];
  const seen = new Set<number>();

  function add(ms: number, type: SnapTargetType) {
    const key = Math.round(ms * 100) / 100;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push({ timestampMs: key, type });
    }
  }

  for (const kf of keyframes) add(kf.timestampMs, 'keyframe');

  for (const ef of effects) {
    add(ef.timestampMs, 'effect');
    add(ef.timestampMs + ef.durationMs, 'effect');
  }

  for (const m of markers) add(m.timestampMs, 'scene-marker');

  for (let ms = 0; ms <= durationMs; ms += 1000) add(ms, 'second');

  for (let ms = 500; ms <= durationMs; ms += 1000) add(ms, 'half-second');

  if (framerate > 0) {
    const frameDurationMs = 1000 / framerate;
    const maxMs = Math.min(durationMs, 60000);
    for (let ms = frameDurationMs; ms <= maxMs; ms += frameDurationMs) {
      add(ms, 'frame');
    }
  }

  return targets.sort((a, b) => a.timestampMs - b.timestampMs);
}

export function findSnapPoint(
  timestampMs: number,
  targets: SnapTarget[],
  snapDistancePx: number,
  pxPerMs: number,
): SnapTarget | null {
  const thresholdMs = snapDistancePx / pxPerMs;
  let best: SnapTarget | null = null;
  let bestDist = Infinity;

  let lo = 0;
  let hi = targets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (targets[mid].timestampMs < timestampMs - thresholdMs) lo = mid + 1;
    else if (targets[mid].timestampMs > timestampMs + thresholdMs) hi = mid - 1;
    else {
      for (let i = Math.max(0, mid - 5); i < Math.min(targets.length, mid + 6); i++) {
        const dist = Math.abs(targets[i].timestampMs - timestampMs);
        if (dist <= thresholdMs && dist < bestDist) {
          bestDist = dist;
          best = targets[i];
        }
      }
      break;
    }
  }

  return best;
}
