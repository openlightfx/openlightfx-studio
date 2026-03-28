import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Channel, Keyframe } from '$lib/types/track.js';
import type { ChannelStore } from './add-channel.js';

export class DeleteChannelCommand implements Command {
  readonly type = 'DELETE_CHANNEL';
  readonly description: string;
  private savedChannel: Channel | null = null;
  private savedKeyframes: Keyframe[] = [];
  constructor(private readonly channelId: string, private readonly store: ChannelStore) {
    this.description = `Delete channel "${channelId}"`;
  }
  execute(): void {
    this.savedChannel = this.store.getChannels().find((c) => c.id === this.channelId) ?? null;
    if (this.savedChannel) this.savedChannel = { ...this.savedChannel, defaultColor: { ...this.savedChannel.defaultColor } };
    this.savedKeyframes = this.store.getKeyframes()
      .filter((kf) => kf.channelId === this.channelId)
      .map((kf) => ({ ...kf, color: { ...kf.color } }));
    for (const kf of this.savedKeyframes) this.store.removeKeyframe(kf.id);
    this.store.removeChannel(this.channelId);
  }
  undo(): void {
    if (this.savedChannel) this.store.addChannel({ ...this.savedChannel });
    for (const kf of this.savedKeyframes) this.store.addKeyframe({ ...kf });
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { channelId: this.channelId } };
  }
}
