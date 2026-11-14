import { describe, expect, it } from 'vitest';
import {
  layouts,
  normalizeScenario,
  simulatorConfig,
  sameInventory,
} from '../../scripts/fullstack/scenario.mjs';
// Validator unit data, not a durable agent-authored scenario file.
const input = () => ({
  name: 'Validation sample',
  movie: 'clip-a',
  room: {
    name: 'Validation room',
    bulbs: [
      { id: 'left', name: 'Left', position: 'left' },
      { id: 'center', name: 'Center', position: 'center' },
      { id: 'right', name: 'Right', position: 'right' },
    ],
  },
  track: {
    layout: '3.0',
    title: 'Validation track',
    keyframes: [
      { channel: 'center', timeMs: 0, color: '#808080', brightness: 100 },
      { channel: 'left', timeMs: 5000, color: '#808080', brightness: 100 },
      { channel: 'right', timeMs: 5000, color: '#808080', brightness: 100 },
    ],
  },
  expectations: [
    {
      name: 'Validation expectation',
      withinMs: 4000,
      bulbs: {
        left: { color: '#000000', brightness: 0, power: false },
        center: { color: '#808080', brightness: 100, power: true },
        right: { color: '#000000', brightness: 0, power: false },
      },
      commands: [{ bulbId: 'center', color: '#808080', brightness: 100, power: true }],
    },
  ],
});
describe('source-free lab scenario configuration', () => {
  it('keeps independent expected states and exact cue times', () => {
    const scenario = normalizeScenario(input());
    expect(scenario.track.keyframes.map((frame) => frame.timeMs)).toEqual([0, 5000, 5000]);
    expect(scenario.expectations[0].bulbs.center).toEqual({
      r: 128,
      g: 128,
      b: 128,
      brightness: 100,
      power: true,
      display_color: { r: 128, g: 128, b: 128 },
    });
    expect(scenario.room.bulbs.map((bulb) => bulb.port)).toEqual([9200, 9201, 9203]);
    const config = simulatorConfig(scenario);
    expect(config).toContain('control_port = 9202');
    expect(config).toContain('id = "center"');
    expect(config.match(/\[\[bulbs\]\]/g)).toHaveLength(3);
  });
  it.each(Object.keys(layouts))('supports layout %s through data', (layout) => {
    const data = input();
    data.track.layout = layout;
    data.track.keyframes = [
      { channel: layouts[layout][0], timeMs: 1340, color: '#00ff00', brightness: 80 },
    ];
    expect(normalizeScenario(data).track.keyframes[0].timeMs).toBe(1340);
  });
  it('allows runtime cue, expectation, position and Follows changes without rebuilding', () => {
    const data = input();
    data.track.layout = '5.0';
    data.track.keyframes[0].color = '#224466';
    data.room.bulbs[0].position = 'surround-left';
    const updated = normalizeScenario(data);
    updated.room.bulbs[0].follows = 'ambient';
    expect(sameInventory(normalizeScenario(input()), updated)).toBe(true);
    updated.room.bulbs[0].name = 'Different inventory';
    expect(sameInventory(normalizeScenario(input()), updated)).toBe(false);
  });
  const invalid: [string, (data: any) => void][] = [
    [
      'unknown scenario field',
      (data) => {
        data.typo = true;
      },
    ],
    [
      'unknown keyframe field',
      (data) => {
        data.track.keyframes[0].colour = '#808080';
      },
    ],
    [
      'unknown layout',
      (data) => {
        data.track.layout = '7.0';
      },
    ],
    [
      'channel outside layout',
      (data) => {
        data.track.keyframes[0].channel = 'ambient';
      },
    ],
    [
      'duplicate bulb ID',
      (data) => {
        data.room.bulbs[1].id = 'left';
      },
    ],
    [
      'duplicate bulb name',
      (data) => {
        data.room.bulbs[1].name = 'Left';
      },
    ],
    [
      'unsafe bulb ID',
      (data) => {
        data.room.bulbs[0].id = '../left';
      },
    ],
    [
      'invalid position',
      (data) => {
        data.room.bulbs[0].position = 'ceiling';
      },
    ],
    [
      'invalid follows',
      (data) => {
        data.room.bulbs[0].follows = 'channel-uuid';
      },
    ],
    [
      'empty room',
      (data) => {
        data.room.bulbs = [];
      },
    ],
    [
      'bad hex',
      (data) => {
        data.track.keyframes[0].color = 'gray';
      },
    ],
    [
      'fractional time',
      (data) => {
        data.track.keyframes[0].timeMs = 1.5;
      },
    ],
    [
      'negative time',
      (data) => {
        data.track.keyframes[0].timeMs = -1;
      },
    ],
    [
      'invalid brightness',
      (data) => {
        data.track.keyframes[0].brightness = 101;
      },
    ],
    [
      'duplicate cue',
      (data) => {
        data.track.keyframes.push(data.track.keyframes[0]);
      },
    ],
    [
      'too-close cues',
      (data) => {
        data.track.keyframes.push({ ...data.track.keyframes[0], timeMs: 100 });
      },
    ],
    [
      'unsupported fade',
      (data) => {
        data.track.keyframes[0].interpolation = 'CUBIC';
      },
    ],
    [
      'missing independent expectations',
      (data) => {
        data.expectations = [];
      },
    ],
    [
      'missing unchanged bulb',
      (data) => {
        delete data.expectations[0].bulbs.right;
      },
    ],
    [
      'unknown expected bulb',
      (data) => {
        data.expectations[0].bulbs.extra = data.expectations[0].bulbs.left;
      },
    ],
    [
      'unknown command bulb',
      (data) => {
        data.expectations[0].commands[0].bulbId = 'extra';
      },
    ],
    [
      'nonboolean power',
      (data) => {
        data.expectations[0].bulbs.left.power = 'false';
      },
    ],
    [
      'zero timeout',
      (data) => {
        data.expectations[0].withinMs = 0;
      },
    ],
    [
      'inverted timing window',
      (data) => {
        data.expectations[0].minElapsedMs = 5000;
        data.expectations[0].maxElapsedMs = 0;
      },
    ],
  ];
  it.each(invalid)('rejects %s instead of silently ignoring it', (_name, mutate) => {
    const data = input();
    mutate(data);
    expect(() => normalizeScenario(data)).toThrow();
  });
});
