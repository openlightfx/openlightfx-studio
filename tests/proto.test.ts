import { describe, expect, it } from 'vitest';
import { createSampleTrack, createStressTrack } from '$lib/model/sample';
import { emptyTrack, makeEffect, makeKeyframe, rgb } from '$lib/model/types';
import { validateTrack } from '$lib/model/validate';
import { decodeTrack, encodeTrack } from '$lib/proto/codec';

function roundTrip<T>(value: T): T {
  return structuredClone(value);
}

describe('lightfx protobuf', () => {
  it('round-trips the sample track and stays valid for TrackParser', () => {
    const track = createSampleTrack();
    expect(validateTrack(track)).toEqual([]);
    const bytes = encodeTrack(track);
    expect(bytes[0]).toBe(0x08);
    expect(bytes[1]).toBe(0x01);
    expect(encodeTrack(track)).toEqual(bytes);
    const decoded = decodeTrack(bytes);
    expect(validateTrack(decoded)).toEqual([]);
    expect(decoded.version).toBe(1);
    expect(decoded.metadata).toEqual(track.metadata);
    expect(decoded.channels).toEqual(track.channels);
    expect(decoded.safetyInfo).toEqual(track.safetyInfo);
    const byId = new Map(decoded.keyframes.map((kf) => [kf.id, kf]));
    for (const kf of track.keyframes) expect(byId.get(kf.id)).toEqual(kf);
    const effects = new Map(decoded.effectKeyframes.map((fx) => [fx.id, fx]));
    for (const fx of track.effectKeyframes) expect(effects.get(fx.id)).toEqual(fx);
    expect(roundTrip(decoded.metadata.title)).toBe('Glass Harbor');
  });

  it('preserves enums, kelvin, power, and effect params', () => {
    const track = emptyTrack();
    track.metadata.title = 'Enums';
    track.metadata.durationMs = 10_000;
    track.metadata.movieReference.imdbId = 'tt1234567';
    track.metadata.startBehavior = 'LEAVE';
    track.metadata.endBehavior = 'ON';
    track.metadata.preshowDurationMs = 1500;
    track.metadata.preshowState = 'PRESHOW_WARM';
    track.metadata.creditsStartMs = 8000;
    track.metadata.creditsBehavior = 'CREDITS_OFF';
    track.metadata.tags = ['night', 'test'];
    track.channels[0].optional = true;
    track.channels[0].defaultBrightness = 12;
    track.channels[0].defaultColor = rgb(1, 2, 3);
    track.keyframes.push(
      makeKeyframe({
        id: 'step',
        channelId: 'main',
        timestampMs: 2000,
        interpolation: 'STEP',
        colorMode: 'COLOR_TEMPERATURE',
        colorTemperature: 2700,
        color: rgb(9, 9, 9),
        brightness: 33,
        transitionMs: 400,
        powerOn: true
      })
    );
    track.effectKeyframes.push(
      makeEffect({
        id: 'fx',
        channelId: 'main',
        timestampMs: 3000,
        durationMs: 1500,
        effectType: 'SIREN',
        intensity: 70,
        primaryColor: rgb(255, 0, 0),
        secondaryColor: rgb(0, 0, 255),
        effectParams: { flash_count: 8, randomness: 0.25 },
        requiredCapability: 'CAPABILITY_RGB',
        fallbackColor: rgb(4, 5, 6),
        fallbackBrightness: 11
      })
    );
    track.safetyInfo = {
      containsFlashing: true,
      containsStrobing: false,
      maxFlashFrequencyHz: 4.5,
      maxBrightnessDelta: 80,
      warningText: 'flashes',
      intensityRating: 'INTENSE'
    };
    const decoded = decodeTrack(encodeTrack(track));
    expect(decoded.keyframes[0]).toEqual(track.keyframes[0]);
    expect(decoded.effectKeyframes[0].effectParams).toEqual({ flash_count: 8, randomness: 0.25 });
    expect(decoded.effectKeyframes[0].effectType).toBe('SIREN');
    expect(decoded.metadata.creditsBehavior).toBe('CREDITS_OFF');
    expect(decoded.channels[0].optional).toBe(true);
    expect(decoded.safetyInfo).toEqual(track.safetyInfo);
    expect(validateTrack(decoded)).toEqual([]);
  });

  it('sorts keyframes so each channel is monotonic on the wire', () => {
    const track = emptyTrack();
    track.metadata.durationMs = 5000;
    track.metadata.title = 'Order';
    track.keyframes.push(
      makeKeyframe({ id: 'b', channelId: 'main', timestampMs: 2000, transitionMs: 0, brightness: 10 }),
      makeKeyframe({ id: 'a', channelId: 'main', timestampMs: 1000, transitionMs: 0, brightness: 20 })
    );
    expect(validateTrack(track).some((issue) => issue.code === 'V-006')).toBe(true);
    const decoded = decodeTrack(encodeTrack(track));
    expect(decoded.keyframes.map((kf) => kf.id)).toEqual(['a', 'b']);
    expect(validateTrack(decoded)).toEqual([]);
  });

  it('round-trips a dense two-hour track', () => {
    const track = createStressTrack(120, 4);
    expect(validateTrack(track)).toEqual([]);
    const decoded = decodeTrack(encodeTrack(track));
    expect(decoded.keyframes).toHaveLength(track.keyframes.length);
    expect(decoded.metadata.durationMs).toBe(2 * 60 * 60 * 1000);
    expect(validateTrack(decoded)).toEqual([]);
  });

  it('rejects the same cases TrackParser rejects', () => {
    const track = emptyTrack();
    track.version = 0;
    track.metadata.durationMs = 0;
    track.metadata.movieReference.imdbId = 'bad';
    track.channels.push({ ...track.channels[0] });
    track.keyframes.push(
      makeKeyframe({
        id: 'late',
        channelId: 'missing',
        timestampMs: 50,
        brightness: 140,
        transitionMs: 80,
        color: rgb(300, 0, 0)
      })
    );
    track.effectKeyframes.push(
      makeEffect({ id: 'empty', channelId: 'main', timestampMs: 0, durationMs: 0, intensity: 140 })
    );
    const codes = validateTrack(track).map((issue) => issue.code);
    for (const code of ['V-001', 'V-003', 'V-004', 'V-005', 'V-006', 'V-007', 'V-008', 'V-012', 'V-013', 'V-014']) {
      expect(codes).toContain(code);
    }
  });
});
