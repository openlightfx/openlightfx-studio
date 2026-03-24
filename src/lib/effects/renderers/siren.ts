import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp } from '../color-utils.js';

/**
 * SIREN: Alternating primary/secondary color (default red/blue).
 * flash_count controls the number of full cycles over the duration.
 * Each cycle smoothly transitions between the two colors.
 */
export const sirenRenderer: IEffectRenderer = {
  sample(
    timeOffsetMs: number,
    durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample {
    const flashCount = Math.round(params.flash_count ?? 8);
    const intensityScale = intensity / 100;

    if (durationMs <= 0) return { color: { r: 0, g: 0, b: 0 }, brightness: 0 };

    const cycleMs = durationMs / flashCount;
    const phase = cycleMs > 0 ? (timeOffsetMs % cycleMs) / cycleMs : 0;

    // Square-ish wave with slight transition for smoothness
    const transitionWidth = 0.1;
    let blend: number;
    if (phase < 0.5 - transitionWidth) {
      blend = 0;
    } else if (phase < 0.5 + transitionWidth) {
      blend = (phase - (0.5 - transitionWidth)) / (2 * transitionWidth);
    } else if (phase < 1.0 - transitionWidth) {
      blend = 1;
    } else {
      blend = 1 - (phase - (1.0 - transitionWidth)) / (2 * transitionWidth);
    }

    const color: RGBColor = {
      r: Math.round(primaryColor.r * (1 - blend) + secondaryColor.r * blend),
      g: Math.round(primaryColor.g * (1 - blend) + secondaryColor.g * blend),
      b: Math.round(primaryColor.b * (1 - blend) + secondaryColor.b * blend),
    };

    const brightness = clamp(intensityScale * 100, 0, 100);

    return { color, brightness };
  },
};
