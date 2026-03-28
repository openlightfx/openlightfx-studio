import { describe, it, expect } from 'vitest';
import {
  EFFECT_TYPES,
  getEffectDisplayInfo,
  getDefaultEffectParams,
} from '$lib/services/effect-defaults';
import type { EffectType } from '$lib/types/track';

describe('EFFECT_TYPES', () => {
  it('has exactly 13 entries', () => {
    expect(EFFECT_TYPES).toHaveLength(13);
  });

  it('does not include EFFECT_UNSPECIFIED', () => {
    expect(EFFECT_TYPES).not.toContain('EFFECT_UNSPECIFIED');
  });

  it('contains all expected concrete effect types', () => {
    const expected: EffectType[] = [
      'LIGHTNING', 'FLAME', 'FLASHBANG', 'EXPLOSION', 'PULSE', 'STROBE',
      'SIREN', 'AURORA', 'CANDLE', 'GUNFIRE', 'NEON', 'BREATHING', 'SPARK',
    ];
    for (const type of expected) {
      expect(EFFECT_TYPES).toContain(type);
    }
  });
});

describe('getDefaultEffectParams', () => {
  it('LIGHTNING: flash_count=2, decay_ms=500', () => {
    expect(getDefaultEffectParams('LIGHTNING')).toEqual({ flash_count: 2, decay_ms: 500 });
  });

  it('FLASHBANG: flash_count=1, decay_ms=500', () => {
    expect(getDefaultEffectParams('FLASHBANG')).toEqual({ flash_count: 1, decay_ms: 500 });
  });

  it('EXPLOSION: flash_count=3, decay_ms=500', () => {
    expect(getDefaultEffectParams('EXPLOSION')).toEqual({ flash_count: 3, decay_ms: 500 });
  });

  it('GUNFIRE: flash_count=4, decay_ms=500', () => {
    expect(getDefaultEffectParams('GUNFIRE')).toEqual({ flash_count: 4, decay_ms: 500 });
  });

  it('SIREN: flash_count=8', () => {
    expect(getDefaultEffectParams('SIREN')).toEqual({ flash_count: 8 });
  });

  it('STROBE: flash_count=10', () => {
    expect(getDefaultEffectParams('STROBE')).toEqual({ flash_count: 10 });
  });

  it('FLAME: flicker_rate_hz=8.0, randomness=0.5', () => {
    expect(getDefaultEffectParams('FLAME')).toEqual({ flicker_rate_hz: 8.0, randomness: 0.5 });
  });

  it('CANDLE: flicker_rate_hz=3.0, randomness=0.5', () => {
    expect(getDefaultEffectParams('CANDLE')).toEqual({ flicker_rate_hz: 3.0, randomness: 0.5 });
  });

  it('NEON: flicker_rate_hz=15.0, randomness=0.5', () => {
    expect(getDefaultEffectParams('NEON')).toEqual({ flicker_rate_hz: 15.0, randomness: 0.5 });
  });

  it('AURORA: flicker_rate_hz=0.5, randomness=0.5', () => {
    expect(getDefaultEffectParams('AURORA')).toEqual({ flicker_rate_hz: 0.5, randomness: 0.5 });
  });

  it('PULSE: pulse_rate_hz=1.0', () => {
    expect(getDefaultEffectParams('PULSE')).toEqual({ pulse_rate_hz: 1.0 });
  });

  it('BREATHING: pulse_rate_hz=1.0', () => {
    expect(getDefaultEffectParams('BREATHING')).toEqual({ pulse_rate_hz: 1.0 });
  });

  it('SPARK: randomness=0.5', () => {
    expect(getDefaultEffectParams('SPARK')).toEqual({ randomness: 0.5 });
  });

  it('EFFECT_UNSPECIFIED returns empty object', () => {
    expect(getDefaultEffectParams('EFFECT_UNSPECIFIED')).toEqual({});
  });
});

describe('getEffectDisplayInfo', () => {
  it('returns valid info for all concrete effect types', () => {
    const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
    for (const type of EFFECT_TYPES) {
      const info = getEffectDisplayInfo(type);
      expect(info.label, `${type} should have a non-empty label`).toBeTruthy();
      expect(info.color, `${type} should have a valid hex color`).toMatch(hexColorPattern);
      expect(info.icon, `${type} should have a non-empty icon`).toBeTruthy();
      expect(info.description, `${type} should have a non-empty description`).toBeTruthy();
      expect(info.defaultDurationMs, `${type} should have a positive duration`).toBeGreaterThan(0);
    }
  });

  it('EFFECT_UNSPECIFIED returns a fallback with valid hex color', () => {
    const info = getEffectDisplayInfo('EFFECT_UNSPECIFIED');
    expect(info.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(info.label).toBeTruthy();
    expect(info.icon).toBeTruthy();
  });

  it('LIGHTNING has expected label and color', () => {
    const info = getEffectDisplayInfo('LIGHTNING');
    expect(info.label).toBe('Lightning');
    expect(info.color).toBe('#fbbf24');
  });

  it('FLAME has expected label', () => {
    expect(getEffectDisplayInfo('FLAME').label).toBe('Flame');
  });

  it('PULSE has expected label', () => {
    expect(getEffectDisplayInfo('PULSE').label).toBe('Pulse');
  });

  it('AURORA has expected label', () => {
    expect(getEffectDisplayInfo('AURORA').label).toBe('Aurora');
  });
});
