// ============================================================
// Interpolation Service — compute keyframe values at arbitrary timestamps
// ============================================================

import type { RGBColor, Keyframe, ColorMode } from '$lib/types/index.js';
import { interpolateColor } from './color-utils.js';

export interface InterpolatedState {
  color: RGBColor;
  brightness: number;
  powerOn: boolean;
  colorMode: ColorMode;
}

/**
 * Compute the interpolated color/brightness/power state at a given timestamp
 * for a specific channel. Keyframes are sorted by timestamp before interpolation.
 *
 * Returns null if there are no keyframes for the channel.
 */
export function interpolateAtTime(
  channelId: string,
  timestampMs: number,
  keyframes: Keyframe[]
): InterpolatedState | null {
  const channelKfs = keyframes
    .filter((kf) => kf.channelId === channelId)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  if (channelKfs.length === 0) {
    return null;
  }

  // Before first keyframe — use first keyframe's state
  if (timestampMs <= channelKfs[0].timestampMs) {
    return keyframeToState(channelKfs[0]);
  }

  // After last keyframe — use last keyframe's state
  const last = channelKfs[channelKfs.length - 1];
  if (timestampMs >= last.timestampMs) {
    return keyframeToState(last);
  }

  // Find the two surrounding keyframes
  let prevIdx = 0;
  for (let i = 1; i < channelKfs.length; i++) {
    if (channelKfs[i].timestampMs > timestampMs) {
      prevIdx = i - 1;
      break;
    }
    // Exact match — return that keyframe's state
    if (channelKfs[i].timestampMs === timestampMs) {
      return keyframeToState(channelKfs[i]);
    }
  }

  const prev = channelKfs[prevIdx];
  const next = channelKfs[prevIdx + 1];

  // The interpolation mode on the NEXT keyframe determines the transition TO it
  if (next.interpolation === 'STEP') {
    return keyframeToState(prev);
  }

  // LINEAR interpolation
  const duration = next.timestampMs - prev.timestampMs;
  if (duration === 0) {
    return keyframeToState(next);
  }

  const t = (timestampMs - prev.timestampMs) / duration;

  return {
    color: interpolateColor(prev.color, next.color, t),
    brightness: Math.round(prev.brightness + (next.brightness - prev.brightness) * t),
    powerOn: t < 0.5 ? prev.powerOn : next.powerOn,
    colorMode: t < 0.5 ? prev.colorMode : next.colorMode,
  };
}

function keyframeToState(kf: Keyframe): InterpolatedState {
  return {
    color: { ...kf.color },
    brightness: kf.brightness,
    powerOn: kf.powerOn,
    colorMode: kf.colorMode,
  };
}
