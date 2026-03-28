import { describe, it, expect } from 'vitest';
import { validateTrack } from '../../src/lib/services/validation.js';
import type { LightFXTrack } from '../../src/lib/types/index.js';

function emptyTrack(): LightFXTrack {
  return {
    version: 1,
    metadata: {
      title: '', description: '', author: '', tags: [], durationMs: 0,
      movieReference: { imdbId: '', title: '', year: 0, runtimeMinutes: 0 },
      startBehavior: 'LEAVE', endBehavior: 'LEAVE',
      preshowDurationMs: 0, preshowState: 'PRESHOW_UNSPECIFIED',
      creditsStartMs: 0, creditsBehavior: 'CREDITS_UNSPECIFIED', trackVersion: '1.0',
    },
    channels: [],
    keyframes: [],
    effectKeyframes: [],
    safetyInfo: {
      containsFlashing: false, containsStrobing: false,
      maxFlashFrequencyHz: 0, maxBrightnessDelta: 0,
      warningText: '', intensityRating: 'SUBTLE',
    },
  };
}

describe('validateTrack', () => {
  it('passes for empty valid track', () => {
    const result = validateTrack(emptyTrack());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for duplicate channel IDs', () => {
    const track = emptyTrack();
    track.channels = [
      { id: 'a', displayName: 'A', description: '', defaultColor: { r: 0, g: 0, b: 0 }, defaultBrightness: 0, spatialHint: 'SPATIAL_UNSPECIFIED', optional: true },
      { id: 'a', displayName: 'B', description: '', defaultColor: { r: 0, g: 0, b: 0 }, defaultBrightness: 0, spatialHint: 'SPATIAL_UNSPECIFIED', optional: true },
    ];
    const result = validateTrack(track);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('fails for invalid channel ID format', () => {
    const track = emptyTrack();
    track.channels = [
      { id: 'INVALID ID!', displayName: 'A', description: '', defaultColor: { r: 0, g: 0, b: 0 }, defaultBrightness: 0, spatialHint: 'SPATIAL_UNSPECIFIED', optional: true },
    ];
    const result = validateTrack(track);
    expect(result.valid).toBe(false);
  });

  it('fails for orphaned keyframe channel reference', () => {
    const track = emptyTrack();
    track.channels = [
      { id: 'a', displayName: 'A', description: '', defaultColor: { r: 0, g: 0, b: 0 }, defaultBrightness: 0, spatialHint: 'SPATIAL_UNSPECIFIED', optional: true },
    ];
    track.keyframes = [
      { id: 'k1', channelId: 'nonexistent', timestampMs: 0, colorMode: 'RGB', color: { r: 0, g: 0, b: 0 }, colorTemperature: 0, brightness: 0, transitionMs: 0, interpolation: 'STEP', powerOn: false },
    ];
    const result = validateTrack(track);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent'))).toBe(true);
  });
});
