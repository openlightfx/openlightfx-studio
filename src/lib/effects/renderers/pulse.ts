import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp, lerpColor } from '../color-utils.js';

/**
 * PULSE: Rhythmic brightness oscillation using sine wave.
 * brightness = base + amplitude * sin(2π * pulse_rate_hz * t)
 */
export const pulseRenderer: IEffectRenderer = {
  sample(
    timeOffsetMs: number,
    _durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample {
    const pulseRate = params.pulse_rate_hz ?? 1.0;
    const intensityScale = intensity / 100;

    const t = timeOffsetMs / 1000;
    const wave = (1 + Math.sin(2 * Math.PI * pulseRate * t)) / 2;

    const brightness = clamp(wave * intensityScale * 100, 0, 100);
    const color = lerpColor(secondaryColor, primaryColor, wave);

    return { color, brightness };
  },
};
