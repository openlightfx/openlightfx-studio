import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { EffectKeyframe } from '$lib/types/track.js';

export interface EffectKeyframeStore {
  getEffectKeyframes(): EffectKeyframe[];
  addEffectKeyframe(kf: EffectKeyframe): void;
  removeEffectKeyframe(id: string): void;
  updateEffectKeyframe(id: string, patch: Partial<EffectKeyframe>): void;
}

export class AddEffectCommand implements Command {
  readonly type = 'ADD_EFFECT';
  readonly description: string;
  constructor(private readonly keyframe: EffectKeyframe, private readonly store: EffectKeyframeStore) {
    this.description = `Add effect keyframe at ${keyframe.timestampMs}ms on ${keyframe.channelId}`;
  }
  execute(): void {
    this.store.addEffectKeyframe({
      ...this.keyframe,
      primaryColor: { ...this.keyframe.primaryColor },
      secondaryColor: { ...this.keyframe.secondaryColor },
      fallbackColor: { ...this.keyframe.fallbackColor },
      effectParams: { ...this.keyframe.effectParams },
    });
  }
  undo(): void { this.store.removeEffectKeyframe(this.keyframe.id); }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { keyframe: this.keyframe } };
  }
}
