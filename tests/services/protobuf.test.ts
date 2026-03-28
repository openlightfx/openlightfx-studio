import { describe, it, expect } from 'vitest';
import { encodeLightFXTrack, decodeLightFXTrack } from '../../src/lib/services/protobuf.js';
import type { LightFXTrack } from '../../src/lib/types/index.js';

function minimalTrack(): LightFXTrack {
  return {
    version: 1,
    metadata: {
      title: 'Test Track', description: 'A test', author: 'Tester', tags: ['test'],
      durationMs: 120000,
      movieReference: { imdbId: 'tt0000001', title: 'Test Movie', year: 2024, runtimeMinutes: 120 },
      startBehavior: 'LEAVE', endBehavior: 'OFF',
      preshowDurationMs: 0, preshowState: 'PRESHOW_UNSPECIFIED',
      creditsStartMs: 0, creditsBehavior: 'CREDITS_CONTINUE', trackVersion: '1.0',
    },
    channels: [
      { id: 'ambient', displayName: 'Ambient', description: '', defaultColor: { r: 0, g: 0, b: 0 }, defaultBrightness: 0, spatialHint: 'SPATIAL_AMBIENT', optional: true },
    ],
    keyframes: [
      { id: 'k1', channelId: 'ambient', timestampMs: 0, colorMode: 'RGB', color: { r: 255, g: 100, b: 50 }, colorTemperature: 0, brightness: 80, transitionMs: 0, interpolation: 'STEP', powerOn: false },
    ],
    effectKeyframes: [],
    safetyInfo: { containsFlashing: false, containsStrobing: false, maxFlashFrequencyHz: 0, maxBrightnessDelta: 0, warningText: '', intensityRating: 'SUBTLE' },
  };
}

describe('protobuf encode/decode', () => {
  it('round-trips a minimal track', async () => {
    const track = minimalTrack();
    const bytes = await encodeLightFXTrack(track);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    const decoded = await decodeLightFXTrack(bytes);
    expect(decoded.version).toBe(1);
    expect(decoded.metadata.title).toBe('Test Track');
    expect(decoded.channels).toHaveLength(1);
    expect(decoded.channels[0].id).toBe('ambient');
    expect(decoded.keyframes).toHaveLength(1);
    expect(decoded.keyframes[0].color.r).toBe(255);
    expect(decoded.keyframes[0].brightness).toBe(80);
  });
});
