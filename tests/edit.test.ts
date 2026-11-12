import { describe, expect, it } from 'vitest';
import {
  nudgeItems,
  pasteClipboard,
  placeItems,
  removeItems,
  copySelection
} from '$lib/model/edit';
import { createHistory, historyRedo, historyUndo, historyPush } from '$lib/model/history';
import { emptyTrack, makeEffect, makeKeyframe } from '$lib/model/types';
import { validateTrack } from '$lib/model/validate';

describe('track edits', () => {
  it('moves a selection, clamps transitions, and keeps parser order', () => {
    const track = emptyTrack();
    track.metadata.durationMs = 5000;
    track.keyframes.push(
      makeKeyframe({ id: 'a', channelId: 'main', timestampMs: 1000, transitionMs: 400, brightness: 10 }),
      makeKeyframe({ id: 'b', channelId: 'main', timestampMs: 2000, transitionMs: 100, brightness: 20 })
    );
    const moved = placeItems(track, [], [
      {
        kind: 'keyframe',
        id: 'a',
        channelId: 'main',
        timestampMs: 200,
        durationMs: 0,
        transitionMs: 400
      }
    ]);
    const a = moved.track.keyframes.find((kf) => kf.id === 'a');
    expect(a?.timestampMs).toBe(200);
    expect(a?.transitionMs).toBe(200);
    expect(validateTrack(moved.track)).toEqual([]);
  });

  it('nudges every selected kind and refuses to cross zero', () => {
    const track = emptyTrack();
    track.metadata.durationMs = 8000;
    track.keyframes.push(makeKeyframe({ id: 'a', channelId: 'main', timestampMs: 1000, transitionMs: 0 }));
    track.effectKeyframes.push(makeEffect({ id: 'e', channelId: 'main', timestampMs: 1500, durationMs: 400 }));
    const markers = [{ id: 'm', timestampMs: 1800, label: 'Mark' }];
    const nudged = nudgeItems(track, markers, ['a'], ['e'], ['m'], -900);
    expect(nudged.track.keyframes[0].timestampMs).toBe(100);
    expect(nudged.track.effectKeyframes[0].timestampMs).toBe(600);
    expect(nudged.markers[0].timestampMs).toBe(900);
    const clamped = nudgeItems(nudged.track, nudged.markers, ['a'], [], [], -5000);
    expect(clamped.track.keyframes[0].timestampMs).toBe(0);
  });

  it('pastes copies at the playhead with new ids', () => {
    const track = emptyTrack();
    track.metadata.durationMs = 10_000;
    track.channels.push({
      ...track.channels[0],
      id: 'left',
      displayName: 'Left'
    });
    track.keyframes.push(
      makeKeyframe({ id: 'a', channelId: 'main', timestampMs: 1000, transitionMs: 0, brightness: 25 })
    );
    const clip = copySelection(track, [], ['a'], [], []);
    expect(clip).not.toBeNull();
    const pasted = pasteClipboard(track, [], clip!, 4000, 'left');
    expect(pasted.keyframeIds).toHaveLength(1);
    expect(pasted.keyframeIds[0]).not.toBe('a');
    const copy = pasted.track.keyframes.find((kf) => kf.id === pasted.keyframeIds[0]);
    expect(copy?.channelId).toBe('left');
    expect(copy?.timestampMs).toBe(4000);
    expect(copy?.brightness).toBe(25);
    const removed = removeItems(pasted.track, [], pasted.keyframeIds, [], []);
    expect(removed.track.keyframes.some((kf) => kf.id === pasted.keyframeIds[0])).toBe(false);
  });

  it('undo and redo restore snapshots', () => {
    const history = createHistory<{ n: number }>(3);
    historyPush(history, { n: 1 });
    historyPush(history, { n: 2 });
    const undone = historyUndo(history, { n: 3 });
    expect(undone).toEqual({ n: 2 });
    const redone = historyRedo(history, undone!);
    expect(redone).toEqual({ n: 3 });
    historyPush(history, { n: 1 });
    historyPush(history, { n: 2 });
    historyPush(history, { n: 3 });
    historyPush(history, { n: 4 });
    expect(history.past).toHaveLength(3);
  });
});
