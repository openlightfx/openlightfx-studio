import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp, lerpColor } from '../color-utils.js';

/**
 * AURORA: Slow-shifting multi-color ambient wash.
 * Smoothly transitions between primary and secondary colors using layered
 * sine waves. flicker_rate_hz controls shift speed, randomness adds variation.
 */
export const auroraRenderer: IEffectRenderer = {
  sample(
    timeOffsetMs: number,
    _durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample {
    const flickerRate = params.flicker_rate_hz ?? 0.5;
    const randomness = params.randomness ?? 0.5;
    const intensityScale = intensity / 100;

    const t = timeOffsetMs / 1000;

    // Slow color blend with layered sine waves for organic feel
    const wave1 = (1 + Math.sin(2 * Math.PI * flickerRate * t)) / 2;
    const wave2 = (1 + Math.sin(2 * Math.PI * flickerRate * 0.7 * t + 2.1)) / 2;
    const wave3 = (1 + Math.sin(2 * Math.PI * flickerRate * 1.3 * t + 4.7)) / 2;

    const blend = wave1 * 0.5 + wave2 * 0.3 * randomness + wave3 * 0.2 * randomness;
    const normalizedBlend = clamp(blend, 0, 1);

    const color = lerpColor(primaryColor, secondaryColor, normalizedBlend);

    // Gentle brightness undulation
    const brightnessWave = 0.8 + 0.2 * Math.sin(2 * Math.PI * flickerRate * 0.4 * t + 1.0);
    const brightness = clamp(brightnessWave * intensityScale * 100, 0, 100);

    return { color, brightness };
  },
};
