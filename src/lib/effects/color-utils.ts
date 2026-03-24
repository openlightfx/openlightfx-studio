import type { RGBColor } from '../types/track.js';

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Linear interpolation between two numbers */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linear interpolation between two RGB colors */
export function lerpColor(c1: RGBColor, c2: RGBColor, t: number): RGBColor {
  const ct = clamp(t, 0, 1);
  return {
    r: Math.round(lerp(c1.r, c2.r, ct)),
    g: Math.round(lerp(c1.g, c2.g, ct)),
    b: Math.round(lerp(c1.b, c2.b, ct)),
  };
}
