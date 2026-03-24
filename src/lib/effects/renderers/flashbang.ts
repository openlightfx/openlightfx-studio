import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp, lerpColor } from '../color-utils.js';

/**
 * FLASHBANG: Intense white flash followed by slow fade.
 * flash_count controls how many initial flash pulses occur in the first 15%
 * of the duration, then a long fade over the remaining time.
 */
export const flashbangRenderer: IEffectRenderer = {
  sample(
    timeOffsetMs: number,
    durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    _secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample {
    const flashCount = Math.round(params.flash_count ?? 1);
    const intensityScale = intensity / 100;

    if (durationMs <= 0) return { color: { r: 0, g: 0, b: 0 }, brightness: 0 };

    const t = timeOffsetMs / durationMs;
    const flashPhase = 0.15; // first 15% is flash phase

    let flashBrightness = 0;

    if (t < flashPhase) {
      // Flash phase: flash_count sharp peaks
      const flashT = t / flashPhase;
      const flashSpacing = 1 / flashCount;
      for (let i = 0; i < flashCount; i++) {
        const flashCenter = (i + 0.5) * flashSpacing;
        const dist = Math.abs(flashT - flashCenter) / flashSpacing;
        flashBrightness = Math.max(flashBrightness, Math.max(0, 1 - dist * 4));
      }
    } else {
      // Fade phase: exponential decay from flash to zero
      const fadeT = (t - flashPhase) / (1 - flashPhase);
      flashBrightness = Math.exp(-4 * fadeT);
    }

    const brightness = clamp(flashBrightness * intensityScale * 100, 0, 100);
    const color = lerpColor({ r: 0, g: 0, b: 0 }, primaryColor, flashBrightness);

    return { color, brightness };
  },
};
