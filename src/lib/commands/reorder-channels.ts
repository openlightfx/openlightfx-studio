import type { Command, SerializedCommandData } from '$lib/types/commands.js';

export interface ChannelOrderStore {
  getChannelOrder(): string[];
  setChannelOrder(ids: string[]): void;
}

export class ReorderChannelsCommand implements Command {
  readonly type = 'REORDER_CHANNELS';
  readonly description = 'Reorder channels';
  private previousOrder: string[] = [];
  constructor(private readonly newOrder: string[], private readonly store: ChannelOrderStore) {}
  execute(): void {
    this.previousOrder = [...this.store.getChannelOrder()];
    this.store.setChannelOrder(this.newOrder);
  }
  undo(): void {
    this.store.setChannelOrder(this.previousOrder);
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { newOrder: this.newOrder, previousOrder: this.previousOrder } };
  }
}
