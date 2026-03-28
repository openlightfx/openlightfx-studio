import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Keyframe } from '$lib/types/track.js';
import type { KeyframeStore } from './add-keyframe.js';

export class EditKeyframeCommand implements Command {
  readonly type = 'EDIT_KEYFRAME';
  readonly description: string;
  private previousValues: Partial<Keyframe> = {};
  constructor(private readonly keyframeId: string, private readonly patch: Partial<Keyframe>, private readonly store: KeyframeStore) {
    this.description = `Edit keyframe ${keyframeId}`;
  }
  execute(): void {
    const kf = this.store.getKeyframes().find((k) => k.id === this.keyframeId);
    if (!kf) return;
    this.previousValues = {};
    for (const key of Object.keys(this.patch) as (keyof Keyframe)[]) {
      const val = kf[key];
      (this.previousValues as any)[key] = typeof val === 'object' && val !== null ? { ...val } : val;
    }
    this.store.updateKeyframe(this.keyframeId, this.patch);
  }
  undo(): void {
    this.store.updateKeyframe(this.keyframeId, this.previousValues);
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { keyframeId: this.keyframeId, patch: this.patch, previousValues: this.previousValues } };
  }
}
