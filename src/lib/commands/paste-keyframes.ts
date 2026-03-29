import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Keyframe } from '$lib/types/track.js';
import type { KeyframeStore } from './add-keyframe.js';

export class PasteKeyframesCommand implements Command {
  readonly type = 'PASTE_KEYFRAMES';
  readonly description: string;
  private pastedIds: string[] = [];

  constructor(
    private readonly sourceKeyframes: Keyframe[],
    private readonly targetChannelId: string,
    private readonly targetTimestampMs: number,
    private readonly baseTimestampMs: number,
    private readonly generateId: () => string,
    private readonly store: KeyframeStore,
  ) {
    this.description = `Paste ${sourceKeyframes.length} keyframe(s)`;
  }

  execute(): void {
    const offset = this.targetTimestampMs - this.baseTimestampMs;
    this.pastedIds = [];

    for (const source of this.sourceKeyframes) {
      const id = this.generateId();
      this.pastedIds.push(id);
      this.store.addKeyframe({
        ...source,
        id,
        channelId: this.targetChannelId,
        timestampMs: Math.max(0, source.timestampMs + offset),
        color: { ...source.color },
      });
    }
  }

  undo(): void {
    for (const id of this.pastedIds) {
      this.store.removeKeyframe(id);
    }
  }

  serialize(): SerializedCommandData {
    return {
      type: this.type,
      description: this.description,
      payload: {
        sourceKeyframes: this.sourceKeyframes,
        targetChannelId: this.targetChannelId,
        targetTimestampMs: this.targetTimestampMs,
        baseTimestampMs: this.baseTimestampMs,
      },
    };
  }
}
