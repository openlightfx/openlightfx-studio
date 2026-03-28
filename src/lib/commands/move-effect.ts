import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { EffectKeyframeStore } from './add-effect.js';

export class MoveEffectCommand implements Command {
  readonly type = 'MOVE_EFFECT';
  readonly description: string;
  private previousTimestampMs = 0;
  constructor(private readonly effectId: string, private readonly newTimestampMs: number, private readonly store: EffectKeyframeStore) {
    this.description = `Move effect keyframe to ${newTimestampMs}ms`;
  }
  execute(): void {
    const ef = this.store.getEffectKeyframes().find((e) => e.id === this.effectId);
    if (ef) {
      this.previousTimestampMs = ef.timestampMs;
      this.store.updateEffectKeyframe(this.effectId, { timestampMs: this.newTimestampMs });
    }
  }
  undo(): void {
    this.store.updateEffectKeyframe(this.effectId, { timestampMs: this.previousTimestampMs });
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { effectId: this.effectId, newTimestampMs: this.newTimestampMs, previousTimestampMs: this.previousTimestampMs } };
  }
}
