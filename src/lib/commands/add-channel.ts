import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Channel, Keyframe } from '$lib/types/track.js';
import { generateId } from '$lib/services/id.js';

export interface ChannelStore {
  getChannels(): Channel[];
  getKeyframes(): Keyframe[];
  addChannel(ch: Channel): void;
  removeChannel(id: string): void;
  addKeyframe(kf: Keyframe): void;
  removeKeyframe(id: string): void;
}

export class AddChannelCommand implements Command {
  readonly type = 'ADD_CHANNEL';
  readonly description: string;
  private readonly initialKeyframeId: string;
  constructor(private readonly channel: Channel, private readonly store: ChannelStore) {
    this.description = `Add channel "${channel.displayName}"`;
    this.initialKeyframeId = generateId();
  }
  execute(): void {
    this.store.addChannel({ ...this.channel });
    this.store.addKeyframe({
      id: this.initialKeyframeId, channelId: this.channel.id, timestampMs: 0,
      colorMode: 'RGB', color: { r: 0, g: 0, b: 0 }, colorTemperature: 0,
      brightness: 0, transitionMs: 0, interpolation: 'STEP', powerOn: false,
    });
  }
  undo(): void {
    this.store.removeKeyframe(this.initialKeyframeId);
    this.store.removeChannel(this.channel.id);
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { channel: this.channel } };
  }
}
