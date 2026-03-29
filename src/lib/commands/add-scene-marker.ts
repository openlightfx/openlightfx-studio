import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { SceneMarker } from '$lib/types/timeline.js';

export interface SceneMarkerStore {
  getSceneMarkers(): SceneMarker[];
  addSceneMarker(marker: SceneMarker): void;
  removeSceneMarker(id: string): void;
}

export class AddSceneMarkerCommand implements Command {
  readonly type = 'ADD_SCENE_MARKER';
  readonly description: string;
  constructor(private readonly marker: SceneMarker, private readonly store: SceneMarkerStore) {
    this.description = `Add scene marker "${marker.label}" at ${marker.timestampMs}ms`;
  }
  execute(): void { this.store.addSceneMarker({ ...this.marker }); }
  undo(): void { this.store.removeSceneMarker(this.marker.id); }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { marker: this.marker } };
  }
}
