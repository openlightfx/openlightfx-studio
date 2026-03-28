import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { EffectKeyframe } from '$lib/types/track.js';
import type { EffectKeyframeStore } from './add-effect.js';

export class EditEffectCommand implements Command {
  readonly type = 'EDIT_EFFECT';
  readonly description: string;
  private previousValues: Partial<EffectKeyframe> = {};
  constructor(private readonly effectId: string, private readonly patch: Partial<EffectKeyframe>, private readonly store: EffectKeyframeStore) {
    this.description = `Edit effect keyframe ${effectId}`;
  }
  execute(): void {
    const ef = this.store.getEffectKeyframes().find((e) => e.id === this.effectId);
    if (!ef) return;
    this.previousValues = {};
    for (const key of Object.keys(this.patch) as (keyof EffectKeyframe)[]) {
      const val = ef[key];
      (this.previousValues as any)[key] = typeof val === 'object' && val !== null ? JSON.parse(JSON.stringify(val)) : val;
    }
    this.store.updateEffectKeyframe(this.effectId, this.patch);
  }
  undo(): void {
    this.store.updateEffectKeyframe(this.effectId, this.previousValues);
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { effectId: this.effectId, patch: this.patch, previousValues: this.previousValues } };
  }
}
