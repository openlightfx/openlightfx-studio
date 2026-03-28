import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Keyframe } from '$lib/types/track.js';

export interface KeyframeStore {
  getKeyframes(): Keyframe[];
  addKeyframe(kf: Keyframe): void;
  removeKeyframe(id: string): void;
  updateKeyframe(id: string, patch: Partial<Keyframe>): void;
}

export class AddKeyframeCommand implements Command {
  readonly type = 'ADD_KEYFRAME';
  readonly description: string;
  constructor(private readonly keyframe: Keyframe, private readonly store: KeyframeStore) {
    this.description = `Add keyframe at ${keyframe.timestampMs}ms on ${keyframe.channelId}`;
  }
  execute(): void { this.store.addKeyframe({ ...this.keyframe }); }
  undo(): void { this.store.removeKeyframe(this.keyframe.id); }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { keyframe: this.keyframe } };
  }
}
