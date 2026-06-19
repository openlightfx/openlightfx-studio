<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import { untrack } from 'svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { AddChannelGroupCommand, DeleteChannelGroupCommand, EditChannelGroupCommand } from '$lib/commands/channel-group.js';
  import { generateId } from '$lib/services/id.js';
  import type { GroupMode, ChannelGroupOffset } from '$lib/types/channels.js';
  import { DEFAULT_SPREAD_OFFSET_MS, MIN_SPREAD_OFFSET_MS, MAX_SPREAD_OFFSET_MS } from '$lib/types/channels.js';

  let { onclose, editGroupId = null }: { onclose: () => void; editGroupId?: string | null } = $props();

  const channels = $derived(projectStore.file?.track.channels ?? []);
  const existingGroup = $derived(
    editGroupId ? projectStore.file?.channelGroups.find((g) => g.id === editGroupId) ?? null : null
  );

  const _init = untrack(() =>
    editGroupId ? projectStore.file?.channelGroups.find((g) => g.id === editGroupId) ?? null : null
  );
  let name = $state(_init?.name ?? '');
  let mode = $state<GroupMode>(_init?.mode ?? 'GROUP_MIRROR');
  let selectedChannelIds = $state<string[]>(_init?.channelIds ?? []);
  let spreadOffsetMs = $state(_init?.defaultSpreadOffsetMs ?? DEFAULT_SPREAD_OFFSET_MS);

  function toggleChannel(id: string) {
    if (selectedChannelIds.includes(id)) {
      selectedChannelIds = selectedChannelIds.filter((c) => c !== id);
    } else {
      selectedChannelIds = [...selectedChannelIds, id];
    }
  }

  function handleSave(): void {
    if (selectedChannelIds.length < 2 || !name.trim()) return;

    const offsets: ChannelGroupOffset[] = selectedChannelIds.map((channelId, i) => ({
      channelId,
      hueOffset: 0,
      brightnessOffset: 0,
      timingOffsetMs: mode === 'GROUP_SPREAD' ? i * spreadOffsetMs : 0,
    }));

    if (existingGroup) {
      undoStore.execute(new EditChannelGroupCommand(existingGroup.id, {
        name: name.trim(),
        mode,
        channelIds: [...selectedChannelIds],
        offsets,
        defaultSpreadOffsetMs: spreadOffsetMs,
      }, projectStore));
    } else {
      undoStore.execute(new AddChannelGroupCommand({
        id: generateId(),
        name: name.trim(),
        mode,
        channelIds: [...selectedChannelIds],
        offsets,
        defaultSpreadOffsetMs: spreadOffsetMs,
      }, projectStore));
    }
    onclose();
  }

  function handleDelete(): void {
    if (!existingGroup) return;
    undoStore.execute(new DeleteChannelGroupCommand(existingGroup.id, projectStore));
    onclose();
  }
</script>

<Modal title={existingGroup ? 'Edit Channel Group' : 'Create Channel Group'} {onclose}>
  <div class="space-y-4 min-w-[24rem]">
    <div>
      <label for="cg-name" class="block text-xs text-textMuted mb-1">Group Name</label>
      <input
        id="cg-name"
        type="text"
        class="w-full px-3 py-2 bg-surface2 border border-surface3 rounded text-sm text-text-base"
        bind:value={name}
        placeholder="e.g., Stereo Mirror"
      />
    </div>

    <div>
      <label for="cg-mode" class="block text-xs text-textMuted mb-1">Mode</label>
      <select
        id="cg-mode"
        class="w-full bg-surface2 text-text-base rounded-lg px-3 py-2 text-sm border border-surface3 focus:outline-none focus:ring-2 focus:ring-accent/50"
        bind:value={mode}
      >
        <option value="GROUP_MIRROR">Mirror — edits replicate to all members</option>
        <option value="GROUP_SPREAD">Spread — edits propagate with time offset</option>
        <option value="GROUP_ALTERNATE">Alternate — round-robin placement</option>
      </select>
    </div>

    <div>
      <p class="block text-xs text-textMuted mb-1">Channels (select 2+)</p>
      <div class="mt-1 space-y-1 max-h-[200px] overflow-y-auto">
        {#each channels as ch}
          <button
            class="flex items-center gap-2 w-full px-3 py-2 rounded text-sm text-left transition-colors {selectedChannelIds.includes(ch.id) ? 'bg-accent/20 border border-accent/40' : 'bg-surface2 border border-surface3 hover:bg-surface3'}"
            onclick={() => toggleChannel(ch.id)}
          >
            <span class="w-3 h-3 rounded-full {selectedChannelIds.includes(ch.id) ? 'bg-accent' : 'bg-surface3'}"></span>
            {ch.displayName}
          </button>
        {/each}
      </div>
    </div>

    {#if mode === 'GROUP_SPREAD'}
      <div>
        <label for="cg-spread" class="block text-xs text-textMuted mb-1">Spread Offset: {spreadOffsetMs}ms</label>
        <input
          id="cg-spread"
          type="range"
          min={MIN_SPREAD_OFFSET_MS}
          max={MAX_SPREAD_OFFSET_MS}
          step="10"
          bind:value={spreadOffsetMs}
          class="w-full h-1.5 rounded-full appearance-none bg-surface3 accent-accent cursor-pointer"
        />
      </div>
    {/if}

    <div class="flex items-center justify-between pt-2 border-t border-surface3">
      <div>
        {#if existingGroup}
          <Button variant="danger" size="sm" onclick={handleDelete}>
            Delete Group
          </Button>
        {/if}
      </div>
      <div class="flex gap-2">
        <Button variant="ghost" size="sm" onclick={onclose}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={selectedChannelIds.length < 2 || !name.trim()}
          onclick={handleSave}
        >
          {existingGroup ? 'Save' : 'Create Group'}
        </Button>
      </div>
    </div>
  </div>
</Modal>
