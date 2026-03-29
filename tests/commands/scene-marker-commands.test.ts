import { describe, it, expect } from 'vitest';
import type { SceneMarker } from '../../src/lib/types/timeline.js';
import type { SceneMarkerStore } from '../../src/lib/commands/add-scene-marker.js';
import { AddSceneMarkerCommand } from '../../src/lib/commands/add-scene-marker.js';
import { DeleteSceneMarkerCommand } from '../../src/lib/commands/delete-scene-marker.js';

function makeStore(): SceneMarkerStore & { markers: SceneMarker[] } {
  const markers: SceneMarker[] = [];
  return {
    markers,
    getSceneMarkers: () => markers,
    addSceneMarker: (m) => markers.push(m),
    removeSceneMarker: (id) => {
      const idx = markers.findIndex((m) => m.id === id);
      if (idx >= 0) markers.splice(idx, 1);
    },
  };
}

describe('AddSceneMarkerCommand', () => {
  it('adds and undoes', () => {
    const store = makeStore();
    const marker: SceneMarker = { id: 'sm-1', timestampMs: 5000, label: 'Scene 1', type: 'MARKER_MANUAL' };
    const cmd = new AddSceneMarkerCommand(marker, store);
    cmd.execute();
    expect(store.markers).toHaveLength(1);
    cmd.undo();
    expect(store.markers).toHaveLength(0);
  });
});

describe('DeleteSceneMarkerCommand', () => {
  it('deletes and undoes', () => {
    const store = makeStore();
    store.addSceneMarker({ id: 'sm-1', timestampMs: 5000, label: 'Scene 1', type: 'MARKER_MANUAL' });
    const cmd = new DeleteSceneMarkerCommand('sm-1', store);
    cmd.execute();
    expect(store.markers).toHaveLength(0);
    cmd.undo();
    expect(store.markers).toHaveLength(1);
    expect(store.markers[0].label).toBe('Scene 1');
  });
});
