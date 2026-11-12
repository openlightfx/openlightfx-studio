import type { RGB } from '$lib/model/types';

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function clampByte(n: number): number {
  return clamp(Math.round(n), 0, 255);
}

export function rgbToHex(c: RGB): string {
  const h = (n: number) => clampByte(n).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

export function hexToRgb(hex: string): RGB {
  const cleaned = hex.replace(/^#/, '').trim();
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16)
  };
}

/**
 * Tanner Helland approximation, matching OpenLightFX.Emby InterpolationEngine.
 * Kelvin is clamped to 1000–40000 before conversion.
 */
export function kelvinToRgb(kelvin: number): RGB {
  const temp = clamp(kelvin, 1000, 40000) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b = 255;
  }
  return { r: clampByte(r), g: clampByte(g), b: clampByte(b) };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpByte(a: number, b: number, t: number): number {
  return clampByte(Math.round(a + (b - a) * t));
}

export function lerpUint(a: number, b: number, t: number): number {
  return Math.max(0, Math.round(a + (b - a) * t));
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return { r: lerpByte(a.r, b.r, t), g: lerpByte(a.g, b.g, t), b: lerpByte(a.b, b.b, t) };
}

/** Premultiply by brightness (0–100) for on-screen pixels. */
export function displayRgb(c: RGB, brightness: number): RGB {
  const k = clamp(brightness, 0, 100) / 100;
  return { r: clampByte(c.r * k), g: clampByte(c.g * k), b: clampByte(c.b * k) };
}

export function luminance(c: RGB): number {
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

export function readableText(c: RGB): string {
  return luminance(c) > 0.62 ? '#14181f' : '#f4f7fb';
}
