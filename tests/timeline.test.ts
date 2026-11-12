import { describe, expect, it } from 'vitest';
import { makeEffect, makeKeyframe } from '$lib/model/types';
import { hitTest, placeFromTrack, rectHits } from '$lib/timeline/hit';
import { RULER_H, ROW_H, panBy, timeToX, xToTime, zoomAround, type View } from '$lib/timeline/geometry';
import { snapTime } from '$lib/timeline/snap';

const view: View = {
  viewStartMs: 0,
  pixelsPerMs: 1,
  widthPx: 1000,
  heightPx: 400,
  scrollY: 0,
  durationMs: 10_000
};

describe('timeline geometry', () => {
  it('keeps the cursor time fixed while zooming', () => {
    const next = zoomAround(view, 100, 2);
    const zoomed = { ...view, ...next };
    expect(xToTime(zoomed, 100)).toBeCloseTo(100, 6);
    expect(next.pixelsPerMs).toBe(2);
    expect(timeToX(zoomed, 100)).toBeCloseTo(100, 6);
  });

  it('pans and clamps to the movie', () => {
    expect(panBy(view, 50)).toBe(50);
    expect(panBy(view, -20)).toBe(0);
    expect(panBy({ ...view, viewStartMs: 9500 }, 10_000)).toBe(9000);
  });

  it('snaps to the playhead inside the pixel threshold', () => {
    const hit = snapTime(104, [{ timeMs: 100, kind: 'playhead' }], 8, true);
    expect(hit.timeMs).toBe(100);
    expect(hit.guide?.kind).toBe('playhead');
    expect(snapTime(104, [{ timeMs: 100, kind: 'keyframe' }], 8, false).timeMs).toBe(104);
  });

  it('hits keyframes, effect bodies, and resize handles', () => {
    const channels = [{ id: 'main' }];
    const items = placeFromTrack(
      channels,
      [makeKeyframe({ id: 'k', channelId: 'main', timestampMs: 100, transitionMs: 40, color: { r: 1, g: 2, b: 3 } })],
      [makeEffect({ id: 'e', channelId: 'main', timestampMs: 300, durationMs: 200 })]
    );
    const y = RULER_H + ROW_H / 2;
    expect(hitTest({ x: 100, y, view, items, markers: [], selected: new Set(), playheadMs: 0, channels }).type).toBe(
      'item'
    );
    expect(hitTest({ x: 360, y, view, items, markers: [], selected: new Set(), playheadMs: 0, channels })).toMatchObject(
      { type: 'item', id: 'e' }
    );
    const handle = hitTest({
      x: 300,
      y,
      view,
      items,
      markers: [],
      selected: new Set(['e']),
      playheadMs: 0,
      channels
    });
    expect(handle).toMatchObject({ type: 'handle', id: 'e', edge: 'start' });
    const boxed = rectHits(view, items, 80, RULER_H, 140, RULER_H + ROW_H);
    expect(boxed.keyframes).toEqual(['k']);
    expect(boxed.effects).toEqual([]);
  });
});
