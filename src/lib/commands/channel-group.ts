import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { ChannelGroup } from '$lib/types/channels.js';

export interface ChannelGroupStore {
  getChannelGroups(): ChannelGroup[];
  addChannelGroup(group: ChannelGroup): void;
  removeChannelGroup(id: string): void;
  updateChannelGroup(id: string, patch: Partial<ChannelGroup>): void;
}

export class AddChannelGroupCommand implements Command {
  readonly type = 'ADD_CHANNEL_GROUP';
  readonly description: string;
  constructor(private readonly group: ChannelGroup, private readonly store: ChannelGroupStore) {
    this.description = `Add channel group "${group.name}"`;
  }
  execute(): void {
    this.store.addChannelGroup({ ...this.group, channelIds: [...this.group.channelIds], offsets: this.group.offsets.map((o) => ({ ...o })) });
  }
  undo(): void { this.store.removeChannelGroup(this.group.id); }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { group: this.group } };
  }
}

export class DeleteChannelGroupCommand implements Command {
  readonly type = 'DELETE_CHANNEL_GROUP';
  readonly description: string;
  private savedGroup: ChannelGroup | null = null;
  constructor(private readonly groupId: string, private readonly store: ChannelGroupStore) {
    this.description = `Delete channel group ${groupId}`;
  }
  execute(): void {
    const g = this.store.getChannelGroups().find((g) => g.id === this.groupId) ?? null;
    if (g) this.savedGroup = { ...g, channelIds: [...g.channelIds], offsets: g.offsets.map((o) => ({ ...o })) };
    this.store.removeChannelGroup(this.groupId);
  }
  undo(): void {
    if (this.savedGroup) this.store.addChannelGroup({ ...this.savedGroup, channelIds: [...this.savedGroup.channelIds], offsets: this.savedGroup.offsets.map((o) => ({ ...o })) });
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { groupId: this.groupId, savedGroup: this.savedGroup } };
  }
}

export class EditChannelGroupCommand implements Command {
  readonly type = 'EDIT_CHANNEL_GROUP';
  readonly description: string;
  private previousValues: Partial<ChannelGroup> = {};
  constructor(private readonly groupId: string, private readonly patch: Partial<ChannelGroup>, private readonly store: ChannelGroupStore) {
    this.description = `Edit channel group ${groupId}`;
  }
  execute(): void {
    const g = this.store.getChannelGroups().find((g) => g.id === this.groupId);
    if (!g) return;
    this.previousValues = {};
    for (const key of Object.keys(this.patch) as (keyof ChannelGroup)[]) {
      const val = g[key];
      (this.previousValues as Record<string, unknown>)[key] = Array.isArray(val) ? [...val] : typeof val === 'object' && val !== null ? { ...val } : val;
    }
    this.store.updateChannelGroup(this.groupId, this.patch);
  }
  undo(): void {
    this.store.updateChannelGroup(this.groupId, this.previousValues);
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { groupId: this.groupId, patch: this.patch, previousValues: this.previousValues } };
  }
}
