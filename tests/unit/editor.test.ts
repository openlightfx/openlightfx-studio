import { describe, expect } from 'vitest';
import { requirement } from '../harness/requirement';
import {
  anchoredScroll,
  anchoredScrollAt,
  boundedTimelineScale,
  displayedRgb,
  dragKeepsOrder,
  sourcePixel,
  blackKeyframe,
} from '../../src/lib/domain';

describe('editor implementation', () => {
  requirement(
    'TIME-010 @unit a pointer move cannot cross either neighbor even with spacing disabled',
    () => {
      const current = { ...blackKeyframe('left'), timestampMs: 2000 };
      const before = { ...blackKeyframe('left'), timestampMs: 1000 };
      const after = { ...blackKeyframe('left'), timestampMs: 4000 };
      expect(dragKeepsOrder(current, [before, after], 3000, 200)).toBe(true);
      expect(dragKeepsOrder(current, [before, after], 5000, 200)).toBe(false);
      expect(dragKeepsOrder(current, [before, after], 500, 200)).toBe(false);
      expect(dragKeepsOrder(current, [before, after], 4000, 0)).toBe(false);
      expect(dragKeepsOrder(current, [before, after], 3999, 0)).toBe(true);
    }
  );
  requirement(
    'PROP-004 @unit scaled coordinates select the original source pixel including edges',
    () => {
      expect(sourcePixel(199, 99, 200, 100, 4, 2)).toEqual({ x: 3, y: 1 });
      expect(sourcePixel(50, 50, 200, 100, 4, 2)).toEqual({ x: 1, y: 1 });
      expect(sourcePixel(200, 100, 200, 100, 4, 2)).toEqual({ x: 3, y: 1 });
      expect(sourcePixel(-1, -1, 200, 100, 4, 2)).toEqual({ x: 0, y: 0 });
    }
  );
  requirement('EDIT-008 @unit visible colors apply authored brightness exactly once', () => {
    expect(displayedRgb({ r: 255, g: 100, b: 50, brightness: 40 })).toBe('102,40,20');
    expect(displayedRgb({ r: 255, g: 255, b: 255, brightness: 0 })).toBe('0,0,0');
  });
  requirement(
    'ED2-009 @unit anchored zoom preserves pointer time and bounds invalid and extreme scales',
    () => {
      const oldScale = 0.02;
      const oldScroll = 300;
      const x = 240;
      const contentTime = (oldScroll + x) / oldScale;
      const next = boundedTimelineScale(oldScale * 1.25);
      const scroll = anchoredScrollAt(oldScale, next, oldScroll, 100000, 800, x);
      expect((scroll + x) / next).toBeCloseTo(contentTime, 8);
      expect(anchoredScrollAt(1, 2, 0, 1000, 800, 300)).toBe(300);
      expect(anchoredScrollAt(1, 2, 900, 1000, 800, 300)).toBe(1200);
      expect(anchoredScrollAt(1, 2, 0, 1000, 800, 0)).toBe(0);
      expect(boundedTimelineScale(0)).toBe(0.0001);
      expect(boundedTimelineScale(Number.NaN)).toBe(0.0001);
      expect(boundedTimelineScale(Number.POSITIVE_INFINITY)).toBe(0.0001);
      const fourHours = 4 * 60 * 60 * 1000;
      const narrowLane = 210;
      const fitScale = boundedTimelineScale(narrowLane / fourHours, fourHours, narrowLane);
      expect(fitScale).toBeGreaterThan(0);
      expect(fourHours * fitScale).toBeCloseTo(narrowLane, 8);
      expect(boundedTimelineScale(2, fourHours, narrowLane) * fourHours).toBeLessThanOrEqual(
        10_000_000
      );
      let scale = 1;
      for (let index = 0; index < 1000; index += 1) scale = boundedTimelineScale(scale * 1.25);
      expect(scale).toBe(2);
      for (let index = 0; index < 1000; index += 1) scale = boundedTimelineScale(scale / 1.25);
      expect(scale).toBe(0.0001);
      expect(anchoredScroll(500, 1, 2, 0, 1000, 800)).toBe(500);
    }
  );
  requirement(
    'TIME-002 @unit zoom preserves the playhead viewport anchor and clamps at the ends',
    () => {
      expect(anchoredScroll(6000, 1, 2, 5000, 10000, 2000)).toBe(11000);
      expect(anchoredScroll(100, 1, 0.5, 0, 10000, 2000)).toBe(0);
      expect(anchoredScroll(9000, 1, 0.1, 8000, 10000, 2000)).toBe(0);
    }
  );
});
