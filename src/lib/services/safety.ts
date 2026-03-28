import type { SafetyInfo, Keyframe, EffectKeyframe, IntensityRating, EffectType } from '$lib/types/index.js';

const FLASHING_EFFECTS: Set<EffectType> = new Set(['LIGHTNING', 'FLASHBANG', 'GUNFIRE', 'STROBE', 'SPARK']);
const STROBING_EFFECTS: Set<EffectType> = new Set(['STROBE']);
const MODERATE_EFFECTS: Set<EffectType> = new Set(['PULSE', 'BREATHING', 'AURORA', 'FLAME', 'CANDLE', 'NEON', 'SIREN']);
const INTENSE_EFFECTS: Set<EffectType> = new Set(['LIGHTNING', 'FLASHBANG', 'EXPLOSION', 'GUNFIRE', 'SPARK']);

export function computeSafetyInfo(keyframes: Keyframe[], effects: EffectKeyframe[]): SafetyInfo {
  const containsFlashing = effects.some((e) => FLASHING_EFFECTS.has(e.effectType));
  const containsStrobing = effects.some((e) => STROBING_EFFECTS.has(e.effectType));

  let maxFlashFrequencyHz = 0;
  for (const e of effects) {
    if (!FLASHING_EFFECTS.has(e.effectType)) continue;
    const flashCount = e.effectParams.params.flash_count ?? 1;
    const durationSec = e.durationMs / 1000;
    if (durationSec > 0) {
      const freq = flashCount / durationSec;
      maxFlashFrequencyHz = Math.max(maxFlashFrequencyHz, freq);
    }
  }

  const maxBrightnessDelta = computeMaxBrightnessDelta(keyframes);
  const intensityRating = computeIntensityRating(effects, containsStrobing);

  const warnings: string[] = [];
  if (containsStrobing) warnings.push('Contains strobing effects');
  if (containsFlashing) warnings.push('Contains flashing effects');

  return {
    containsFlashing,
    containsStrobing,
    maxFlashFrequencyHz,
    maxBrightnessDelta,
    warningText: warnings.join('. '),
    intensityRating,
  };
}

function computeMaxBrightnessDelta(keyframes: Keyframe[]): number {
  const byChannel = new Map<string, Keyframe[]>();
  for (const kf of keyframes) {
    let arr = byChannel.get(kf.channelId);
    if (!arr) { arr = []; byChannel.set(kf.channelId, arr); }
    arr.push(kf);
  }

  let maxDelta = 0;
  for (const channelKfs of byChannel.values()) {
    const sorted = channelKfs.sort((a, b) => a.timestampMs - b.timestampMs);
    for (let i = 1; i < sorted.length; i++) {
      const delta = Math.abs(sorted[i].brightness - sorted[i - 1].brightness);
      maxDelta = Math.max(maxDelta, delta);
    }
  }
  return maxDelta;
}

function computeIntensityRating(effects: EffectKeyframe[], containsStrobing: boolean): IntensityRating {
  if (containsStrobing) return 'EXTREME';
  const intenseCount = effects.filter((e) => INTENSE_EFFECTS.has(e.effectType)).length;
  if (intenseCount >= 5) return 'EXTREME';
  if (intenseCount > 0) return 'INTENSE';
  const hasModerate = effects.some((e) => MODERATE_EFFECTS.has(e.effectType));
  if (hasModerate) return 'MODERATE';
  return 'SUBTLE';
}
