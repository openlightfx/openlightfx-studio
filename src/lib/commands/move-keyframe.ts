import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { KeyframeStore } from './add-keyframe.js';

export class MoveKeyframeCommand implements Command {
  readonly type = 'MOVE_KEYFRAME';
  readonly description: string;
  private previousTimestampMs = 0;
  constructor(private readonly keyframeId: string, private readonly newTimestampMs: number, private readonly store: KeyframeStore) {
    this.description = `Move keyframe to ${newTimestampMs}ms`;
  }
  execute(): void {
    const kf = this.store.getKeyframes().find((k) => k.id === this.keyframeId);
    if (kf) {
      this.previousTimestampMs = kf.timestampMs;
      this.store.updateKeyframe(this.keyframeId, { timestampMs: this.newTimestampMs });
    }
  }
  undo(): void {
    this.store.updateKeyframe(this.keyframeId, { timestampMs: this.previousTimestampMs });
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { keyframeId: this.keyframeId, newTimestampMs: this.newTimestampMs, previousTimestampMs: this.previousTimestampMs } };
  }
}
