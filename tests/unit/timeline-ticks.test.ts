import { describe, expect, it } from 'vitest';
import { generateTimelineTicks, majorTickIntervalMs } from '../../src/lib/domain/timeline-ticks';

describe('ED2-008 @unit adaptive timeline ticks', () => {
  it('selects stable 1/2/5 major intervals from label width and scale', () => {
    expect(majorTickIntervalMs(1, 42)).toBe(50);
    expect(majorTickIntervalMs(0.01, 42)).toBe(5000);
    expect(majorTickIntervalMs(10, 42)).toBe(5);
    expect(majorTickIntervalMs(0, 42)).toBe(0);
  });

  it('returns only visible, monotonic ticks with readable major spacing', () => {
    const scale = 0.02;
    const width = 64;
    const ticks = generateTimelineTicks(12000, 26000, 120000, scale, width);
    expect(ticks.length).toBeLessThanOrEqual(1000);
    expect(
      ticks.every(
        (tick, index) =>
          tick.timeMs >= 12000 &&
          tick.timeMs <= 26000 &&
          (index === 0 || tick.timeMs > ticks[index - 1].timeMs)
      )
    ).toBe(true);
    const majors = ticks.filter((tick) => tick.major);
    expect(majors.length).toBeGreaterThan(1);
    expect((majors[1].timeMs - majors[0].timeMs) * scale).toBeGreaterThanOrEqual(width + 8);
  });

  it('handles endpoint ticks, long durations, detail intervals and invalid inputs', () => {
    const duration = 2 * 60 * 60 * 1000;
    const hours = generateTimelineTicks(0, duration, duration, 0.0001, 48);
    expect(hours[0].timeMs).toBe(0);
    expect(hours.at(-1)?.timeMs).toBe(duration);
    expect(hours.length).toBeLessThanOrEqual(1000);
    const detail = generateTimelineTicks(100, 110, 1000, 10, 42);
    expect(detail.some((tick) => tick.timeMs === 100)).toBe(true);
    expect(generateTimelineTicks(0, 100, 100, 0, 20)).toEqual([]);
    expect(generateTimelineTicks(0, 100, 0, 1, 20)).toEqual([]);
    expect(generateTimelineTicks(Number.NaN, 100, 100, 1, 20)).toEqual([]);
    expect(generateTimelineTicks(0, 100, 100, 1, 20, 0)).toEqual([]);
  });
});
