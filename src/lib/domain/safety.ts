import type { EffectType, IntensityRating, Keyframe, SafetyInfo, Track } from './types';

const FLASH_EFFECTS = new Set<EffectType>(['LIGHTNING', 'FLASHBANG', 'GUNFIRE', 'SPARK', 'STROBE']);

export function computeSafety(track: Pick<Track, 'keyframes' | 'effects'>): SafetyInfo {
  const byChannel = new Map<string, Keyframe[]>();
  for (const kf of track.keyframes) {
    const list = byChannel.get(kf.channelId) ?? [];
    list.push(kf);
    byChannel.set(kf.channelId, list);
  }

  let maxFrequency = 0;
  let maxDelta = 0;
  let sawEdge = false;
  for (const list of byChannel.values()) {
    const ordered = [...list].sort((a, b) => a.timestampMs - b.timestampMs);
    for (let i = 1; i < ordered.length; i++) {
      const delta = Math.abs(ordered[i].brightness - ordered[i - 1].brightness);
      maxDelta = Math.max(maxDelta, delta);
      if (delta > 20) {
        const dt = ordered[i].timestampMs - ordered[i - 1].timestampMs;
        if (dt > 0) {
          sawEdge = true;
          maxFrequency = Math.max(maxFrequency, 1000 / dt);
        }
      }
    }
  }

  const types = new Set(track.effects.map((effect) => effect.effectType));
  const containsStrobing = types.has('STROBE');
  const containsFlashing =
    (sawEdge && maxFrequency > 3) || [...types].some((type) => FLASH_EFFECTS.has(type));

  let intensityRating: IntensityRating = 'SUBTLE';
  if (sawEdge && maxFrequency >= 8) intensityRating = 'EXTREME';
  else if (containsFlashing || containsStrobing) intensityRating = 'INTENSE';
  else if (maxDelta >= 40) intensityRating = 'MODERATE';

  return {
    containsFlashing,
    containsStrobing,
    maxFlashFrequencyHz: sawEdge ? maxFrequency : 0,
    maxBrightnessDelta: maxDelta,
    warningText: '',
    intensityRating,
  };
}

export function withAuthorWarning(safety: SafetyInfo, warningText: string): SafetyInfo {
  return { ...safety, warningText };
}
