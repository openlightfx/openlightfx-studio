import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp, lerpColor } from '../color-utils.js';

const CANDLE_WARM: RGBColor = { r: 255, g: 160, b: 50 };
const CANDLE_DIM: RGBColor = { r: 200, g: 100, b: 20 };

/**
 * CANDLE: Subtle warm flicker, gentler than flame.
 * Uses layered sine waves at lower amplitude. The flicker_rate_hz is
 * typically 3.0 (slower than flame's 8.0) and the brightness range is narrower.
 */
export const candleRenderer: IEffectRenderer = {
  sample(
    timeOffsetMs: number,
    _durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    _secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample {
    const flickerRate = params.flicker_rate_hz ?? 3.0;
    const randomness = params.randomness ?? 0.5;
    const intensityScale = intensity / 100;

    const t = timeOffsetMs / 1000;

    // Gentle pseudo-noise from sine combinations (smaller amplitudes than flame)
    const n1 = Math.sin(2 * Math.PI * flickerRate * t);
    const n2 = Math.sin(2 * Math.PI * flickerRate * 1.4 * t + 0.8);
    const n3 = Math.sin(2 * Math.PI * flickerRate * 0.5 * t + 3.2);
    const noise = (n1 * 0.4 + n2 * 0.35 + n3 * 0.25) * randomness * 0.5;

    // Narrow brightness range centered around 0.7
    const baseBrightness = 0.7 + 0.3 * noise;
    const brightness = clamp(baseBrightness * intensityScale * 100, 0, 100);

    // Subtle color variation between warm tones
    const colorBlend = (1 + n2) / 2;
    const warmColor = lerpColor(CANDLE_WARM, CANDLE_DIM, colorBlend * 0.3);
    const color = lerpColor(warmColor, primaryColor, 0.25);

    return { color, brightness };
  },
};
