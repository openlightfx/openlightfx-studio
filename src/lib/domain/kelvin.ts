import { truncByte } from './round';
import type { Rgb } from './types';

/**
 * Tanner Helland conversion used by InterpolationEngine.ColorTempToRgb.
 * Kelvin is clamped to 1000–40000. Channels are clamped to 0–255 and truncated toward zero.
 */
export function kelvinToRgb(kelvin: number): Rgb {
  const temp = Math.min(40000, Math.max(1000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * (temp - 60) ** -0.1332047592;
    g = 288.1221695283 * (temp - 60) ** -0.0755148492;
    b = 255;
  }
  return { r: truncByte(r), g: truncByte(g), b: truncByte(b) };
}
