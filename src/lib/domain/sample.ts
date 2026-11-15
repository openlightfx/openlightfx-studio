import { kelvinToRgb } from './kelvin';
import { clamp, roundHalfToEven } from './round';
import type { ColorMode, Interpolation, Keyframe, Sample } from './types';

const BLACK_SAMPLE: Sample = {
  r: 0,
  g: 0,
  b: 0,
  brightness: 0,
  kelvin: 0,
  mode: 'RGB',
  powerOn: false,
};

function lerpByte(a: number, b: number, t: number): number {
  return clamp(roundHalfToEven(a + (b - a) * t), 0, 255);
}

function lerpUint(a: number, b: number, t: number): number {
  return Math.max(roundHalfToEven(a + (b - a) * t), 0);
}

function easing(mode: Interpolation, t: number): number {
  const clamped = clamp(t, 0, 1);
  if (mode === 'STEP') return clamped < 1 ? 0 : 1;
  return clamped;
}

export function keyframeToSample(kf: Keyframe): Sample {
  if (kf.colorMode === 'COLOR_TEMPERATURE') {
    const rgb = kelvinToRgb(kf.colorTemperature);
    return {
      ...rgb,
      brightness: kf.brightness,
      kelvin: kf.colorTemperature,
      mode: 'COLOR_TEMPERATURE',
      powerOn: kf.powerOn,
    };
  }
  return {
    r: clamp(kf.color.r, 0, 255),
    g: clamp(kf.color.g, 0, 255),
    b: clamp(kf.color.b, 0, 255),
    brightness: kf.brightness,
    kelvin: 0,
    mode: 'RGB',
    powerOn: kf.powerOn,
  };
}

function blend(from: Sample, to: Sample, t: number): Sample {
  const bothTemp = from.mode === 'COLOR_TEMPERATURE' && to.mode === 'COLOR_TEMPERATURE';
  if (bothTemp) {
    const kelvin = lerpUint(from.kelvin, to.kelvin, t);
    const rgb = kelvinToRgb(kelvin);
    return {
      ...rgb,
      brightness: lerpUint(from.brightness, to.brightness, t),
      kelvin,
      mode: 'COLOR_TEMPERATURE',
      powerOn: from.powerOn || to.powerOn,
    };
  }
  return {
    r: lerpByte(from.r, to.r, t),
    g: lerpByte(from.g, to.g, t),
    b: lerpByte(from.b, to.b, t),
    brightness: lerpUint(from.brightness, to.brightness, t),
    kelvin: 0,
    mode: 'RGB' as ColorMode,
    powerOn: from.powerOn || to.powerOn,
  };
}

/** InterpolationEngine.Interpolate. A missing previous keyframe is black, not the channel default. */
export function interpolate(previous: Keyframe | null, next: Keyframe, timeMs: number): Sample {
  const nextState = keyframeToSample(next);
  const transitionDuration = next.transitionMs;
  const transitionEnd = next.timestampMs;
  const transitionStart =
    transitionDuration <= transitionEnd ? transitionEnd - transitionDuration : 0;
  if (timeMs >= transitionEnd) return nextState;
  if (transitionDuration === 0) return previous ? keyframeToSample(previous) : { ...BLACK_SAMPLE };
  if (timeMs <= transitionStart) return previous ? keyframeToSample(previous) : { ...BLACK_SAMPLE };
  const prevState = previous ? keyframeToSample(previous) : { ...BLACK_SAMPLE };
  const t = (timeMs - transitionStart) / (transitionEnd - transitionStart);
  return blend(prevState, nextState, easing(next.interpolation, t));
}

/**
 * PlaybackSession bracketing. Before the first keyframe the sample is black.
 * After the last keyframe the sample holds that keyframe.
 */
export function createChannelSampler(keyframes: readonly Keyframe[]): (timeMs: number) => Sample {
  const sorted = [...keyframes].sort((a, b) => a.timestampMs - b.timestampMs);
  return (timeMs) => {
    if (!sorted.length) return { ...BLACK_SAMPLE };
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (sorted[middle].timestampMs <= timeMs) low = middle + 1;
      else high = middle;
    }
    if (low === sorted.length) return keyframeToSample(sorted[sorted.length - 1]);
    return interpolate(low > 0 ? sorted[low - 1] : null, sorted[low], timeMs);
  };
}

export function sampleChannel(keyframes: Keyframe[], timeMs: number): Sample {
  return createChannelSampler(keyframes)(timeMs);
}

export function samplesEqual(actual: Sample, expected: Partial<Sample>): boolean {
  const keys = Object.keys(expected) as (keyof Sample)[];
  return keys.every((key) => actual[key] === expected[key]);
}
