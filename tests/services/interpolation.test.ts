import { describe, it, expect } from 'vitest';
import { getChannelStateAtTime } from '../../src/lib/services/interpolation.js';
import type { Keyframe, RGBColor } from '../../src/lib/types/index.js';

function makeKeyframe(overrides: Partial<Keyframe> & { timestampMs: number; channelId: string }): Keyframe {
  return {
    id: 'kf-' + overrides.timestampMs,
    colorMode: 'RGB',
    color: { r: 0, g: 0, b: 0 },
    colorTemperature: 4000,
    brightness: 100,
    transitionMs: 0,
    interpolation: 'STEP',
    powerOn: true,
    ...overrides,
  };
}

describe('getChannelStateAtTime', () => {
  it('returns null for empty keyframes', () => {
    expect(getChannelStateAtTime([], 1000)).toBeNull();
  });

  it('returns the only keyframe when at its time', () => {
    const kfs = [makeKeyframe({ channelId: 'a', timestampMs: 0, brightness: 50 })];
    const state = getChannelStateAtTime(kfs, 0);
    expect(state?.brightness).toBe(50);
  });

  it('holds STEP value until next keyframe', () => {
    const kfs = [
      makeKeyframe({ channelId: 'a', timestampMs: 0, brightness: 50 }),
      makeKeyframe({ channelId: 'a', timestampMs: 1000, brightness: 100, interpolation: 'STEP' }),
    ];
    const state = getChannelStateAtTime(kfs, 500);
    expect(state?.brightness).toBe(50);
  });

  it('interpolates LINEAR between keyframes', () => {
    const kfs = [
      makeKeyframe({ channelId: 'a', timestampMs: 0, brightness: 0, color: { r: 0, g: 0, b: 0 } }),
      makeKeyframe({ channelId: 'a', timestampMs: 1000, brightness: 100, color: { r: 200, g: 100, b: 50 }, interpolation: 'LINEAR' }),
    ];
    const state = getChannelStateAtTime(kfs, 500);
    expect(state?.brightness).toBe(50);
    expect(state?.color.r).toBe(100);
  });

  it('returns last keyframe state after it', () => {
    const kfs = [makeKeyframe({ channelId: 'a', timestampMs: 0, brightness: 75 })];
    const state = getChannelStateAtTime(kfs, 5000);
    expect(state?.brightness).toBe(75);
  });

  it('returns null before first keyframe', () => {
    const kfs = [makeKeyframe({ channelId: 'a', timestampMs: 1000 })];
    expect(getChannelStateAtTime(kfs, 500)).toBeNull();
  });
});
