import { expect } from 'vitest';
import {
  blackKeyframe,
  projectLanePoints,
  lowerBoundLanePoints,
  hitLanePoint,
  displayedRgb,
  clientXToTimelineTime,
  timelineTimeToClientX,
} from '$lib/domain';
import { requirement } from '../harness/requirement';

requirement(
  'ED2-002 @unit timeline geometry round-trips scroll, origin, fractional scale and clamps duration',
  () => {
    for (const scale of [0.037, 0.125, 1.7]) {
      const geometry = {
        originClientX: 213.5,
        scrollX: 481.25,
        pxPerMs: scale,
        durationMs: 7200000,
      };
      for (const time of [0, 1000.25, 3600000, 7200000]) {
        const clientX = timelineTimeToClientX(time, geometry)!;
        expect(clientXToTimelineTime(clientX, geometry)).toBeCloseTo(time, 7);
      }
      expect(clientXToTimelineTime(-5000, geometry)).toBe(0);
      expect(clientXToTimelineTime(1e9, geometry)).toBe(7200000);
    }
  }
);
requirement('ED2-002 @unit invalid timeline geometry scales return null', () => {
  for (const scale of [0, -1, NaN, Infinity]) {
    const geometry = { originClientX: 180, scrollX: 0, pxPerMs: scale, durationMs: 10000 };
    expect(clientXToTimelineTime(200, geometry)).toBeNull();
    expect(timelineTimeToClientX(1000, geometry)).toBeNull();
  }
  expect(
    clientXToTimelineTime(NaN, { originClientX: 0, scrollX: 0, pxPerMs: 1, durationMs: 10 })
  ).toBeNull();
});
requirement(
  'TIME-001 @unit canvas paint caches retain exact colors and apply authored brightness only to the strip',
  () => {
    const frame = {
      ...blackKeyframe('left'),
      id: 'red',
      timestampMs: 1000,
      color: { r: 255, g: 0, b: 0 },
      brightness: 40,
    };
    const point = projectLanePoints([frame])[0];
    expect(point).toMatchObject({
      id: 'red',
      time: 1000,
      color: { r: 255, g: 0, b: 0, brightness: 40 },
    });
    expect(displayedRgb(point.color)).toBe('102,0,0');
    frame.color.r = 0;
    expect(point.color.r).toBe(255);
  }
);
requirement(
  'TIME-007 @unit the canvas binary lookup bounds the paint window without scanning every offscreen mark',
  () => {
    const points = projectLanePoints(
      [0, 1000, 2000, 3000].map((timestampMs) => ({ ...blackKeyframe('left'), timestampMs }))
    );
    expect(lowerBoundLanePoints(points, -1)).toBe(0);
    expect(lowerBoundLanePoints(points, 1000)).toBe(1);
    expect(lowerBoundLanePoints(points, 1001)).toBe(2);
    expect(lowerBoundLanePoints(points, 4000)).toBe(4);
  }
);
requirement(
  'TIME-001 @unit canvas hit testing accounts for zoom scroll and the visible marker radius',
  () => {
    const points = projectLanePoints(
      [1000, 2000].map((timestampMs, index) => ({
        ...blackKeyframe('left'),
        id: `frame-${index}`,
        timestampMs,
      }))
    );
    expect(hitLanePoint(points, 50, 0.1, 50)).toBe('frame-0');
    expect(hitLanePoint(points, 150, 0.1, 50)).toBe('frame-1');
    expect(hitLanePoint(points, 59, 0.1, 50)).toBe('frame-0');
    expect(hitLanePoint(points, 60, 0.1, 50)).toBe('');
    expect(hitLanePoint(points, 100, 0.1, 50)).toBe('');
    expect(hitLanePoint(points, 50, 0, 50)).toBe('');
  }
);
