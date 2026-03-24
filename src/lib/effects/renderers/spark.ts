import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp, lerpColor } from '../color-utils.js';

/**
 * SPARK: Very brief single flash.
 * A single sharp peak near the beginning of the duration with fast decay.
 * randomness shifts the peak position slightly for variation.
 */
export const sparkRenderer: IEffectRenderer = {
  sample(
    timeOffsetMs: number,
    durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    _secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample {
    const randomness = params.randomness ?? 0.5;
    const intensityScale = intensity / 100;

    if (durationMs <= 0) return { color: { r: 0, g: 0, b: 0 }, brightness: 0 };

    // Peak position: centered at 20% of duration, randomness shifts it ±15%
    const peakOffset = 0.2 + (randomness - 0.5) * 0.3;
    const peakMs = durationMs * clamp(peakOffset, 0.05, 0.5);

    const attackMs = Math.min(durationMs * 0.05, 15);
    const decayMs = durationMs * 0.6;

    let sparkBrightness: number;
    if (timeOffsetMs < peakMs - attackMs) {
      sparkBrightness = 0;
    } else if (timeOffsetMs < peakMs) {
      sparkBrightness = (timeOffsetMs - (peakMs - attackMs)) / attackMs;
    } else {
      const elapsed = timeOffsetMs - peakMs;
      sparkBrightness = Math.exp((-4.0 * elapsed) / Math.max(decayMs, 1));
    }

    sparkBrightness = clamp(sparkBrightness, 0, 1);

    const brightness = clamp(sparkBrightness * intensityScale * 100, 0, 100);
    const color = lerpColor({ r: 0, g: 0, b: 0 }, primaryColor, sparkBrightness);

    return { color, brightness };
  },
};
