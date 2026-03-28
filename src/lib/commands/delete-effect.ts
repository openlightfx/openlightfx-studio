import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { EffectKeyframe } from '$lib/types/track.js';
import type { EffectKeyframeStore } from './add-effect.js';

export class DeleteEffectCommand implements Command {
  readonly type = 'DELETE_EFFECT';
  readonly description: string;
  private savedEffect: EffectKeyframe | null = null;
  constructor(private readonly effectId: string, private readonly store: EffectKeyframeStore) {
    this.description = `Delete effect keyframe ${effectId}`;
  }
  execute(): void {
    const ef = this.store.getEffectKeyframes().find((e) => e.id === this.effectId) ?? null;
    if (ef) {
      this.savedEffect = JSON.parse(JSON.stringify(ef));
    }
    this.store.removeEffectKeyframe(this.effectId);
  }
  undo(): void {
    if (this.savedEffect) this.store.addEffectKeyframe(JSON.parse(JSON.stringify(this.savedEffect)));
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { effectId: this.effectId, savedEffect: this.savedEffect } };
  }
}
