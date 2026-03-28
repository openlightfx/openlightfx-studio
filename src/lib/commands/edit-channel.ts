import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { Channel } from '$lib/types/track.js';

export interface ChannelEditStore {
  getChannels(): Channel[];
  updateChannel(id: string, patch: Partial<Channel>): void;
}

export class EditChannelCommand implements Command {
  readonly type = 'EDIT_CHANNEL';
  readonly description: string;
  private previousValues: Partial<Channel> = {};
  constructor(private readonly channelId: string, private readonly patch: Partial<Channel>, private readonly store: ChannelEditStore) {
    this.description = `Edit channel "${channelId}"`;
  }
  execute(): void {
    const ch = this.store.getChannels().find((c) => c.id === this.channelId);
    if (!ch) return;
    this.previousValues = {};
    for (const key of Object.keys(this.patch) as (keyof Channel)[]) {
      const val = ch[key];
      (this.previousValues as any)[key] = typeof val === 'object' && val !== null ? { ...val } : val;
    }
    this.store.updateChannel(this.channelId, this.patch);
  }
  undo(): void {
    this.store.updateChannel(this.channelId, this.previousValues);
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { channelId: this.channelId, patch: this.patch } };
  }
}
