import type { EffectKeyframe, EffectType, RGB } from '$lib/model/types';
import { clamp, mixRgb } from '$lib/engine/color';

export interface EffectSample {
  color: RGB;
  brightness: number;
}

const PARAM_DEFAULTS: Record<EffectType, Record<string, number>> = {
  EFFECT_UNSPECIFIED: {},
  LIGHTNING: { flash_count: 2, decay_ms: 500 },
  FLAME: { flicker_rate_hz: 8, randomness: 0.5 },
  FLASHBANG: { flash_count: 1 },
  EXPLOSION: { flash_count: 3, decay_ms: 500 },
  PULSE: { pulse_rate_hz: 1 },
  STROBE: { flash_count: 10 },
  SIREN: { flash_count: 8 },
  AURORA: { flicker_rate_hz: 0.5, randomness: 0.5 },
  CANDLE: { flicker_rate_hz: 3, randomness: 0.5 },
  GUNFIRE: { flash_count: 4, decay_ms: 500 },
  NEON: { flicker_rate_hz: 15, randomness: 0.5 },
  BREATHING: { pulse_rate_hz: 1 },
  SPARK: { randomness: 0.5 }
};

export function effectParam(effect: EffectKeyframe, key: string): number {
  const raw = effect.effectParams[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return PARAM_DEFAULTS[effect.effectType]?.[key] ?? 0;
}

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function flicker(effect: EffectKeyframe, localMs: number, rateHz: number): number {
  const bucket = Math.floor((localMs / 1000) * Math.max(0.5, rateHz));
  const seed = hashString(effect.id) + bucket * 13.13;
  const randomness = clamp(effectParam(effect, 'randomness'), 0, 1);
  return 1 - randomness * hash01(seed);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Local preview of an effect. This is an approximation of the plugin
 * renderers so editing has immediate feedback; playback on Emby uses
 * the plugin's own effect renderers.
 * Returns null outside [timestamp, timestamp + duration).
 */
export function renderEffect(effect: EffectKeyframe, timeMs: number): EffectSample | null {
  const local = timeMs - effect.timestampMs;
  if (local < 0 || local >= effect.durationMs) return null;
  const u = effect.durationMs <= 0 ? 1 : local / effect.durationMs;
  const intensity = clamp(effect.intensity, 0, 100);
  const primary = effect.primaryColor;
  const secondary = effect.secondaryColor;

  switch (effect.effectType) {
    case 'STROBE': {
      const count = Math.max(1, Math.round(effectParam(effect, 'flash_count')));
      const phase = (local % (effect.durationMs / count)) / (effect.durationMs / count);
      return { color: primary, brightness: phase < 0.5 ? intensity : 0 };
    }
    case 'SIREN': {
      const count = Math.max(1, Math.round(effectParam(effect, 'flash_count')));
      const idx = Math.floor(local / (effect.durationMs / count));
      return { color: idx % 2 === 0 ? primary : secondary, brightness: intensity };
    }
    case 'PULSE':
    case 'BREATHING': {
      const hz = Math.max(0.05, effectParam(effect, 'pulse_rate_hz'));
      const wave = 0.5 - 0.5 * Math.cos((2 * Math.PI * hz * local) / 1000);
      const floor = effect.effectType === 'BREATHING' ? 0.15 : 0;
      return { color: primary, brightness: intensity * (floor + (1 - floor) * wave) };
    }
    case 'FLAME':
    case 'CANDLE':
    case 'NEON': {
      const rate = effectParam(effect, 'flicker_rate_hz');
      const f = flicker(effect, local, rate);
      const amount = effect.effectType === 'CANDLE' ? 0.35 + 0.65 * f : f;
      return {
        color: mixRgb(secondary, primary, amount),
        brightness: intensity * (effect.effectType === 'CANDLE' ? 0.45 + 0.55 * f : 0.35 + 0.65 * f)
      };
    }
    case 'AURORA': {
      const rate = Math.max(0.05, effectParam(effect, 'flicker_rate_hz'));
      const wave = 0.5 - 0.5 * Math.cos((2 * Math.PI * rate * local) / 1000);
      const wobble = flicker(effect, local, rate * 2);
      return {
        color: mixRgb(primary, secondary, wave * 0.8 + wobble * 0.2),
        brightness: intensity * (0.45 + 0.55 * wave)
      };
    }
    case 'FLASHBANG': {
      const flashMs = Math.min(120, effect.durationMs * 0.15);
      if (local < flashMs) return { color: primary, brightness: intensity };
      const fade = 1 - (local - flashMs) / Math.max(1, effect.durationMs - flashMs);
      return { color: primary, brightness: intensity * Math.max(0, fade) };
    }
    case 'SPARK': {
      const width = Math.min(80, effect.durationMs);
      const on = local < width;
      return { color: primary, brightness: on ? intensity : 0 };
    }
    case 'LIGHTNING':
    case 'GUNFIRE':
    case 'EXPLOSION': {
      const count = Math.max(1, Math.round(effectParam(effect, 'flash_count')));
      const decay = Math.max(0, effectParam(effect, 'decay_ms'));
      const flashWindow = Math.min(effect.durationMs, Math.max(count * 70, effect.durationMs * 0.45));
      let flashed = false;
      let lastFlashEnd = 0;
      for (let i = 0; i < count; i++) {
        const center = ((i + 0.5) / count) * flashWindow;
        const half = effect.effectType === 'EXPLOSION' ? 90 : 36;
        if (Math.abs(local - center) <= half) flashed = true;
        lastFlashEnd = Math.max(lastFlashEnd, center + half);
      }
      if (flashed) {
        const hot = effect.effectType === 'EXPLOSION' ? mixRgb(primary, { r: 255, g: 255, b: 255 }, 0.35) : primary;
        return { color: hot, brightness: intensity };
      }
      const decayEnd = lastFlashEnd + decay;
      if (local < decayEnd) {
        const fade = 1 - (local - lastFlashEnd) / Math.max(1, decay);
        return { color: secondary.r + secondary.g + secondary.b > 0 ? secondary : primary, brightness: intensity * Math.max(0, fade) * 0.7 };
      }
      if (effect.effectType === 'EXPLOSION') {
        return { color: secondary, brightness: intensity * (1 - u) * 0.25 };
      }
      return { color: primary, brightness: 0 };
    }
    default:
      return { color: primary, brightness: intensity * (1 - u) };
  }
}

export interface BulbCaps {
  rgb: boolean;
  minTransitionMs: number;
}

/** Proto required_capability strings. Empty means CAPABILITY_ANY. */
export function bulbSupportsEffect(effect: EffectKeyframe, bulb: BulbCaps): boolean {
  const cap = effect.requiredCapability || 'CAPABILITY_ANY';
  if (cap === 'CAPABILITY_ANY') return true;
  if (cap === 'CAPABILITY_RGB') return bulb.rgb;
  if (cap === 'CAPABILITY_FAST_TRANSITION') return bulb.minTransitionMs <= 100;
  if (cap === 'CAPABILITY_FAST_RGB') return bulb.rgb && bulb.minTransitionMs <= 100;
  return true;
}
