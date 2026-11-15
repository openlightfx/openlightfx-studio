import { describe, expect, it } from 'vitest';
import {
  adjacentKeyframeTime,
  formatElapsedTime,
  parseElapsedTime,
} from '../../src/lib/domain/elapsed-time';

describe('ED2-012 @unit elapsed time and keyframe navigation', () => {
  it('round-trips exact milliseconds across hours and rejects ambiguous or invalid syntax', () => {
    for (const value of [0, 1234, 3_600_000, 2 * 3_600_000 + 59 * 60_000 + 59_999]) {
      expect(parseElapsedTime(formatElapsedTime(value))).toBe(value);
    }
    for (const invalid of [
      '',
      '-00:00:00.001',
      '1:2:03.004',
      '00:60:00.000',
      '00:00:60.000',
      '00:00:00.1',
      '999999999999999999:00:00.000',
      '00:00:00.000x',
    ]) {
      expect(parseElapsedTime(invalid)).toBeNull();
    }
  });

  it('chooses strict neighboring unique times and safely reports boundaries', () => {
    const frames = [
      { timestampMs: 100 },
      { timestampMs: 100 },
      { timestampMs: 250 },
      { timestampMs: 500 },
    ];
    expect(adjacentKeyframeTime(frames, 100, -1)).toBeNull();
    expect(adjacentKeyframeTime(frames, 100, 1)).toBe(250);
    expect(adjacentKeyframeTime(frames, 250, -1)).toBe(100);
    expect(adjacentKeyframeTime(frames, 250, 1)).toBe(500);
    expect(adjacentKeyframeTime(frames, 500, 1)).toBeNull();
  });
});
