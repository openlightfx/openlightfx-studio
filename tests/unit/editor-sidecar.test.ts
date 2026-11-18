import { describe, expect, it } from 'vitest';
import {
  InvalidProjectSidecarError,
  parseProjectSidecar,
  sidecarDocument,
} from '../../src/lib/domain';

const identity = { itemId: 'movie-27', trackId: 'track-27' };
const sidecar = {
  version: 1,
  ...identity,
  sceneMarkers: [
    { id: 'manual-1', timeMs: 100, label: 'Manual', kind: 'manual' },
    { id: 'chapter-1', timeMs: 200, label: 'Chapter', kind: 'chapter' },
    { id: 'detected-1', timeMs: 300, label: 'Detected', kind: 'detected' },
  ],
  channelGroups: [
    { id: 'mirror-1', name: 'Mirror', mode: 'mirror', channelIds: ['left', 'right'], spreadMs: 0 },
    { id: 'spread-1', name: 'Spread', mode: 'spread', channelIds: ['left'], spreadMs: 120 },
    { id: 'alternate-1', name: 'Alternate', mode: 'alternate', channelIds: ['right'], spreadMs: 0 },
  ],
  pluginNote: { source: 'v1', reviewed: true },
  undo: ['must not persist'],
  Duration: 12000,
  authState: { accessToken: 'must not persist' },
  authorization: 'must not persist',
  api_key: 'must not persist',
};

describe('ED2-027 sidecar contract', () => {
  it('retains all v1 authored collections and safe opaque metadata without prohibited fields', () => {
    const parsed = parseProjectSidecar(sidecar, identity);
    expect(parsed.sceneMarkers).toEqual(sidecar.sceneMarkers);
    expect(parsed.channelGroups).toEqual(sidecar.channelGroups);
    expect(parsed.pluginNote).toEqual({ source: 'v1', reviewed: true });
    const serialized = sidecarDocument(parsed);
    expect(serialized).toEqual({
      version: 1,
      ...identity,
      sceneMarkers: sidecar.sceneMarkers,
      channelGroups: sidecar.channelGroups,
      pluginNote: { source: 'v1', reviewed: true },
    });
    expect(serialized).not.toHaveProperty('authState');
    expect(serialized).not.toHaveProperty('authorization');
    expect(serialized).not.toHaveProperty('api_key');
  });

  it('rebinds a stale movie ID only when explicitly enabled and the track ID matches', () => {
    const recovered = parseProjectSidecar({ ...sidecar, itemId: 'old-emby-item' }, identity, {
      allowItemIdRebind: true,
    });
    expect(recovered.itemId).toBe(identity.itemId);
    expect(recovered.trackId).toBe(identity.trackId);
    expect(() =>
      parseProjectSidecar(
        { ...sidecar, itemId: 'old-emby-item', trackId: 'different-track' },
        identity,
        { allowItemIdRebind: true }
      )
    ).toThrow(/identity/);
  });

  it('rejects malformed, unsupported and cross-track sidecars', () => {
    expect(() => parseProjectSidecar({ ...sidecar, version: 2 }, identity)).toThrow(
      InvalidProjectSidecarError
    );
    expect(() => parseProjectSidecar({ ...sidecar, itemId: 'another-movie' }, identity)).toThrow(
      /identity/
    );
    expect(() =>
      parseProjectSidecar(
        { ...sidecar, sceneMarkers: [{ id: 'x', timeMs: 0, label: 'x', kind: 'unknown' }] },
        identity
      )
    ).toThrow(/kind/);
    expect(() =>
      parseProjectSidecar(
        { ...sidecar, channelGroups: [{ id: 'x', name: 'x', mode: 'unknown' }] },
        identity
      )
    ).toThrow(/mode/);
  });
});
