// ============================================================
// Safety Computation Service — auto-compute SafetyInfo from track data
// ============================================================

import type { LightFXTrack, SafetyInfo, EffectType, IntensityRating } from '$lib/types/index.js';

const FLASHING_EFFECTS: Set<EffectType> = new Set([
  'LIGHTNING',
  'FLASHBANG',
  'GUNFIRE',
  'STROBE',
  'SPARK',
]);

const STROBING_EFFECTS: Set<EffectType> = new Set(['STROBE']);

const MODERATE_EFFECTS: Set<EffectType> = new Set([
  'PULSE',
  'BREATHING',
  'AURORA',
  'FLAME',
  'CANDLE',
  'NEON',
  'SIREN',
]);

const INTENSE_EFFECTS: Set<EffectType> = new Set([
  'LIGHTNING',
  'FLASHBANG',
  'EXPLOSION',
  'GUNFIRE',
  'SPARK',
]);

/** Default flash_count per effect type for max_flash_frequency_hz calculation */
const DEFAULT_FLASH_COUNT: Partial<Record<EffectType, number>> = {
  LIGHTNING: 2,
  FLASHBANG: 1,
  EXPLOSION: 3,
  GUNFIRE: 4,
  SIREN: 8,
  STROBE: 10,
  SPARK: 1,
};

/**
 * Compute SafetyInfo from track data per STU-045a.
 */
export function computeSafetyInfo(track: LightFXTrack): SafetyInfo {
  const effects = track.effectKeyframes ?? [];

  const containsFlashing = effects.some((e) => FLASHING_EFFECTS.has(e.effectType));
  const containsStrobing = effects.some((e) => STROBING_EFFECTS.has(e.effectType));

  const intensityRating = computeIntensityRating(effects.map((e) => e.effectType));

  const maxFlashFrequencyHz = computeMaxFlashFrequency(effects);
  const maxBrightnessDelta = computeMaxBrightnessDelta(track);

  return {
    containsFlashing,
    containsStrobing,
    maxFlashFrequencyHz,
    maxBrightnessDelta,
    intensityRating,
    warningText: '',
  };
}

function computeIntensityRating(effectTypes: EffectType[]): IntensityRating {
  if (effectTypes.length === 0) {
    return 'SUBTLE';
  }

  const hasStrobe = effectTypes.some((t) => STROBING_EFFECTS.has(t));
  if (hasStrobe) {
    return 'EXTREME';
  }

  const intenseCount = effectTypes.filter((t) => INTENSE_EFFECTS.has(t)).length;
  if (intenseCount >= 5) {
    return 'EXTREME';
  }

  if (intenseCount > 0) {
    return 'INTENSE';
  }

  const hasModerate = effectTypes.some((t) => MODERATE_EFFECTS.has(t));
  if (hasModerate) {
    return 'MODERATE';
  }

  return 'SUBTLE';
}

function computeMaxFlashFrequency(effects: LightFXTrack['effectKeyframes']): number {
  let maxHz = 0;

  for (const effect of effects) {
    if (!FLASHING_EFFECTS.has(effect.effectType)) continue;
    if (!effect.durationMs || effect.durationMs <= 0) continue;

    const flashCount =
      effect.effectParams?.params?.flash_count ?? DEFAULT_FLASH_COUNT[effect.effectType] ?? 1;

    const hz = (flashCount / effect.durationMs) * 1000;
    if (hz > maxHz) {
      maxHz = hz;
    }
  }

  return maxHz;
}

function computeMaxBrightnessDelta(track: LightFXTrack): number {
  const keyframes = track.keyframes ?? [];
  if (keyframes.length < 2) return 0;

  // Group by channel
  const byChannel = new Map<string, typeof keyframes>();
  for (const kf of keyframes) {
    let list = byChannel.get(kf.channelId);
    if (!list) {
      list = [];
      byChannel.set(kf.channelId, list);
    }
    list.push(kf);
  }

  let maxDelta = 0;

  for (const [, channelKfs] of byChannel) {
    channelKfs.sort((a, b) => a.timestampMs - b.timestampMs);
    for (let i = 1; i < channelKfs.length; i++) {
      const delta = Math.abs(channelKfs[i].brightness - channelKfs[i - 1].brightness);
      if (delta > maxDelta) {
        maxDelta = delta;
      }
    }
  }

  return maxDelta;
}
