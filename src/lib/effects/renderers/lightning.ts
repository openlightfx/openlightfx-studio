import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp, lerpColor } from '../color-utils.js';

/**
 * LIGHTNING: Rapid bright white flash(es) with afterglow decay.
 * Distributes flash_count flashes over the duration. Each flash is a sharp
 * peak that exponentially decays over decay_ms.
 */
export const lightningRenderer: IEffectRenderer = {
  sample(
    timeOffsetMs: number,
    durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    _secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample {
    const flashCount = Math.round(params.flash_count ?? 2);
    const decayMs = params.decay_ms ?? 500;
    const intensityScale = intensity / 100;

    if (durationMs <= 0) return { color: { r: 0, g: 0, b: 0 }, brightness: 0 };

    const spacing = durationMs / flashCount;
    let maxBrightness = 0;

    for (let i = 0; i < flashCount; i++) {
      const flashStart = i * spacing;
      const elapsed = timeOffsetMs - flashStart;

      if (elapsed >= 0 && elapsed < decayMs + 50) {
        // Sharp attack (first 10ms) then exponential decay
        const attackMs = 10;
        let flashBrightness: number;
        if (elapsed < attackMs) {
          flashBrightness = elapsed / attackMs;
        } else {
          const decayElapsed = elapsed - attackMs;
          flashBrightness = Math.exp((-3.0 * decayElapsed) / Math.max(decayMs, 1));
        }
        maxBrightness = Math.max(maxBrightness, flashBrightness);
      }
    }

    const brightness = clamp(maxBrightness * intensityScale * 100, 0, 100);
    const color = lerpColor({ r: 0, g: 0, b: 0 }, primaryColor, maxBrightness);

    return { color, brightness };
  },
};
