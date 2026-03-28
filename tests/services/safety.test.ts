import { describe, it, expect } from 'vitest';
import { computeSafetyInfo } from '../../src/lib/services/safety.js';
import type { Keyframe, EffectKeyframe } from '../../src/lib/types/index.js';

describe('computeSafetyInfo', () => {
  it('returns SUBTLE for empty track', () => {
    const info = computeSafetyInfo([], []);
    expect(info.intensityRating).toBe('SUBTLE');
    expect(info.containsFlashing).toBe(false);
    expect(info.containsStrobing).toBe(false);
    expect(info.maxFlashFrequencyHz).toBe(0);
    expect(info.maxBrightnessDelta).toBe(0);
  });

  it('detects flashing from LIGHTNING effect', () => {
    const effects: EffectKeyframe[] = [{
      id: 'e1', channelId: 'a', timestampMs: 0, durationMs: 2000,
      effectType: 'LIGHTNING', intensity: 100,
      primaryColor: { r: 255, g: 255, b: 255 },
      secondaryColor: { r: 0, g: 0, b: 0 },
      effectParams: { params: { flash_count: 3 } },
      requiredCapability: 'CAPABILITY_ANY',
      fallbackColor: { r: 255, g: 255, b: 255 }, fallbackBrightness: 100,
    }];
    const info = computeSafetyInfo([], effects);
    expect(info.containsFlashing).toBe(true);
    expect(info.maxFlashFrequencyHz).toBeGreaterThan(0);
  });

  it('detects strobing from STROBE effect', () => {
    const effects: EffectKeyframe[] = [{
      id: 'e1', channelId: 'a', timestampMs: 0, durationMs: 2000,
      effectType: 'STROBE', intensity: 100,
      primaryColor: { r: 255, g: 255, b: 255 },
      secondaryColor: { r: 0, g: 0, b: 0 },
      effectParams: { params: { flash_count: 10 } },
      requiredCapability: 'CAPABILITY_ANY',
      fallbackColor: { r: 255, g: 255, b: 255 }, fallbackBrightness: 100,
    }];
    const info = computeSafetyInfo([], effects);
    expect(info.containsStrobing).toBe(true);
    expect(info.intensityRating).toBe('EXTREME');
  });

  it('computes max brightness delta from keyframes', () => {
    const kfs: Keyframe[] = [
      { id: 'k1', channelId: 'a', timestampMs: 0, colorMode: 'RGB', color: { r: 0, g: 0, b: 0 }, colorTemperature: 0, brightness: 10, transitionMs: 0, interpolation: 'STEP', powerOn: true },
      { id: 'k2', channelId: 'a', timestampMs: 1000, colorMode: 'RGB', color: { r: 255, g: 255, b: 255 }, colorTemperature: 0, brightness: 90, transitionMs: 0, interpolation: 'STEP', powerOn: true },
    ];
    const info = computeSafetyInfo(kfs, []);
    expect(info.maxBrightnessDelta).toBe(80);
  });
});
