import { describe, it, expect } from 'vitest';
import { applyMirror, applySpread, applyAlternate } from '$lib/services/channel-groups.js';
import type { Keyframe } from '$lib/types/track.js';

function makeKf(overrides: Partial<Keyframe> = {}): Keyframe {
  return {
    id: 'kf-1', channelId: 'ch-source', timestampMs: 1000,
    colorMode: 'RGB', color: { r: 255, g: 0, b: 0 }, colorTemperature: 6500,
    brightness: 100, transitionMs: 0, interpolation: 'STEP', powerOn: true,
    ...overrides,
  };
}

describe('applyMirror', () => {
  it('replicates keyframe to all target channels', () => {
    const source = makeKf();
    const result = applyMirror(source, ['ch-a', 'ch-b'], () => 'new-id');
    expect(result).toHaveLength(2);
    expect(result[0].channelId).toBe('ch-a');
    expect(result[1].channelId).toBe('ch-b');
    expect(result[0].color).toEqual({ r: 255, g: 0, b: 0 });
    expect(result[0].timestampMs).toBe(1000);
  });
});

describe('applySpread', () => {
  it('replicates with time offset per channel', () => {
    const source = makeKf();
    const offsets = [
      { channelId: 'ch-a', hueOffset: 0, brightnessOffset: 0, timingOffsetMs: 0 },
      { channelId: 'ch-b', hueOffset: 0, brightnessOffset: 0, timingOffsetMs: 150 },
      { channelId: 'ch-c', hueOffset: 0, brightnessOffset: 0, timingOffsetMs: 300 },
    ];
    const result = applySpread(source, offsets, () => 'new-id');
    expect(result).toHaveLength(3);
    expect(result[0].timestampMs).toBe(1000);
    expect(result[1].timestampMs).toBe(1150);
    expect(result[2].timestampMs).toBe(1300);
  });
});

describe('applyAlternate', () => {
  it('places keyframe only on the next channel in round-robin', () => {
    const source = makeKf();
    const channels = ['ch-a', 'ch-b', 'ch-c'];
    const result0 = applyAlternate(source, channels, 0, () => 'new-id');
    expect(result0).toHaveLength(1);
    expect(result0[0].channelId).toBe('ch-a');
    const result1 = applyAlternate(source, channels, 1, () => 'new-id');
    expect(result1[0].channelId).toBe('ch-b');
    const result3 = applyAlternate(source, channels, 3, () => 'new-id');
    expect(result3[0].channelId).toBe('ch-a');
  });
});
