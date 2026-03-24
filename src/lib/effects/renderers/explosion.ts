import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp, lerpColor } from '../color-utils.js';

const EXPLOSION_ORANGE: RGBColor = { r: 255, g: 140, b: 20 };

/**
 * EXPLOSION: Rapid orange/red burst with slow decay.
 * flash_count bursts spread over duration, each decaying over decay_ms.
 * Colors shift from bright white/yellow at peak through orange to red during decay.
 */
export const explosionRenderer: IEffectRenderer = {
  sample(
    timeOffsetMs: number,
    durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    _secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample {
    const flashCount = Math.round(params.flash_count ?? 3);
    const decayMs = params.decay_ms ?? 500;
    const intensityScale = intensity / 100;

    if (durationMs <= 0) return { color: { r: 0, g: 0, b: 0 }, brightness: 0 };

    const spacing = durationMs / flashCount;
    let maxBrightness = 0;
    let bestDecayPhase = 1;

    for (let i = 0; i < flashCount; i++) {
      const burstStart = i * spacing;
      const elapsed = timeOffsetMs - burstStart;

      if (elapsed >= 0 && elapsed < decayMs + 50) {
        const attackMs = 15;
        let burstBrightness: number;
        let decayPhase: number;
        if (elapsed < attackMs) {
          burstBrightness = elapsed / attackMs;
          decayPhase = 0;
        } else {
          const decayElapsed = elapsed - attackMs;
          burstBrightness = Math.exp((-2.5 * decayElapsed) / Math.max(decayMs, 1));
          decayPhase = clamp(decayElapsed / Math.max(decayMs, 1), 0, 1);
        }
        if (burstBrightness > maxBrightness) {
          maxBrightness = burstBrightness;
          bestDecayPhase = decayPhase;
        }
      }
    }

    const brightness = clamp(maxBrightness * intensityScale * 100, 0, 100);

    // Color shifts from primary (bright) to orange/red during decay
    const warmColor = lerpColor(primaryColor, EXPLOSION_ORANGE, bestDecayPhase * 0.7);
    const color = lerpColor({ r: 0, g: 0, b: 0 }, warmColor, maxBrightness);

    return { color, brightness };
  },
};
