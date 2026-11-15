import { describe, expect } from 'vitest';
import { matchesSaveCheckpoint, type SaveCheckpoint } from '../../src/lib/domain';
import { requirement } from '../harness/requirement';

const checkpoint: SaveCheckpoint = {
  itemId: 'movie-1',
  trackId: 'track-1',
  revision: 'revision-4',
};

describe('ED2-032 save checkpoints', () => {
  requirement('ED2-032 @unit checkpoint equality includes identity and branched revision', () => {
    expect(matchesSaveCheckpoint(checkpoint, structuredClone(checkpoint))).toBe(true);
    expect(matchesSaveCheckpoint({ ...checkpoint, revision: 'revision-5' }, checkpoint)).toBe(
      false
    );
    expect(matchesSaveCheckpoint({ ...checkpoint, trackId: 'track-2' }, checkpoint)).toBe(false);
    expect(matchesSaveCheckpoint({ ...checkpoint, itemId: 'movie-2' }, checkpoint)).toBe(false);
    expect(matchesSaveCheckpoint(checkpoint, null)).toBe(false);
    expect(matchesSaveCheckpoint(null, checkpoint)).toBe(false);
  });
});
