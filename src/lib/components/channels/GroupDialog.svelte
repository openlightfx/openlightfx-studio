<script lang="ts">
  import type { GroupMode, ChannelGroup, ChannelGroupOffset } from '$lib/types/index.js';
  import {
    DEFAULT_SPREAD_OFFSET_MS,
    MIN_SPREAD_OFFSET_MS,
    MAX_SPREAD_OFFSET_MS,
    SPREAD_OFFSET_STEP_MS,
  } from '$lib/types/index.js';
  import { Modal, Button, TextInput, Select, Slider } from '$lib/components/shared/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';

  let {
    open,
    onclose,
    editGroup = undefined,
  }: {
    open: boolean;
    onclose: () => void;
    editGroup?: ChannelGroup;
  } = $props();

  const MODE_OPTIONS: { value: GroupMode; label: string }[] = [
    { value: 'GROUP_MIRROR', label: 'Mirror' },
    { value: 'GROUP_SPREAD', label: 'Spread' },
    { value: 'GROUP_ALTERNATE', label: 'Alternate' },
  ];

  let groupName = $state('');
  let mode = $state<GroupMode>('GROUP_MIRROR');
  let selectedChannelIds = $state<Set<string>>(new Set());
  let spreadOffsetMs = $state(DEFAULT_SPREAD_OFFSET_MS);
  let offsets = $state<Map<string, ChannelGroupOffset>>(new Map());
  let unlinked = $state<Set<string>>(new Set());
  let showPerChannelOffsets = $state(false);

  // Initialize form when editGroup changes or dialog opens
  $effect(() => {
    if (!open) return;
    if (editGroup) {
      groupName = editGroup.name;
      mode = editGroup.mode;
      selectedChannelIds = new Set(editGroup.channelIds);
      spreadOffsetMs = editGroup.defaultSpreadOffsetMs;
      const offsetMap = new Map<string, ChannelGroupOffset>();
      for (const o of editGroup.offsets) {
        offsetMap.set(o.channelId, { ...o });
      }
      offsets = offsetMap;
      unlinked = new Set();
      showPerChannelOffsets = editGroup.offsets.length > 0;
    } else {
      groupName = '';
      mode = 'GROUP_MIRROR';
      selectedChannelIds = new Set();
      spreadOffsetMs = DEFAULT_SPREAD_OFFSET_MS;
      offsets = new Map();
      unlinked = new Set();
      showPerChannelOffsets = false;
    }
  });

  const channels = $derived(projectStore.channels);

  function getOffset(channelId: string): ChannelGroupOffset {
    return (
      offsets.get(channelId) ?? { channelId, hueOffset: 0, brightnessOffset: 0, timingOffsetMs: 0 }
    );
  }

  function setOffset(
    channelId: string,
    field: keyof Omit<ChannelGroupOffset, 'channelId'>,
    value: number
  ) {
    const current = getOffset(channelId);
    const updated = { ...current, [field]: value };
    const next = new Map(offsets);
    next.set(channelId, updated);
    offsets = next;
  }

  function toggleChannel(channelId: string) {
    const next = new Set(selectedChannelIds);
    if (next.has(channelId)) {
      next.delete(channelId);
    } else {
      next.add(channelId);
    }
    selectedChannelIds = next;
  }

  function toggleUnlink(channelId: string) {
    const next = new Set(unlinked);
    if (next.has(channelId)) {
      next.delete(channelId);
    } else {
      next.add(channelId);
    }
    unlinked = next;
  }

  const isValid = $derived(groupName.trim().length > 0 && selectedChannelIds.size >= 2);

  function buildOffsets(): ChannelGroupOffset[] {
    const result: ChannelGroupOffset[] = [];
    for (const chId of selectedChannelIds) {
      const o = getOffset(chId);
      if (o.hueOffset !== 0 || o.brightnessOffset !== 0 || o.timingOffsetMs !== 0) {
        result.push(o);
      }
    }
    return result;
  }

  function handleSubmit() {
    if (!isValid) return;
    const channelIds = [...selectedChannelIds].filter((id) => !unlinked.has(id));
    const groupData: Partial<ChannelGroup> = {
      name: groupName.trim(),
      mode,
      channelIds,
      offsets: buildOffsets(),
      defaultSpreadOffsetMs: spreadOffsetMs,
    };
    if (editGroup) {
      projectStore.updateChannelGroup(editGroup.id, groupData);
    } else {
      projectStore.addChannelGroup(groupData);
    }
    onclose();
  }

  function handleClose() {
    onclose();
  }
</script>

<Modal
  {open}
  title={editGroup ? 'Edit Channel Group' : 'Create Channel Group'}
  onclose={handleClose}
  size="lg"
>
  <div class="flex flex-col gap-4">
    <TextInput
      value={groupName}
      label="Group Name"
      placeholder="e.g. Front Pair"
      oninput={(v) => (groupName = v)}
    />

    <Select
      value={mode}
      options={MODE_OPTIONS}
      label="Mode"
      onchange={(v) => (mode = v as GroupMode)}
    />

    {#if mode === 'GROUP_SPREAD'}
      <Slider
        value={spreadOffsetMs}
        min={MIN_SPREAD_OFFSET_MS}
        max={MAX_SPREAD_OFFSET_MS}
        step={SPREAD_OFFSET_STEP_MS}
        label="Spread Timing Offset (ms)"
        onchange={(v) => (spreadOffsetMs = v)}
      />
    {/if}

    <!-- Channel selection -->
    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-medium text-textMuted"
        >Channels ({selectedChannelIds.size} selected)</span
      >
      <div
        class="flex flex-col gap-1 rounded-lg border border-surface2 bg-surface2/30 p-2 max-h-48 overflow-y-auto"
      >
        {#each channels as ch (ch.id)}
          <label
            class="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-text-base transition-colors hover:bg-surface2"
          >
            <input
              type="checkbox"
              checked={selectedChannelIds.has(ch.id)}
              onchange={() => toggleChannel(ch.id)}
              class="h-4 w-4 rounded border-surface2 bg-surface2 text-accent focus:ring-accent"
            />
            <span
              class="h-3 w-3 rounded-full flex-shrink-0"
              style="background-color: rgb({ch.defaultColor.r}, {ch.defaultColor.g}, {ch
                .defaultColor.b});"
            ></span>
            <span>{ch.displayName}</span>
            <code class="text-2xs text-textMuted">{ch.id}</code>
          </label>
        {/each}
        {#if channels.length === 0}
          <p class="py-2 text-center text-xs text-textMuted">
            No channels available. Add channels first.
          </p>
        {/if}
      </div>
      {#if selectedChannelIds.size < 2 && selectedChannelIds.size > 0}
        <p class="text-xs text-warning">Select at least 2 channels for a group.</p>
      {/if}
    </div>

    <!-- Per-channel offsets -->
    {#if selectedChannelIds.size > 0}
      <button
        class="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
        onclick={() => (showPerChannelOffsets = !showPerChannelOffsets)}
      >
        <span class="transition-transform {showPerChannelOffsets ? 'rotate-90' : ''}">▸</span>
        Per-channel offsets
      </button>

      {#if showPerChannelOffsets}
        <div
          class="flex flex-col gap-3 rounded-lg border border-surface2 bg-surface2/30 p-3 max-h-64 overflow-y-auto"
        >
          {#each [...selectedChannelIds] as chId (chId)}
            {@const ch = projectStore.getChannel(chId)}
            {#if ch}
              <div
                class="flex flex-col gap-2 border-b border-surface2 pb-3 last:border-0 last:pb-0"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs font-medium text-text-base">{ch.displayName}</span>
                  <label class="flex items-center gap-1.5 text-2xs text-textMuted">
                    <input
                      type="checkbox"
                      checked={unlinked.has(chId)}
                      onchange={() => toggleUnlink(chId)}
                      class="h-3 w-3 rounded border-surface2 bg-surface2 text-warning focus:ring-warning"
                    />
                    Unlinked
                  </label>
                </div>

                <div
                  class="grid grid-cols-3 gap-2 {unlinked.has(chId)
                    ? 'opacity-40 pointer-events-none'
                    : ''}"
                >
                  <div class="flex flex-col gap-1">
                    <span class="text-2xs text-textMuted">Hue Offset (°)</span>
                    <input
                      type="number"
                      min="0"
                      max="360"
                      value={getOffset(chId).hueOffset}
                      oninput={(e) =>
                        setOffset(chId, 'hueOffset', Number((e.target as HTMLInputElement).value))}
                      class="w-full rounded border border-surface2 bg-surface2 px-2 py-1 text-xs text-text-base focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <span class="text-2xs text-textMuted">Brightness Offset</span>
                    <input
                      type="number"
                      min="-100"
                      max="100"
                      value={getOffset(chId).brightnessOffset}
                      oninput={(e) =>
                        setOffset(
                          chId,
                          'brightnessOffset',
                          Number((e.target as HTMLInputElement).value)
                        )}
                      class="w-full rounded border border-surface2 bg-surface2 px-2 py-1 text-xs text-text-base focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <span class="text-2xs text-textMuted">Timing (ms)</span>
                    <input
                      type="number"
                      min="0"
                      max="5000"
                      value={getOffset(chId).timingOffsetMs}
                      oninput={(e) =>
                        setOffset(
                          chId,
                          'timingOffsetMs',
                          Number((e.target as HTMLInputElement).value)
                        )}
                      class="w-full rounded border border-surface2 bg-surface2 px-2 py-1 text-xs text-text-base focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  {#snippet footer()}
    <Button variant="ghost" onclick={handleClose}>Cancel</Button>
    <Button variant="primary" disabled={!isValid} onclick={handleSubmit}>
      {editGroup ? 'Update' : 'Create'} Group
    </Button>
  {/snippet}
</Modal>
