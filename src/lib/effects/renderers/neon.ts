import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp, lerpColor } from '../color-utils.js';

/**
 * NEON: Rapid color-saturated flicker (neon sign effect).
 * Mostly on at full brightness with occasional brief dips/flickers.
 * flicker_rate_hz controls flicker speed, randomness controls how often
 * dips occur.
 */
export const neonRenderer: IEffectRenderer = {
  sample(
    timeOffsetMs: number,
    _durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample {
    const flickerRate = params.flicker_rate_hz ?? 15.0;
    const randomness = params.randomness ?? 0.5;
    const intensityScale = intensity / 100;

    const t = timeOffsetMs / 1000;

    // Layered sine waves create pseudo-random flicker pattern
    const n1 = Math.sin(2 * Math.PI * flickerRate * t);
    const n2 = Math.sin(2 * Math.PI * flickerRate * 2.3 * t + 1.7);
    const n3 = Math.sin(2 * Math.PI * flickerRate * 0.8 * t + 3.9);
    const combinedNoise = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

    // Threshold-based flicker: mostly on, occasional dips
    const flickerThreshold = 0.6 - randomness * 0.5;
    const isFlickering = combinedNoise < -flickerThreshold;
    const flickerDepth = isFlickering
      ? clamp(((-flickerThreshold - combinedNoise) / (1 - flickerThreshold)) * randomness, 0, 1)
      : 0;

    const brightness = clamp((1 - flickerDepth * 0.8) * intensityScale * 100, 0, 100);

    // Slight color shift during flicker
    const color = isFlickering
      ? lerpColor(primaryColor, secondaryColor, flickerDepth * 0.4)
      : primaryColor;

    return { color, brightness };
  },
};
