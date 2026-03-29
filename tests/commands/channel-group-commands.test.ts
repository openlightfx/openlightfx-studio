import { describe, it, expect } from 'vitest';
import type { ChannelGroup } from '$lib/types/channels.js';
import type { ChannelGroupStore } from '$lib/commands/channel-group.js';
import { AddChannelGroupCommand, DeleteChannelGroupCommand, EditChannelGroupCommand } from '$lib/commands/channel-group.js';

function makeStore(): ChannelGroupStore & { groups: ChannelGroup[] } {
  const groups: ChannelGroup[] = [];
  return {
    groups,
    getChannelGroups: () => groups,
    addChannelGroup: (g) => groups.push(g),
    removeChannelGroup: (id) => {
      const idx = groups.findIndex((g) => g.id === id);
      if (idx >= 0) groups.splice(idx, 1);
    },
    updateChannelGroup: (id, patch) => {
      const g = groups.find((g) => g.id === id);
      if (g) Object.assign(g, patch);
    },
  };
}

function makeGroup(): ChannelGroup {
  return {
    id: 'grp-1', name: 'Stereo Mirror', mode: 'GROUP_MIRROR',
    channelIds: ['left', 'right'], offsets: [], defaultSpreadOffsetMs: 150,
  };
}

describe('AddChannelGroupCommand', () => {
  it('adds and undoes', () => {
    const store = makeStore();
    const cmd = new AddChannelGroupCommand(makeGroup(), store);
    cmd.execute();
    expect(store.groups).toHaveLength(1);
    cmd.undo();
    expect(store.groups).toHaveLength(0);
  });
});

describe('DeleteChannelGroupCommand', () => {
  it('deletes and undoes', () => {
    const store = makeStore();
    store.addChannelGroup(makeGroup());
    const cmd = new DeleteChannelGroupCommand('grp-1', store);
    cmd.execute();
    expect(store.groups).toHaveLength(0);
    cmd.undo();
    expect(store.groups).toHaveLength(1);
    expect(store.groups[0].name).toBe('Stereo Mirror');
  });
});

describe('EditChannelGroupCommand', () => {
  it('edits and undoes', () => {
    const store = makeStore();
    store.addChannelGroup(makeGroup());
    const cmd = new EditChannelGroupCommand('grp-1', { mode: 'GROUP_SPREAD' }, store);
    cmd.execute();
    expect(store.groups[0].mode).toBe('GROUP_SPREAD');
    cmd.undo();
    expect(store.groups[0].mode).toBe('GROUP_MIRROR');
  });
});
