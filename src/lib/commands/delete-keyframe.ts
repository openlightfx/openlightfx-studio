import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Keyframe } from '$lib/types/track.js';
import type { KeyframeStore } from './add-keyframe.js';

export class DeleteKeyframeCommand implements Command {
  readonly type = 'DELETE_KEYFRAME';
  readonly description: string;
  private savedKeyframe: Keyframe | null = null;
  constructor(private readonly keyframeId: string, private readonly store: KeyframeStore) {
    this.description = `Delete keyframe ${keyframeId}`;
  }
  execute(): void {
    this.savedKeyframe = this.store.getKeyframes().find((k) => k.id === this.keyframeId) ?? null;
    if (this.savedKeyframe) {
      this.savedKeyframe = { ...this.savedKeyframe, color: { ...this.savedKeyframe.color } };
    }
    this.store.removeKeyframe(this.keyframeId);
  }
  undo(): void {
    if (this.savedKeyframe) this.store.addKeyframe({ ...this.savedKeyframe });
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { keyframeId: this.keyframeId, savedKeyframe: this.savedKeyframe } };
  }
}
