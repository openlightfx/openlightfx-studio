import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp, lerpColor } from '../color-utils.js';

const WARM_ORANGE: RGBColor = { r: 255, g: 120, b: 20 };
const WARM_RED: RGBColor = { r: 255, g: 60, b: 10 };
const WARM_YELLOW: RGBColor = { r: 255, g: 200, b: 50 };

/**
 * FLAME: Flickering warm colors (orange/red/yellow) simulating fire.
 * Uses layered sine waves for organic noise. Mixes between warm palette
 * colors driven by flicker_rate_hz and randomness.
 */
export const flameRenderer: IEffectRenderer = {
  sample(
    timeOffsetMs: number,
    _durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    _secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample {
    const flickerRate = params.flicker_rate_hz ?? 8.0;
    const randomness = params.randomness ?? 0.5;
    const intensityScale = intensity / 100;

    const t = timeOffsetMs / 1000;

    // Layered pseudo-noise from sine combinations
    const n1 = Math.sin(2 * Math.PI * flickerRate * t);
    const n2 = Math.sin(2 * Math.PI * flickerRate * 1.7 * t + 1.3);
    const n3 = Math.sin(2 * Math.PI * flickerRate * 0.6 * t + 4.1);
    const noise = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) * randomness;

    // Base brightness with flicker
    const baseBrightness = 0.6 + 0.4 * ((1 + noise) / 2);
    const brightness = clamp(baseBrightness * intensityScale * 100, 0, 100);

    // Color mixing between warm palette and primary
    const warmMix = (1 + Math.sin(2 * Math.PI * flickerRate * 0.3 * t + 2.5)) / 2;
    let warmColor: RGBColor;
    if (warmMix < 0.33) {
      warmColor = lerpColor(WARM_ORANGE, WARM_RED, warmMix / 0.33);
    } else if (warmMix < 0.66) {
      warmColor = lerpColor(WARM_RED, WARM_YELLOW, (warmMix - 0.33) / 0.33);
    } else {
      warmColor = lerpColor(WARM_YELLOW, WARM_ORANGE, (warmMix - 0.66) / 0.34);
    }

    const color = lerpColor(warmColor, primaryColor, 0.3);

    return { color, brightness };
  },
};
