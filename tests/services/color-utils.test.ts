import { describe, it, expect } from 'vitest';
import {
  rgbToHex, hexToRgb, rgbToHsl, hslToRgb,
  kelvinToRgb, rgbToNearestKelvin, interpolateColor,
  clampRgb, rgbEqual,
} from '../../src/lib/services/color-utils.js';

describe('rgbToHex', () => {
  it('converts black', () => {
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
  });
  it('converts white', () => {
    expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff');
  });
  it('converts a color', () => {
    expect(rgbToHex({ r: 108, g: 99, b: 255 })).toBe('#6c63ff');
  });
});

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgb('#6c63ff')).toEqual({ r: 108, g: 99, b: 255 });
  });
  it('parses 3-digit hex', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });
  it('parses without hash', () => {
    expect(hexToRgb('6c63ff')).toEqual({ r: 108, g: 99, b: 255 });
  });
  it('returns null for invalid input', () => {
    expect(hexToRgb('xyz')).toBeNull();
  });
});

describe('rgbToHsl / hslToRgb', () => {
  it('round-trips red', () => {
    const rgb = { r: 255, g: 0, b: 0 };
    const hsl = rgbToHsl(rgb);
    expect(hsl.h).toBeCloseTo(0);
    expect(hsl.s).toBeCloseTo(100);
    expect(hsl.l).toBeCloseTo(50);
    const back = hslToRgb(hsl);
    expect(back.r).toBe(255);
    expect(back.g).toBe(0);
    expect(back.b).toBe(0);
  });
  it('round-trips gray', () => {
    const rgb = { r: 128, g: 128, b: 128 };
    const hsl = rgbToHsl(rgb);
    expect(hsl.s).toBeCloseTo(0);
    const back = hslToRgb(hsl);
    expect(back.r).toBe(128);
  });
});

describe('kelvinToRgb', () => {
  it('returns warm color at 2000K', () => {
    const rgb = kelvinToRgb(2000);
    expect(rgb.r).toBeGreaterThan(rgb.b);
  });
  it('returns cool color at 9000K', () => {
    const rgb = kelvinToRgb(9000);
    expect(rgb.b).toBeGreaterThan(rgb.r);
  });
  it('returns near-white at ~6500K', () => {
    const rgb = kelvinToRgb(6500);
    expect(Math.abs(rgb.r - rgb.b)).toBeLessThan(30);
  });
});

describe('rgbToNearestKelvin', () => {
  it('maps warm orange to low kelvin', () => {
    const k = rgbToNearestKelvin({ r: 255, g: 147, b: 41 });
    expect(k).toBeGreaterThanOrEqual(1000);
    expect(k).toBeLessThan(3000);
  });
});

describe('interpolateColor', () => {
  it('returns start at t=0', () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 255, g: 255, b: 255 };
    expect(interpolateColor(a, b, 0)).toEqual(a);
  });
  it('returns end at t=1', () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 255, g: 255, b: 255 };
    expect(interpolateColor(a, b, 1)).toEqual(b);
  });
  it('returns midpoint at t=0.5', () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 200, g: 100, b: 50 };
    const mid = interpolateColor(a, b, 0.5);
    expect(mid.r).toBe(100);
    expect(mid.g).toBe(50);
    expect(mid.b).toBe(25);
  });
});

describe('clampRgb', () => {
  it('clamps values to 0-255', () => {
    expect(clampRgb({ r: -10, g: 300, b: 128 })).toEqual({ r: 0, g: 255, b: 128 });
  });
});

describe('rgbEqual', () => {
  it('returns true for same colors', () => {
    expect(rgbEqual({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 })).toBe(true);
  });
  it('returns false for different colors', () => {
    expect(rgbEqual({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 31 })).toBe(false);
  });
});
