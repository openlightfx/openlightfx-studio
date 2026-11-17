import { overlaySample } from './preview';
import type { EffectKeyframe, EffectType, Keyframe, Rgb } from './types';

export interface EffectPreset {
  type: EffectType;
  name: string;
  description: string;
  defaultDurationMs: number;
  defaultIntensity: number;
  primaryColor: Rgb;
  secondaryColor: Rgb;
  params: Record<string, number>;
  requiredCapability: string;
  fallbackColor: Rgb;
  fallbackBrightness: number;
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const RED: Rgb = { r: 255, g: 0, b: 0 };
const BLUE: Rgb = { r: 0, g: 0, b: 255 };
const ORANGE: Rgb = { r: 255, g: 140, b: 20 };
const WARM: Rgb = { r: 255, g: 120, b: 20 };
const CANDLE: Rgb = { r: 255, g: 160, b: 50 };
const GREEN: Rgb = { r: 0, g: 200, b: 100 };
const PURPLE: Rgb = { r: 180, g: 0, b: 255 };
const PINK: Rgb = { r: 255, g: 20, b: 147 };
const YELLOW: Rgb = { r: 255, g: 230, b: 120 };

/** Defaults match lightfx.proto EffectType notes and the plugin renderers. */
export const EFFECT_PRESETS: readonly EffectPreset[] = [
  preset(
    'LIGHTNING',
    'Lightning',
    'Rapid bright white flashes with afterglow',
    2000,
    WHITE,
    { r: 180, g: 180, b: 255 },
    { flash_count: 2, decay_ms: 500 },
    'CAPABILITY_FAST_TRANSITION',
    100
  ),
  preset(
    'FLAME',
    'Flame',
    'Flickering warm fire',
    3000,
    WARM,
    RED,
    { flicker_rate_hz: 8, randomness: 0.5 },
    'CAPABILITY_ANY',
    70
  ),
  preset(
    'FLASHBANG',
    'Flashbang',
    'Intense white flash and a slow fade',
    2000,
    WHITE,
    { r: 255, g: 255, b: 200 },
    { flash_count: 1 },
    'CAPABILITY_FAST_TRANSITION',
    100
  ),
  preset(
    'EXPLOSION',
    'Explosion',
    'Orange burst with a slow decay',
    2000,
    { r: 255, g: 200, b: 80 },
    RED,
    { flash_count: 3, decay_ms: 500 },
    'CAPABILITY_ANY',
    90
  ),
  preset(
    'PULSE',
    'Pulse',
    'Rhythmic brightness oscillation',
    3000,
    WHITE,
    BLACK,
    { pulse_rate_hz: 1 },
    'CAPABILITY_ANY',
    50
  ),
  preset(
    'STROBE',
    'Strobe',
    'Rapid on and off flashes',
    2000,
    WHITE,
    BLACK,
    { flash_count: 10 },
    'CAPABILITY_FAST_TRANSITION',
    80
  ),
  preset(
    'SIREN',
    'Siren',
    'Alternating red and blue',
    3000,
    RED,
    BLUE,
    { flash_count: 8 },
    'CAPABILITY_ANY',
    80
  ),
  preset(
    'AURORA',
    'Aurora',
    'Slow multi-color wash',
    5000,
    GREEN,
    PURPLE,
    { flicker_rate_hz: 0.5, randomness: 0.5 },
    'CAPABILITY_ANY',
    50
  ),
  preset(
    'CANDLE',
    'Candle',
    'Gentle warm flicker',
    5000,
    CANDLE,
    { r: 200, g: 100, b: 20 },
    { flicker_rate_hz: 3, randomness: 0.5 },
    'CAPABILITY_ANY',
    60
  ),
  preset(
    'GUNFIRE',
    'Gunfire',
    'Brief sharp flashes',
    2000,
    WHITE,
    YELLOW,
    { flash_count: 4, decay_ms: 500 },
    'CAPABILITY_FAST_TRANSITION',
    90
  ),
  preset(
    'NEON',
    'Neon',
    'Saturated neon flicker',
    3000,
    PINK,
    { r: 100, g: 0, b: 255 },
    { flicker_rate_hz: 15, randomness: 0.5 },
    'CAPABILITY_ANY',
    80
  ),
  preset(
    'BREATHING',
    'Breathing',
    'Slow brightness swell',
    5000,
    WHITE,
    BLACK,
    { pulse_rate_hz: 1 },
    'CAPABILITY_ANY',
    50
  ),
  preset(
    'SPARK',
    'Spark',
    'A very brief single flash',
    500,
    WHITE,
    BLACK,
    { randomness: 0.5 },
    'CAPABILITY_FAST_TRANSITION',
    80
  ),
];

const FLASHING = new Set<EffectType>(['LIGHTNING', 'FLASHBANG', 'GUNFIRE', 'SPARK', 'STROBE']);

function preset(
  type: EffectType,
  name: string,
  description: string,
  defaultDurationMs: number,
  primaryColor: Rgb,
  secondaryColor: Rgb,
  params: Record<string, number>,
  requiredCapability: string,
  fallbackBrightness: number
): EffectPreset {
  return {
    type,
    name,
    description,
    defaultDurationMs,
    defaultIntensity: 100,
    primaryColor,
    secondaryColor,
    params,
    requiredCapability,
    fallbackColor: primaryColor,
    fallbackBrightness,
  };
}

export function effectPreset(type: EffectType): EffectPreset {
  const found = EFFECT_PRESETS.find((item) => item.type === type);
  if (!found) throw new Error(`Unknown effect ${type}`);
  return found;
}

export function filterEffectPresets(query: string): EffectPreset[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...EFFECT_PRESETS];
  return EFFECT_PRESETS.filter(
    (item) =>
      item.name.toLowerCase().includes(needle) ||
      item.type.toLowerCase().includes(needle) ||
      item.description.toLowerCase().includes(needle)
  );
}

/** Prefer the playhead or a scene cut when the pointer is close to one. */
export function snapEffectStart(
  timeMs: number,
  anchorsMs: readonly number[],
  thresholdMs = 120
): number {
  const time = Math.max(0, Math.round(timeMs));
  let best = time;
  let distance = thresholdMs + 1;
  for (const anchor of anchorsMs) {
    if (!Number.isFinite(anchor)) continue;
    const delta = Math.abs(anchor - time);
    if (delta <= thresholdMs && delta < distance) {
      best = Math.max(0, Math.round(anchor));
      distance = delta;
    }
  }
  return best;
}

export function effectDurationMs(
  requestedMs: number,
  startMs: number,
  movieDurationMs: number
): number {
  const requested = Math.max(1, Math.round(requestedMs));
  if (!Number.isFinite(movieDurationMs) || movieDurationMs <= startMs) return requested;
  return Math.max(1, Math.min(requested, Math.round(movieDurationMs - startMs)));
}

/** Use the colour already authored on the lane when a keyframe covers this time. */
export function effectColorFromLane(
  presetColor: Rgb,
  keyframes: readonly Keyframe[],
  timeMs: number
): Rgb {
  if (!keyframes.some((frame) => frame.timestampMs <= timeMs)) return { ...presetColor };
  const sample = overlaySample([...keyframes], timeMs);
  return { r: sample.r, g: sample.g, b: sample.b };
}

export function buildEffectKeyframe(input: {
  id: string;
  type: EffectType;
  channelId: string;
  timestampMs: number;
  movieDurationMs: number;
  keyframes: readonly Keyframe[];
  anchorsMs?: readonly number[];
}): EffectKeyframe {
  const preset = effectPreset(input.type);
  const timestampMs = snapEffectStart(input.timestampMs, input.anchorsMs ?? [input.timestampMs]);
  const lane = input.keyframes.filter((frame) => frame.channelId === input.channelId);
  return {
    id: input.id,
    channelId: input.channelId,
    timestampMs,
    durationMs: effectDurationMs(preset.defaultDurationMs, timestampMs, input.movieDurationMs),
    effectType: preset.type,
    intensity: preset.defaultIntensity,
    primaryColor: effectColorFromLane(preset.primaryColor, lane, timestampMs),
    secondaryColor: { ...preset.secondaryColor },
    params: { ...preset.params },
    requiredCapability: preset.requiredCapability,
    fallbackColor: { ...preset.fallbackColor },
    fallbackBrightness: preset.fallbackBrightness,
  };
}

export function clampEffectMove(
  timestampMs: number,
  durationMs: number,
  movieDurationMs: number
): { timestampMs: number; durationMs: number } {
  const duration = Math.max(1, Math.round(durationMs));
  const limit =
    Number.isFinite(movieDurationMs) && movieDurationMs > 0
      ? movieDurationMs
      : timestampMs + duration;
  const start = Math.max(0, Math.min(Math.round(timestampMs), Math.max(0, limit - 1)));
  return { timestampMs: start, durationMs: Math.max(1, Math.min(duration, limit - start)) };
}

export function effectSafetyNote(type: EffectType): string | null {
  if (type === 'STROBE') return 'Strobe can flash. Track safety now marks strobing.';
  if (FLASHING.has(type)) return 'This effect can flash. Track safety was updated.';
  return null;
}
