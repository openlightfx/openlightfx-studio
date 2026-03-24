import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp, lerpColor } from '../color-utils.js';

/**
 * BREATHING: Slow sinusoidal brightness oscillation.
 * Uses a smoothed sine wave (raised cosine) for a natural breathing feel.
 * Smoother and gentler than PULSE — uses cos-based easing for organic rhythm.
 */
export const breathingRenderer: IEffectRenderer = {
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

    // Raised cosine for smooth breathing feel (starts dim, rises, falls)
    const wave = (1 - Math.cos(2 * Math.PI * pulseRate * t)) / 2;
    // Ease the wave for more organic feel
    const eased = wave * wave * (3 - 2 * wave); // smoothstep

    const brightness = clamp(eased * intensityScale * 100, 0, 100);
    const color = lerpColor(secondaryColor, primaryColor, eased);

    return { color, brightness };
  },
};
