import { describe, expect, it } from 'vitest';
import { inspectorSelection } from '../../src/lib/domain/inspector-selection';
import type { Keyframe } from '../../src/lib/domain';

const key: Keyframe = {
  id: 'a',
  channelId: 'left',
  timestampMs: 1000,
  colorMode: 'RGB',
  color: { r: 12, g: 34, b: 56 },
  colorTemperature: 2700,
  brightness: 70,
  transitionMs: 100,
  interpolation: 'LINEAR',
  powerOn: true,
};

describe('ED2-021 @unit Inspector selection', () => {
  it('distinguishes empty and missing selection from uniform zero values', () => {
    expect(inspectorSelection([key], ['missing']).brightness).toEqual({ kind: 'empty' });
    expect(inspectorSelection([{ ...key, brightness: 0 }], ['a']).brightness).toEqual({
      kind: 'uniform',
      value: 0,
    });
  });
  it('derives each component independently without changing source keys', () => {
    const other: Keyframe = {
      ...key,
      id: 'b',
      timestampMs: 2000,
      colorMode: 'COLOR_TEMPERATURE',
      color: { r: 90, g: 34, b: 56 },
      brightness: 20,
      colorTemperature: 4000,
      interpolation: 'STEP',
      transitionMs: 0,
      powerOn: false,
    };
    const source = structuredClone([key, other]);
    const fields = inspectorSelection(source, ['b', 'a', 'absent']);
    expect(fields.count).toBe(2);
    expect([fields.startMs, fields.endMs]).toEqual([1000, 2000]);
    for (const name of [
      'mode',
      'red',
      'hex',
      'brightness',
      'kelvin',
      'interpolation',
      'transitionMs',
      'powerOn',
    ] as const)
      expect(fields[name]).toEqual({ kind: 'mixed' });
    expect(fields.green).toEqual({ kind: 'uniform', value: 34 });
    expect(source).toEqual([key, other]);
  });
});
