import type { Keyframe, RGBColor } from '$lib/types/index.js';
import { interpolateColor } from './color-utils.js';

export interface ChannelState {
  color: RGBColor;
  brightness: number;
  powerOn: boolean;
}

/**
 * Get the interpolated channel state at a given timestamp.
 * Keyframes must all be for the same channel, sorted by timestampMs ascending.
 */
export function getChannelStateAtTime(keyframes: Keyframe[], timeMs: number): ChannelState | null {
  if (keyframes.length === 0) return null;

  const sorted = [...keyframes].sort((a, b) => a.timestampMs - b.timestampMs);

  // Before first keyframe
  if (timeMs < sorted[0].timestampMs) return null;

  // Find surrounding keyframes
  let prevIdx = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].timestampMs <= timeMs) prevIdx = i;
    else break;
  }

  const prev = sorted[prevIdx];
  const next = sorted[prevIdx + 1];

  // At or past last keyframe — hold the last value
  if (!next || timeMs >= next.timestampMs) {
    // If we're exactly at `next`, use next's value
    if (next && timeMs >= next.timestampMs) {
      return keyframeToState(next);
    }
    return keyframeToState(prev);
  }

  // Between prev and next
  if (next.interpolation === 'STEP') {
    return keyframeToState(prev);
  }

  // LINEAR interpolation
  const duration = next.timestampMs - prev.timestampMs;
  const elapsed = timeMs - prev.timestampMs;
  const t = duration > 0 ? elapsed / duration : 0;

  return {
    color: interpolateColor(prev.color, next.color, t),
    brightness: Math.round(prev.brightness + (next.brightness - prev.brightness) * t),
    powerOn: t < 0.5 ? prev.powerOn : next.powerOn,
  };
}

function keyframeToState(kf: Keyframe): ChannelState {
  return {
    color: { ...kf.color },
    brightness: kf.brightness,
    powerOn: kf.powerOn,
  };
}

/**
 * Get keyframes for a specific channel, sorted by timestamp.
 */
export function getKeyframesForChannel(keyframes: Keyframe[], channelId: string): Keyframe[] {
  return keyframes.filter((kf) => kf.channelId === channelId).sort((a, b) => a.timestampMs - b.timestampMs);
}
