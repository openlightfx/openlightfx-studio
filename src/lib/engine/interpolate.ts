import type { Channel, ColorMode, Interpolation, Keyframe, RGB } from '$lib/model/types';
import { kelvinToRgb, lerpByte, lerpUint } from '$lib/engine/color';

/**
 * Channel state at a time. Behavior matches
 * OpenLightFX.Emby.Engine.InterpolationEngine so the on-screen preview
 * agrees with plugin playback.
 *
 * STEP holds the previous state until the keyframe timestamp, then snaps.
 * The plugin's ApplyEasing never reaches t=1 inside the window (the
 * timestamp itself short-circuits to the target), so a STEP transition
 * does not snap at the start of the ramp.
 *
 * The blend into the first keyframe starts from black / brightness 0,
 * while the hold *before* that ramp uses the channel defaults.
 */
export interface LightState {
  r: number;
  g: number;
  b: number;
  brightness: number;
  colorTemperature: number;
  colorMode: ColorMode;
  powerOn: boolean;
}

const BLACK: LightState = {
  r: 0,
  g: 0,
  b: 0,
  brightness: 0,
  colorTemperature: 0,
  colorMode: 'RGB',
  powerOn: false
};

export function applyEasing(mode: Interpolation, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (mode === 'STEP') return clamped < 1 ? 0 : 1;
  return clamped;
}

export function keyframeColor(kf: Keyframe): RGB {
  if (kf.colorMode === 'COLOR_TEMPERATURE') return kelvinToRgb(kf.colorTemperature);
  return {
    r: Math.min(255, Math.max(0, kf.color.r)),
    g: Math.min(255, Math.max(0, kf.color.g)),
    b: Math.min(255, Math.max(0, kf.color.b))
  };
}

export function keyframeToState(kf: Keyframe): LightState {
  const color = keyframeColor(kf);
  const temp = kf.colorMode === 'COLOR_TEMPERATURE' ? kf.colorTemperature : 0;
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    brightness: kf.brightness,
    colorTemperature: temp,
    colorMode: kf.colorMode === 'COLOR_TEMPERATURE' ? 'COLOR_TEMPERATURE' : 'RGB',
    powerOn: kf.powerOn
  };
}

function blend(from: LightState, to: LightState, t: number): LightState {
  const bothTemp =
    from.colorMode === 'COLOR_TEMPERATURE' && to.colorMode === 'COLOR_TEMPERATURE';
  if (bothTemp) {
    const kelvin = lerpUint(from.colorTemperature, to.colorTemperature, t);
    const rgb = kelvinToRgb(kelvin);
    return {
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      brightness: lerpUint(from.brightness, to.brightness, t),
      colorTemperature: kelvin,
      colorMode: 'COLOR_TEMPERATURE',
      powerOn: from.powerOn || to.powerOn
    };
  }
  return {
    r: lerpByte(from.r, to.r, t),
    g: lerpByte(from.g, to.g, t),
    b: lerpByte(from.b, to.b, t),
    brightness: lerpUint(from.brightness, to.brightness, t),
    colorTemperature: 0,
    colorMode: 'RGB',
    powerOn: from.powerOn || to.powerOn
  };
}

export function interpolate(
  previous: Keyframe | null,
  next: Keyframe,
  timeMs: number
): LightState {
  const nextState = keyframeToState(next);
  const transitionDuration = next.transitionMs;
  const transitionEnd = next.timestampMs;
  const transitionStart =
    transitionDuration <= transitionEnd ? transitionEnd - transitionDuration : 0;

  if (timeMs >= transitionEnd) return nextState;
  if (transitionDuration === 0) return previous ? keyframeToState(previous) : { ...BLACK };
  if (timeMs <= transitionStart) return previous ? keyframeToState(previous) : { ...BLACK };

  const prevState = previous ? keyframeToState(previous) : { ...BLACK };
  const span = transitionEnd - transitionStart;
  const t = span <= 0 ? 1 : (timeMs - transitionStart) / span;
  return blend(prevState, nextState, applyEasing(next.interpolation, t));
}

/**
 * First keyframe with timestamp > timeMs. Keyframes must be sorted ascending.
 */
export function upperBound(keyframes: readonly Keyframe[], timeMs: number): number {
  let lo = 0;
  let hi = keyframes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid].timestampMs <= timeMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function stateAt(
  keyframes: readonly Keyframe[],
  timeMs: number,
  channel: Pick<Channel, 'defaultColor' | 'defaultBrightness'>
): LightState {
  if (keyframes.length === 0) {
    return {
      r: channel.defaultColor.r,
      g: channel.defaultColor.g,
      b: channel.defaultColor.b,
      brightness: channel.defaultBrightness,
      colorTemperature: 0,
      colorMode: 'RGB',
      powerOn: false
    };
  }

  const nextIdx = upperBound(keyframes, timeMs);
  if (nextIdx >= keyframes.length) return keyframeToState(keyframes[keyframes.length - 1]);

  const next = keyframes[nextIdx];
  if (nextIdx === 0) {
    const transStart =
      next.transitionMs <= next.timestampMs ? next.timestampMs - next.transitionMs : 0;
    if (timeMs < transStart) {
      return {
        r: channel.defaultColor.r,
        g: channel.defaultColor.g,
        b: channel.defaultColor.b,
        brightness: channel.defaultBrightness,
        colorTemperature: 0,
        colorMode: 'RGB',
        powerOn: false
      };
    }
  }

  const prev = nextIdx > 0 ? keyframes[nextIdx - 1] : null;
  return interpolate(prev, next, timeMs);
}
