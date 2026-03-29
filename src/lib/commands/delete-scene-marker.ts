import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { SceneMarker } from '$lib/types/timeline.js';
import type { SceneMarkerStore } from './add-scene-marker.js';

export class DeleteSceneMarkerCommand implements Command {
  readonly type = 'DELETE_SCENE_MARKER';
  readonly description: string;
  private savedMarker: SceneMarker | null = null;
  constructor(private readonly markerId: string, private readonly store: SceneMarkerStore) {
    this.description = `Delete scene marker ${markerId}`;
  }
  execute(): void {
    this.savedMarker = this.store.getSceneMarkers().find((m) => m.id === this.markerId) ?? null;
    if (this.savedMarker) this.savedMarker = { ...this.savedMarker };
    this.store.removeSceneMarker(this.markerId);
  }
  undo(): void {
    if (this.savedMarker) this.store.addSceneMarker({ ...this.savedMarker });
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { markerId: this.markerId, savedMarker: this.savedMarker } };
  }
}
