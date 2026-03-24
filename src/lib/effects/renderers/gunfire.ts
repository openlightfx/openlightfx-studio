import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp, lerpColor } from '../color-utils.js';

const MUZZLE_YELLOW: RGBColor = { r: 255, g: 230, b: 120 };

/**
 * GUNFIRE: Brief sharp white/yellow flashes.
 * flash_count flashes distributed over the duration with very fast attack
 * and short decay. Each flash is intense but brief.
 */
export const gunfireRenderer: IEffectRenderer = {
  sample(
    timeOffsetMs: number,
    durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    _secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample {
    const flashCount = Math.round(params.flash_count ?? 4);
    const decayMs = params.decay_ms ?? 500;
    const intensityScale = intensity / 100;

    if (durationMs <= 0) return { color: { r: 0, g: 0, b: 0 }, brightness: 0 };

    // Gunfire uses shorter effective decay than provided
    const effectiveDecay = decayMs * 0.3;
    const spacing = durationMs / flashCount;
    let maxBrightness = 0;

    for (let i = 0; i < flashCount; i++) {
      const flashStart = i * spacing;
      const elapsed = timeOffsetMs - flashStart;

      if (elapsed >= 0 && elapsed < effectiveDecay + 20) {
        const attackMs = 5; // very fast attack
        let flashBrightness: number;
        if (elapsed < attackMs) {
          flashBrightness = elapsed / attackMs;
        } else {
          const decayElapsed = elapsed - attackMs;
          flashBrightness = Math.exp((-5.0 * decayElapsed) / Math.max(effectiveDecay, 1));
        }
        maxBrightness = Math.max(maxBrightness, flashBrightness);
      }
    }

    const brightness = clamp(maxBrightness * intensityScale * 100, 0, 100);

    // White/yellow flash color
    const flashColor = lerpColor(MUZZLE_YELLOW, primaryColor, 0.3);
    const color = lerpColor({ r: 0, g: 0, b: 0 }, flashColor, maxBrightness);

    return { color, brightness };
  },
};
