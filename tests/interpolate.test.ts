import { describe, expect, it } from 'vitest';
import { kelvinToRgb } from '$lib/engine/color';
import { interpolate, keyframeToState, stateAt, upperBound } from '$lib/engine/interpolate';
import { makeChannel, makeKeyframe, rgb, type Keyframe } from '$lib/model/types';

const channel = makeChannel('a', 'A', 'SPATIAL_CENTER', rgb(200, 0, 0));
channel.defaultBrightness = 40;

function kf(
  time: number,
  color = rgb(0, 0, 255),
  brightness = 80,
  transition = 0,
  interpolation: Keyframe['interpolation'] = 'LINEAR',
  extra: Partial<Keyframe> = {}
): Keyframe {
  return makeKeyframe({
    id: `k${time}-${interpolation}`,
    channelId: 'a',
    timestampMs: time,
    color,
    brightness,
    transitionMs: transition,
    interpolation,
    powerOn: true,
    ...extra
  });
}

describe('interpolation', () => {
  it('matches the plugin kelvin conversion', () => {
    const warm = kelvinToRgb(2000);
    expect(warm.r).toBe(255);
    expect(warm.b).toBeLessThan(80);
    const daylight = kelvinToRgb(6500);
    expect(daylight.r).toBe(255);
    expect(daylight.g).toBeGreaterThan(240);
    expect(daylight.b).toBeGreaterThan(240);
  });

  it('holds channel defaults before the first ramp and blends from black inside it', () => {
    const next = kf(1000, rgb(0, 0, 255), 80, 400);
    expect(stateAt([next], 599, channel)).toMatchObject({ r: 200, g: 0, b: 0, brightness: 40, powerOn: false });
    expect(stateAt([next], 600, channel)).toMatchObject({ r: 0, g: 0, b: 0, brightness: 0 });
    const mid = stateAt([next], 800, channel);
    expect(mid.b).toBe(128);
    expect(mid.brightness).toBe(40);
    expect(stateAt([next], 1000, channel)).toMatchObject({ r: 0, g: 0, b: 255, brightness: 80 });
  });

  it('holds the previous keyframe until a step keyframe timestamp', () => {
    const prev = kf(0, rgb(255, 0, 0), 10, 0, 'STEP');
    const next = kf(1000, rgb(255, 255, 255), 100, 1000, 'STEP');
    expect(stateAt([prev, next], 500, channel)).toMatchObject({ r: 255, g: 0, b: 0, brightness: 10 });
    expect(stateAt([prev, next], 1000, channel)).toMatchObject({ r: 255, g: 255, b: 255, brightness: 100 });
    expect(interpolate(prev, next, 999).r).toBe(255);
    expect(interpolate(prev, next, 999).g).toBe(0);
  });

  it('linear-blends across the transition window', () => {
    const prev = kf(0, rgb(0, 0, 0), 0, 0);
    const next = kf(1000, rgb(255, 255, 255), 100, 1000);
    const mid = stateAt([prev, next], 500, channel);
    expect(mid.r).toBe(128);
    expect(mid.brightness).toBe(50);
    expect(stateAt([prev, next], 0, channel).brightness).toBe(0);
  });

  it('holds the last keyframe and treats a zero transition as a hold', () => {
    const prev = kf(0, rgb(10, 20, 30), 15, 0);
    const next = kf(1000, rgb(1, 2, 3), 90, 0);
    expect(stateAt([prev, next], 999, channel)).toMatchObject(keyframeToState(prev));
    expect(stateAt([prev, next], 1000, channel)).toMatchObject(keyframeToState(next));
    expect(stateAt([prev, next], 5000, channel)).toMatchObject(keyframeToState(next));
  });

  it('interpolates color temperature in kelvin', () => {
    const a = kf(0, rgb(0, 0, 0), 10, 0, 'LINEAR', {
      colorMode: 'COLOR_TEMPERATURE',
      colorTemperature: 2000
    });
    const b = kf(1000, rgb(0, 0, 0), 100, 1000, 'LINEAR', {
      colorMode: 'COLOR_TEMPERATURE',
      colorTemperature: 6000
    });
    const mid = stateAt([a, b], 500, channel);
    expect(mid.colorMode).toBe('COLOR_TEMPERATURE');
    expect(mid.colorTemperature).toBe(4000);
    expect(mid.brightness).toBe(55);
  });

  it('binary-searches a long channel', () => {
    const keyframes = Array.from({ length: 5000 }, (_, i) =>
      kf(i * 1000, rgb(i % 255, 0, 0), 20 + (i % 50), 0, 'STEP')
    );
    expect(upperBound(keyframes, 2_500_000)).toBe(2501);
    expect(stateAt(keyframes, 2_500_000, channel)).toMatchObject(keyframeToState(keyframes[2500]));
    expect(stateAt(keyframes, 2_500_000 - 1, channel).r).toBe(keyframes[2499].color.r);
  });
});
