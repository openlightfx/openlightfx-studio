import { describe, expect, it } from 'vitest';
import {
  emptyEditorSelection,
  keyframesInMarquee,
  selectEditorMarquee,
  pruneEditorSelection,
  selectAllEditorKeyframes,
  selectEditorKeyframe,
  type EditorSelection,
} from '../../src/lib/domain/editor-selection';

const frames = [
  { id: 'a0', channelId: 'a', timestampMs: 0 },
  { id: 'a1', channelId: 'a', timestampMs: 100 },
  { id: 'a1-same', channelId: 'a', timestampMs: 100 },
  { id: 'a2', channelId: 'a', timestampMs: 200 },
  { id: 'b0', channelId: 'b', timestampMs: 0 },
  { id: 'b1', channelId: 'b', timestampMs: 100 },
];
const choose = (state: EditorSelection, id: string, intent: 'replace' | 'range' | 'toggle') =>
  selectEditorKeyframe(state, frames, id, intent);

describe('ED2-014 @unit content-space marquee selection', () => {
  it('uses inclusive diamond centers across lanes and reverses identically', () => {
    const bounds = { x0: 10, y0: 19, x1: 20, y1: 59 };
    const hits = keyframesInMarquee(frames, ['a', 'b'], bounds, 0.1);
    expect(hits).toEqual(['a1', 'a1-same', 'a2', 'b1']);
    expect(keyframesInMarquee(frames, ['a', 'b'], { x0: 20, y0: 59, x1: 10, y1: 19 }, 0.1)).toEqual(
      hits
    );
    expect(keyframesInMarquee(frames, ['a', 'b'], { ...bounds, y1: 58.9 }, 0.1)).toEqual([
      'a1',
      'a1-same',
      'a2',
    ]);
    expect(keyframesInMarquee(frames, ['a', 'b'], bounds, NaN)).toEqual([]);
  });

  it('replaces, unions or toggles against the initial snapshot and prunes stale hits', () => {
    const initial = choose(emptyEditorSelection(), 'a0', 'replace');
    expect(selectEditorMarquee(initial, frames, ['b1'], 'replace')).toEqual({
      selectedIds: ['b1'],
      anchorId: 'b1',
      primaryId: 'b1',
    });
    expect(selectEditorMarquee(initial, frames, ['b1'], 'union').selectedIds).toEqual(['a0', 'b1']);
    const hits = ['a0', 'a0', 'b1', 'missing'];
    const proposal = selectEditorMarquee(initial, frames, hits, 'toggle');
    expect(proposal.selectedIds).toEqual(['b1']);
    expect(selectEditorMarquee(initial, frames, hits, 'toggle')).toEqual(proposal);
    expect(initial.selectedIds).toEqual(['a0']);
  });
});

describe('ED2-013 @unit stable primary and range selection', () => {
  it('selects contiguous ranges in both directions from the stable anchor', () => {
    const start = choose(emptyEditorSelection(), 'a0', 'replace');
    const forward = choose(choose(start, 'a2', 'range'), 'a1-same', 'range');
    expect(forward).toEqual({
      selectedIds: ['a0', 'a1', 'a1-same'],
      anchorId: 'a0',
      primaryId: 'a1-same',
    });
    const reverse = choose(choose(emptyEditorSelection(), 'a2', 'replace'), 'a0', 'range');
    expect(reverse.selectedIds).toEqual(['a0', 'a1', 'a1-same', 'a2']);
    expect(reverse.anchorId).toBe('a2');
    expect(reverse.primaryId).toBe('a0');
  });

  it('promotes the last deliberate key and falls back when primary or anchor is toggled off', () => {
    let state = choose(emptyEditorSelection(), 'a0', 'replace');
    state = choose(state, 'a2', 'toggle');
    expect(state).toEqual({ selectedIds: ['a0', 'a2'], anchorId: 'a2', primaryId: 'a2' });
    state = choose(state, 'a2', 'toggle');
    expect(state).toEqual({ selectedIds: ['a0'], anchorId: 'a0', primaryId: 'a0' });
    state = choose(state, 'a1', 'toggle');
    expect(choose(state, 'a0', 'toggle')).toEqual({
      selectedIds: ['a1'],
      anchorId: 'a1',
      primaryId: 'a1',
    });
  });

  it('falls back to the primary when the stable range anchor is toggled off', () => {
    const ranged = choose(choose(emptyEditorSelection(), 'a0', 'replace'), 'a2', 'range');
    expect(choose(ranged, 'a0', 'toggle')).toEqual({
      selectedIds: ['a1', 'a1-same', 'a2'],
      anchorId: 'a2',
      primaryId: 'a2',
    });
  });

  it('adds cross-lane Shift keys without changing the anchor and replaces stale anchors safely', () => {
    const selected = choose(emptyEditorSelection(), 'a1', 'replace');
    expect(choose(selected, 'b1', 'range')).toEqual({
      selectedIds: ['a1', 'b1'],
      anchorId: 'a1',
      primaryId: 'b1',
    });
    const stale = { selectedIds: ['b0'], anchorId: 'deleted', primaryId: 'b0' };
    expect(choose(stale, 'b1', 'range')).toEqual({
      selectedIds: ['b0', 'b1'],
      anchorId: 'b0',
      primaryId: 'b1',
    });
  });

  it('prunes deleted IDs and stale primary/anchor references with a deterministic fallback', () => {
    const stale = {
      selectedIds: ['a0', 'deleted', 'a2'],
      anchorId: 'deleted',
      primaryId: 'deleted',
    };
    expect(
      pruneEditorSelection(
        stale,
        frames.filter((frame) => frame.id !== 'a2')
      )
    ).toEqual({
      selectedIds: ['a0'],
      anchorId: 'a0',
      primaryId: 'a0',
    });
    expect(pruneEditorSelection(stale, [])).toEqual(emptyEditorSelection());
  });

  it('selects all keys and keeps the existing primary when still selected', () => {
    const selected = choose(emptyEditorSelection(), 'b0', 'replace');
    expect(selectAllEditorKeyframes(selected, frames)).toEqual({
      selectedIds: frames.map((frame) => frame.id),
      anchorId: 'b0',
      primaryId: 'b0',
    });
  });
});
