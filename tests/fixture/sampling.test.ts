import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import {
  decodeTrack,
  encodeTrack,
  kelvinToRgb,
  renderEffect,
  roundHalfToEven,
  sampleChannel,
  sampleEffectAt,
  type Keyframe,
} from '../../src/lib/domain';
import { effectCases } from '../fixtures/sampling/effect-cases';
import { roundTripTrack } from '../fixtures/sampling/roundtrip-track';
import { requirement } from '../harness/requirement';

const FIXTURES = path.join(process.cwd(), 'tests/fixtures/sampling');

interface FixtureCase {
  id: string;
  timeMs: number;
  keyframes: Keyframe[];
  expect: Partial<Keyframe> & {
    r?: number;
    g?: number;
    b?: number;
    brightness?: number;
    kelvin?: number;
    mode?: string;
    powerOn?: boolean;
  };
}

function loadCases(): FixtureCase[] {
  const parsed = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'keyframes.json'), 'utf8')) as {
    cases: FixtureCase[];
  };
  return parsed.cases;
}

function expectCase(id: string): void {
  const cases = loadCases().filter((item) => item.id === id);
  expect(cases.length).toBeGreaterThan(0);
  for (const item of cases) {
    const sample = sampleChannel(item.keyframes, item.timeMs);
    if (item.expect.r !== undefined) expect(sample.r, `${id} @ ${item.timeMs}`).toBe(item.expect.r);
    if (item.expect.g !== undefined) expect(sample.g, `${id} @ ${item.timeMs}`).toBe(item.expect.g);
    if (item.expect.b !== undefined) expect(sample.b, `${id} @ ${item.timeMs}`).toBe(item.expect.b);
    if (item.expect.brightness !== undefined)
      expect(sample.brightness).toBe(item.expect.brightness);
    if (item.expect.kelvin !== undefined) expect(sample.kelvin).toBe(item.expect.kelvin);
    if (item.expect.mode !== undefined) expect(sample.mode).toBe(item.expect.mode);
    if (item.expect.powerOn !== undefined) expect(sample.powerOn).toBe(item.expect.powerOn);
  }
}

requirement('KEY-009 @unit step holds the previous state until the keyframe instant', () => {
  expectCase('KEY-009');
});

requirement('KEY-009 @fixture step holds the previous state until the keyframe instant', () => {
  expectCase('KEY-009');
});

requirement('KEY-010 @unit linear blend rounds 127.5 half-to-even to 128', () => {
  expect(roundHalfToEven(0.5)).toBe(0);
  expect(roundHalfToEven(127.5)).toBe(128);
  expect(Math.round(0.5)).toBe(1);
  expectCase('KEY-010');
});

requirement('KEY-010 @fixture linear blend rounds 127.5 half-to-even to 128', () => {
  expectCase('KEY-010');
});

requirement('KEY-011 @unit empty spans are black before the first keyframe', () => {
  expectCase('KEY-011');
});

requirement('KEY-011 @fixture empty spans are black before the first keyframe', () => {
  expectCase('KEY-011');
});

requirement('KEY-012 @unit kelvin conversion matches the truncated Tanner Helland values', () => {
  expect(kelvinToRgb(2700)).toEqual({ r: 255, g: 166, b: 87 });
  expect(kelvinToRgb(6500)).toEqual({ r: 255, g: 254, b: 250 });
  expectCase('KEY-012');
});

requirement(
  'KEY-012 @fixture kelvin conversion matches the truncated Tanner Helland values',
  () => {
    expectCase('KEY-012');
  }
);

requirement('KEY-013 @unit an unspecified interpolation blends as linear', () => {
  expectCase('KEY-013');
});

requirement('KEY-013 @fixture an unspecified interpolation blends as linear', () => {
  expectCase('KEY-013');
});

requirement('KEY-014 @unit power_on false still previews the RGB brightness', () => {
  expectCase('KEY-014');
  const encoded = decodeTrack(
    encodeTrack({
      version: 1,
      metadata: {
        title: 'power',
        description: '',
        author: '',
        tags: [],
        imdbId: '',
        movieTitle: '',
        year: 0,
        durationMs: 1000,
      },
      channels: [
        {
          id: 'left',
          displayName: 'Left',
          spatialHint: 'SPATIAL_LEFT',
          defaultColor: { r: 0, g: 0, b: 0 },
          defaultBrightness: 0,
          optional: false,
        },
      ],
      keyframes: loadCases().find((item) => item.id === 'KEY-014')!.keyframes,
      effects: [],
      safety: null,
    })
  );
  expect(encoded.keyframes[0].powerOn).toBe(false);
  const on = decodeTrack(
    encodeTrack({
      ...encoded,
      keyframes: [{ ...encoded.keyframes[0], powerOn: true }],
    })
  );
  expect(on.keyframes[0].powerOn).toBe(true);
});

requirement('KEY-014 @fixture power_on false still previews the RGB brightness', () => {
  expectCase('KEY-014');
});

requirement('KEY-008 @fixture encoded keyframes are ordered and version 1', () => {
  const source = roundTripTrack();
  source.keyframes.reverse();
  const decoded = decodeTrack(encodeTrack(source));
  const left = decoded.keyframes
    .filter((kf) => kf.channelId === 'left')
    .map((kf) => kf.timestampMs);
  const right = decoded.keyframes
    .filter((kf) => kf.channelId === 'right')
    .map((kf) => kf.timestampMs);
  expect(left).toEqual([...left].sort((a, b) => a - b));
  expect(right).toEqual([...right].sort((a, b) => a - b));
  expect(decoded.version).toBe(1);
});

function assertRoundTrip(): void {
  const source = roundTripTrack();
  const bytes = encodeTrack(source);
  const committed = fs.readFileSync(path.join(FIXTURES, 'roundtrip.lightfx'));
  expect(Buffer.compare(Buffer.from(bytes), committed)).toBe(0);
  const decoded = decodeTrack(bytes);
  expect(decoded.metadata.durationMs).toBe(source.metadata.durationMs);
  expect(decoded.channels.map((channel) => channel.id)).toEqual(['left', 'right']);
  expect(
    decoded.keyframes.map((kf) => [
      kf.channelId,
      kf.timestampMs,
      kf.colorMode,
      kf.brightness,
      kf.interpolation,
      kf.transitionMs,
    ])
  ).toEqual([
    ['left', 0, 'RGB', 40, 'STEP', 0],
    ['right', 1000, 'COLOR_TEMPERATURE', 80, 'LINEAR', 400],
  ]);
  expect(decoded.keyframes[0].color).toEqual({ r: 10, g: 20, b: 30 });
  expect(decoded.keyframes[1].colorTemperature).toBe(2700);
  expect(decoded.effects[0]).toMatchObject({
    effectType: 'PULSE',
    timestampMs: 2000,
    durationMs: 1000,
    intensity: 80,
    requiredCapability: 'CAPABILITY_RGB',
    fallbackBrightness: 25,
    params: { flicker_rate_hz: 4 },
  });
  expect(decoded.effects[0].fallbackColor).toEqual({ r: 1, g: 2, b: 3 });
}

requirement('IO-002 @unit decoding and encoding preserves the fields the plugin reads', () => {
  assertRoundTrip();
});

requirement('IO-002 @fixture decoding and encoding preserves the fields the plugin reads', () => {
  assertRoundTrip();
});

requirement('FX-004 @unit effect fields round-trip', () => {
  const decoded = decodeTrack(encodeTrack(roundTripTrack()));
  expect(decoded.effects[0].durationMs).toBeGreaterThan(0);
  expect(decoded.effects[0].intensity).toBeLessThanOrEqual(100);
  expect(decoded.effects[0].requiredCapability).toBe('CAPABILITY_RGB');
});

requirement('FX-004 @fixture effect fields round-trip', () => {
  const decoded = decodeTrack(encodeTrack(roundTripTrack()));
  expect(decoded.effects[0].params.flicker_rate_hz).toBe(4);
  expect(decoded.effects[0].fallbackColor).toEqual({ r: 1, g: 2, b: 3 });
});

requirement('FX-003 @fixture effect commands match the shared renderer fixture', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'effects.json'), 'utf8')) as {
    cases: {
      name: string;
      commands: { offsetMs: number; r: number; g: number; b: number; brightness: number }[];
    }[];
  };
  for (const item of effectCases()) {
    const commands = renderEffect(item.input);
    const expected = fixture.cases.find((entry) => entry.name === item.name);
    expect(expected, item.name).toBeTruthy();
    expect(
      commands.map(({ offsetMs, r, g, b, brightness }) => ({ offsetMs, r, g, b, brightness }))
    ).toEqual(expected?.commands);
  }
});

requirement('PREV-011 @fixture an active effect command is the overlay color', () => {
  const sample = sampleEffectAt(
    [
      { offsetMs: 0, r: 0, g: 0, b: 0, brightness: 0, transitionMs: 0 },
      { offsetMs: 100, r: 0, g: 0, b: 255, brightness: 100, transitionMs: 0 },
    ],
    100
  );
  expect(sample).toMatchObject({ r: 0, g: 0, b: 255, brightness: 100 });
});
