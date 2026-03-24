// ============================================================
// Color Utilities — pure color conversion and manipulation
// ============================================================

import type { RGBColor } from '$lib/types/index.js';

export function clampColorComponent(value: number): number {
  return Math.round(Math.min(255, Math.max(0, value)));
}

export function clampBrightness(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function rgbToHsl(color: RGBColor): { h: number; s: number; l: number } {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb(h: number, s: number, l: number): RGBColor {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const hNorm = ((h % 360) + 360) % 360;

  if (sNorm === 0) {
    const gray = clampColorComponent(lNorm * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
  const p = 2 * lNorm - q;
  const hFrac = hNorm / 360;

  return {
    r: clampColorComponent(hue2rgb(p, q, hFrac + 1 / 3) * 255),
    g: clampColorComponent(hue2rgb(p, q, hFrac) * 255),
    b: clampColorComponent(hue2rgb(p, q, hFrac - 1 / 3) * 255),
  };
}

export function rgbToHex(color: RGBColor): string {
  const toHex = (v: number) =>
    clampColorComponent(v).toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export function hexToRgb(hex: string): RGBColor | null {
  const cleaned = hex.replace(/^#/, '');

  let fullHex: string;
  if (cleaned.length === 3) {
    fullHex = cleaned
      .split('')
      .map((c) => c + c)
      .join('');
  } else if (cleaned.length === 6) {
    fullHex = cleaned;
  } else {
    return null;
  }

  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) {
    return null;
  }

  return {
    r: parseInt(fullHex.substring(0, 2), 16),
    g: parseInt(fullHex.substring(2, 4), 16),
    b: parseInt(fullHex.substring(4, 6), 16),
  };
}

/**
 * Approximate RGB from color temperature in Kelvin.
 * Based on Tanner Helland's algorithm.
 */
export function kelvinToRgb(kelvin: number): RGBColor {
  const temp = Math.min(40000, Math.max(1000, kelvin)) / 100;

  let r: number;
  let g: number;
  let b: number;

  if (temp <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
  }

  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }

  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  }

  return {
    r: clampColorComponent(r),
    g: clampColorComponent(g),
    b: clampColorComponent(b),
  };
}

export function interpolateColor(a: RGBColor, b: RGBColor, t: number): RGBColor {
  const clamped = Math.min(1, Math.max(0, t));
  return {
    r: clampColorComponent(a.r + (b.r - a.r) * clamped),
    g: clampColorComponent(a.g + (b.g - a.g) * clamped),
    b: clampColorComponent(a.b + (b.b - a.b) * clamped),
  };
}

export function rgbToCssString(color: RGBColor): string {
  return `rgb(${clampColorComponent(color.r)}, ${clampColorComponent(color.g)}, ${clampColorComponent(color.b)})`;
}

export function rgbToCssStringWithAlpha(color: RGBColor, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${clampColorComponent(color.r)}, ${clampColorComponent(color.g)}, ${clampColorComponent(color.b)}, ${a})`;
}

export function areColorsEqual(a: RGBColor, b: RGBColor): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}
