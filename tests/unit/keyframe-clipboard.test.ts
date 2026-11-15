// ED2-019 @unit
import { describe, expect, it } from 'vitest';
import type { Track, Keyframe } from '../../src/lib/domain/types';
import {
  copyKeyframes,
  materializeKeyframePaste,
  planKeyframePaste,
} from '../../src/lib/domain/keyframe-clipboard';

const frame = (
  id: string,
  channelId: string,
  timestampMs: number,
  patch: Partial<Keyframe> = {}
): Keyframe => ({
  id,
  channelId,
  timestampMs,
  colorMode: 'RGB',
  color: { r: 12, g: 34, b: 56 },
  colorTemperature: 3200,
  brightness: 73,
  transitionMs: 0,
  interpolation: 'LINEAR',
  powerOn: true,
  ...patch,
});
const track = (
  channels = [
    {
      id: 'left',
      displayName: 'Left',
      spatialHint: 'SPATIAL_LEFT',
      defaultColor: { r: 0, g: 0, b: 0 },
      defaultBrightness: 100,
      optional: false,
    },
    {
      id: 'right',
      displayName: 'Right',
      spatialHint: 'SPATIAL_RIGHT',
      defaultColor: { r: 0, g: 0, b: 0 },
      defaultBrightness: 100,
      optional: false,
    },
  ]
): Track => ({
  version: 1,
  metadata: {
    title: 'Movie',
    description: '',
    author: '',
    tags: [],
    imdbId: '',
    movieTitle: '',
    year: 0,
    durationMs: 10000,
    channelLayout: 'LAYOUT_2_0',
  },
  channels,
  keyframes: [],
  effects: [],
  safety: null,
});
const allocator =
  (calls: string[] = []) =>
  (prefix: string) => {
    calls.push(prefix);
    return `new-${calls.length}`;
  };

describe('ED2-019 atomic typed keyframe clipboard', () => {
  it('copies a detached, deeply immutable complete keyframe value and preserves exact offsets including zero', () => {
    const source = track();
    source.keyframes = [
      frame('a', 'left', 0),
      frame('b', 'left', 37, {
        colorMode: 'COLOR_TEMPERATURE',
        colorTemperature: 4500,
        transitionMs: 12,
        powerOn: false,
      }),
    ];
    const payload = copyKeyframes(source, ['a', 'b'])!;
    source.keyframes[1].color.r = 255;
    expect(payload.anchorMs).toBe(0);
    expect(payload.keyframes.map((entry) => entry.offsetMs)).toEqual([0, 37]);
    expect(payload.keyframes[1].value).toMatchObject({
      colorMode: 'COLOR_TEMPERATURE',
      colorTemperature: 4500,
      brightness: 73,
      transitionMs: 12,
      powerOn: false,
      color: { r: 12, g: 34, b: 56 },
    });
    expect(Object.isFrozen(payload.keyframes[1].value.color)).toBe(true);
    const plan = planKeyframePaste(track(), payload, 400, 'right', 0);
    expect(plan.accepted && plan.keyframes.map((key) => key.timestampMs)).toEqual([400, 437]);
  });

  it('maps multi-lane clipboard by position and rejects missing center/surround lanes atomically', () => {
    const source = track([
      {
        id: 'c',
        displayName: 'Center',
        spatialHint: 'SPATIAL_CENTER',
        defaultColor: { r: 0, g: 0, b: 0 },
        defaultBrightness: 100,
        optional: false,
      },
      {
        id: 'sl',
        displayName: 'Surround',
        spatialHint: 'SPATIAL_SURROUND_LEFT',
        defaultColor: { r: 0, g: 0, b: 0 },
        defaultBrightness: 100,
        optional: false,
      },
    ]);
    source.keyframes = [frame('c1', 'c', 10), frame('s1', 'sl', 20)];
    const payload = copyKeyframes(source, ['c1', 's1'])!;
    expect(planKeyframePaste(track(), payload, 100, 'left', 0)).toEqual({
      accepted: false,
      reason: 'missing-position',
    });
    const destination = track([
      ...source.channels,
      {
        id: 'r',
        displayName: 'Right',
        spatialHint: 'SPATIAL_RIGHT',
        defaultColor: { r: 0, g: 0, b: 0 },
        defaultBrightness: 100,
        optional: false,
      },
    ]);
    const plan = planKeyframePaste(destination, payload, 100, null, 0);
    expect(
      plan.accepted && plan.keyframes.map(({ channelId, timestampMs }) => [channelId, timestampMs])
    ).toEqual([
      ['c', 100],
      ['sl', 110],
    ]);
  });

  it('rejects end overflow, fade-before-zero, existing and intra-paste spacing collisions without allocating IDs', () => {
    const source = track();
    source.keyframes = [frame('a', 'left', 0), frame('b', 'left', 50)];
    const payload = copyKeyframes(source, ['a', 'b'])!;
    const calls: string[] = [];
    const collision = { ...track(), keyframes: [frame('occupied', 'right', 150)] };
    const rejected = planKeyframePaste(collision, payload, 100, 'right', 5);
    expect(rejected).toEqual({ accepted: false, reason: 'spacing-collision' });
    expect(materializeKeyframePaste(rejected, allocator(calls))).toBeNull();
    expect(calls).toEqual([]);
    const tooLate = planKeyframePaste(track(), payload, 9990, 'right', 0);
    expect(tooLate).toEqual({ accepted: false, reason: 'out-of-bounds' });
    const fadeSource = track();
    fadeSource.keyframes = [frame('f', 'left', 10, { transitionMs: 10 })];
    expect(planKeyframePaste(track(), copyKeyframes(fadeSource, ['f'])!, 0, 'right', 0)).toEqual({
      accepted: false,
      reason: 'fade-before-start',
    });
    expect(planKeyframePaste(track(), payload, 100, 'right', 60)).toEqual({
      accepted: false,
      reason: 'spacing-collision',
    });
  });

  it('rejects malformed or invalid source payloads and active-lane omission', () => {
    const source = track();
    source.keyframes = [frame('a', 'left', 0)];
    const payload = copyKeyframes(source, ['a'])!;
    expect(planKeyframePaste(track(), payload, 3.5, 'right', 0)).toEqual({
      accepted: false,
      reason: 'invalid-anchor',
    });
    expect(planKeyframePaste(track(), payload, 3, null, 0)).toEqual({
      accepted: false,
      reason: 'missing-active-channel',
    });
    expect(planKeyframePaste(track(), { ...payload, version: 2 } as never, 3, 'right', 0)).toEqual({
      accepted: false,
      reason: 'invalid-payload',
    });
    const malformed = structuredClone(payload) as any;
    malformed.keyframes[0].value.color.r = Number.NaN;
    expect(planKeyframePaste(track(), malformed, 3, 'right', 0)).toEqual({
      accepted: false,
      reason: 'invalid-payload',
    });
    expect(copyKeyframes(source, ['missing'])).toBeNull();
  });

  it('allocates fresh IDs only after accepted validation and preserves exact imported timing', () => {
    const source = track();
    source.keyframes = [frame('imported-777', 'left', 1001), frame('imported-778', 'left', 1038)];
    const payload = copyKeyframes(source, ['imported-777', 'imported-778'])!;
    const plan = planKeyframePaste(track(), payload, 201, 'right', 0);
    expect(plan.accepted && plan.keyframes.map((key) => key.timestampMs)).toEqual([201, 238]);
    const calls: string[] = [];
    const keys = materializeKeyframePaste(plan, allocator(calls))!;
    expect(calls).toEqual(['kf', 'kf']);
    expect(keys.map((key) => key.id)).toEqual(['new-1', 'new-2']);
    expect(keys.map((key) => key.timestampMs)).toEqual([201, 238]);
  });
});
