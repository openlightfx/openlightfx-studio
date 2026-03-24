import type { IEffectRenderer, EffectSample } from '../../types/effects.js';
import type { RGBColor } from '../../types/track.js';
import { clamp } from '../color-utils.js';

/**
 * STROBE: Rapid on/off flashing. Square wave toggling between full brightness
 * and off, with flash_count flashes over the duration.
 */
export const strobeRenderer: IEffectRenderer = {
  sample(
    timeOffsetMs: number,
    durationMs: number,
    intensity: number,
    primaryColor: RGBColor,
    _secondaryColor: RGBColor,
    params: Record<string, number>
  ): EffectSample {
    const flashCount = Math.round(params.flash_count ?? 10);
    const intensityScale = intensity / 100;

    if (durationMs <= 0) return { color: { r: 0, g: 0, b: 0 }, brightness: 0 };

    // Each flash has an on phase (40%) and off phase (60%)
    const cycleMs = durationMs / flashCount;
    const phase = cycleMs > 0 ? (timeOffsetMs % cycleMs) / cycleMs : 0;
    const isOn = phase < 0.4;

    const brightness = isOn ? clamp(intensityScale * 100, 0, 100) : 0;
    const color = isOn ? primaryColor : { r: 0, g: 0, b: 0 };

    return { color, brightness };
  },
};
