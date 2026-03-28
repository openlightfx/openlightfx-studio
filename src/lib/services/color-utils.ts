import type { RGBColor } from '$lib/types/index.js';

export interface HSLColor {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export function rgbToHex(color: RGBColor): string {
  const r = color.r.toString(16).padStart(2, '0');
  const g = color.g.toString(16).padStart(2, '0');
  const b = color.b.toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function hexToRgb(hex: string): RGBColor | null {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbToHsl(color: RGBColor): HSLColor {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb(hsl: HSLColor): RGBColor {
  const s = hsl.s / 100;
  const l = hsl.l / 100;
  const h = hsl.h / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

export function kelvinToRgb(kelvin: number): RGBColor {
  const temp = kelvin / 100;
  let r: number, g: number, b: number;
  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b = 255;
  }
  return clampRgb({ r: Math.round(r), g: Math.round(g), b: Math.round(b) });
}

export function rgbToNearestKelvin(color: RGBColor): number {
  let bestK = 1000;
  let bestDist = Infinity;
  for (let k = 1000; k <= 10000; k += 100) {
    const ref = kelvinToRgb(k);
    const dist = Math.sqrt(
      (color.r - ref.r) ** 2 + (color.g - ref.g) ** 2 + (color.b - ref.b) ** 2,
    );
    if (dist < bestDist) {
      bestDist = dist;
      bestK = k;
    }
  }
  return bestK;
}

export function interpolateColor(a: RGBColor, b: RGBColor, t: number): RGBColor {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

export function clampRgb(color: RGBColor): RGBColor {
  return {
    r: Math.max(0, Math.min(255, color.r)),
    g: Math.max(0, Math.min(255, color.g)),
    b: Math.max(0, Math.min(255, color.b)),
  };
}

export function rgbEqual(a: RGBColor, b: RGBColor): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

export function rgbToCssString(color: RGBColor, alpha = 1): string {
  if (alpha < 1) return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}
