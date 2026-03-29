import type { Keyframe, RGBColor } from '$lib/types/index.js';
import type { EffectKeyframe, EffectType } from '$lib/types/track.js';
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

export interface EffectState {
  color: RGBColor;
  brightness: number;
  effectType: EffectType;
}

export function getEffectStateAtTime(
  effects: EffectKeyframe[],
  channelId: string,
  timeMs: number,
): EffectState | null {
  let bestEffect: EffectKeyframe | null = null;
  let bestIntensity = -1;

  for (const ef of effects) {
    if (ef.channelId !== channelId) continue;
    if (timeMs < ef.timestampMs || timeMs > ef.timestampMs + ef.durationMs) continue;
    if (ef.intensity > bestIntensity) {
      bestIntensity = ef.intensity;
      bestEffect = ef;
    }
  }

  if (!bestEffect) return null;

  const progress = (timeMs - bestEffect.timestampMs) / bestEffect.durationMs;
  const color = computeEffectColor(bestEffect, progress);
  const brightness = (bestEffect.intensity / 100) * computeEffectBrightness(bestEffect.effectType, progress);

  return { color, brightness, effectType: bestEffect.effectType };
}

function computeEffectColor(ef: EffectKeyframe, progress: number): RGBColor {
  const { primaryColor, secondaryColor, effectType } = ef;

  switch (effectType) {
    case 'SIREN':
      return Math.floor(progress * 10) % 2 === 0 ? primaryColor : secondaryColor;
    case 'AURORA':
      return interpolateColor(primaryColor, secondaryColor, (Math.sin(progress * Math.PI * 2) + 1) / 2);
    default:
      return primaryColor;
  }
}

function computeEffectBrightness(effectType: EffectType, progress: number): number {
  switch (effectType) {
    case 'LIGHTNING':
    case 'FLASHBANG':
    case 'SPARK':
      return progress < 0.1 ? 1.0 : Math.max(0, 1.0 - (progress - 0.1) / 0.9);
    case 'EXPLOSION':
      return progress < 0.15 ? 1.0 : Math.max(0, 1.0 - (progress - 0.15) / 0.85);
    case 'GUNFIRE':
      return Math.sin(progress * Math.PI * 8) > 0.5 ? 1.0 : 0.1;
    case 'PULSE':
      return (Math.sin(progress * Math.PI * 4) + 1) / 2;
    case 'BREATHING':
      return (Math.sin(progress * Math.PI * 2) + 1) / 2;
    case 'STROBE':
      return Math.floor(progress * 20) % 2 === 0 ? 1.0 : 0.0;
    case 'FLAME':
    case 'CANDLE':
      return 0.5 + 0.5 * Math.random();
    case 'NEON':
      return Math.random() > 0.1 ? 1.0 : 0.2;
    case 'SIREN':
      return 0.8 + 0.2 * Math.sin(progress * Math.PI * 6);
    case 'AURORA':
      return 0.3 + 0.4 * Math.sin(progress * Math.PI * 2);
    default:
      return 1.0;
  }
}
