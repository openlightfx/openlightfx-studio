<script lang="ts">
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { EditChannelCommand } from '$lib/commands/edit-channel.js';
  import { ReorderChannelsCommand } from '$lib/commands/reorder-channels.js';
  import { rgbToCssString } from '$lib/services/color-utils.js';
  import { CHANNEL_LANE_HEIGHT, CHANNEL_HEADER_WIDTH, RULER_HEIGHT } from '$lib/types/timeline.js';
  import ChannelPopover from '$lib/components/properties/ChannelPopover.svelte';

  interface Props {
    scrollY?: number;
    onScrollY?: (y: number) => void;
  }

  let { scrollY = 0, onScrollY }: Props = $props();

  // Track which group is being edited (for channel group dialog)
  let editingGroupId = $state<string | null>(null);

  // Track which channel is being edited
  let editingChannelId = $state<string | null>(null);
  let editingName = $state('');
  let editInputEl = $state<HTMLInputElement | null>(null);

  // Focus the edit input programmatically when it mounts
  $effect(() => {
    if (editInputEl) editInputEl.focus();
  });

  // Scroll container ref
  let containerEl = $state<HTMLDivElement | null>(null);

  // Sync scroll position from parent
  $effect(() => {
    const el = containerEl;
    if (!el) return;
    if (el.scrollTop !== scrollY) {
      el.scrollTop = scrollY;
    }
  });

  function startEdit(channelId: string, currentName: string) {
    editingChannelId = channelId;
    editingName = currentName;
  }

  function commitEdit(channelId: string) {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== getChannelName(channelId)) {
      undoStore.execute(new EditChannelCommand(channelId, { displayName: trimmed }, projectStore));
    }
    editingChannelId = null;
    editingName = '';
  }

  function cancelEdit() {
    editingChannelId = null;
    editingName = '';
  }

  function getChannelName(id: string): string {
    return projectStore.file?.track.channels.find((c) => c.id === id)?.displayName ?? '';
  }

  function handleNameKeydown(e: KeyboardEvent, channelId: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(channelId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }

  function handleScroll(e: Event) {
    const el = e.currentTarget as HTMLDivElement;
    onScrollY?.(el.scrollTop);
  }

  const channels = $derived(projectStore.file?.track.channels ?? []);

  // Drag-to-reorder state
  let draggedChannelId = $state<string | null>(null);
  let dropTargetIndex = $state<number | null>(null);

  function handleDragStart(e: DragEvent, channelId: string) {
    draggedChannelId = channelId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', channelId);
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dropTargetIndex = index;
  }

  function handleDragLeave() {
    dropTargetIndex = null;
  }

  function handleDrop(e: DragEvent, targetIndex: number) {
    e.preventDefault();
    dropTargetIndex = null;
    if (!draggedChannelId) return;

    const currentOrder = channels.map((c) => c.id);
    const fromIndex = currentOrder.indexOf(draggedChannelId);
    if (fromIndex === -1 || fromIndex === targetIndex) {
      draggedChannelId = null;
      return;
    }

    const newOrder = [...currentOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(targetIndex, 0, moved);

    undoStore.execute(new ReorderChannelsCommand(newOrder, projectStore));
    draggedChannelId = null;
  }

  function handleDragEnd() {
    draggedChannelId = null;
    dropTargetIndex = null;
  }

  // Channel popover state
  let channelPopoverOpen = $state(false);
  let channelPopoverId = $state('');
  let channelPopoverAnchor = $state({ x: 0, y: 0, width: 0, height: 0 });
</script>

<div
  class="channel-headers relative flex-shrink-0 overflow-y-auto overflow-x-hidden bg-[#1a1a2e] border-r border-[#2f2f4a] select-none"
  style="width: {CHANNEL_HEADER_WIDTH}px;"
  bind:this={containerEl}
  onscroll={handleScroll}
>
  <!-- Ruler spacer to align with the timeline ruler -->
  <div
    class="sticky top-0 z-10 bg-[#1a1a2e] border-b border-[#2f2f4a] flex items-center px-2"
    style="height: {RULER_HEIGHT}px;"
  >
    <span class="text-[10px] text-[#94a3b8] uppercase tracking-wide font-medium">Channels</span>
  </div>

  <!-- Channel rows -->
  {#each channels as channel, index (channel.id)}
    {@const isSolo = timelineStore.soloChannelIds.has(channel.id)}
    {@const isMuted = timelineStore.mutedChannelIds.has(channel.id)}
    {@const isActive = timelineStore.activeChannelId === channel.id}
    {@const colorDot = rgbToCssString(channel.defaultColor)}
    {@const group = projectStore.file?.channelGroups.find((g) => g.channelIds.includes(channel.id))}

    {#if dropTargetIndex === index && draggedChannelId !== channel.id}
      <div class="h-0.5 bg-accent rounded-full mx-2"></div>
    {/if}

    <div
      class="channel-row flex items-center gap-1 px-2 border-b border-[#252540] transition-colors"
      class:bg-[#252540]={isActive}
      class:hover:bg-[#20203a]={!isActive}
      class:opacity-50={draggedChannelId === channel.id}
      style="height: {CHANNEL_LANE_HEIGHT}px;"
      role="row"
      tabindex="0"
      draggable="true"
      ondragstart={(e) => handleDragStart(e, channel.id)}
      ondragover={(e) => handleDragOver(e, index)}
      ondragleave={handleDragLeave}
      ondrop={(e) => handleDrop(e, index)}
      ondragend={handleDragEnd}
      oncontextmenu={(e) => {
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        channelPopoverId = channel.id;
        channelPopoverAnchor = {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        };
        channelPopoverOpen = true;
      }}
    >
      <!-- Drag grip (stubbed) -->
      <div
        class="flex-shrink-0 cursor-grab text-[#94a3b8] hover:text-[#e2e8f0] opacity-40 hover:opacity-70 transition-opacity"
        title="Drag to reorder"
        aria-label="Drag to reorder channel"
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="3" r="1.5" />
          <circle cx="7" cy="3" r="1.5" />
          <circle cx="3" cy="7" r="1.5" />
          <circle cx="7" cy="7" r="1.5" />
          <circle cx="3" cy="11" r="1.5" />
          <circle cx="7" cy="11" r="1.5" />
        </svg>
      </div>

      <!-- Color dot -->
      <div
        class="flex-shrink-0 w-2.5 h-2.5 rounded-full ring-1 ring-white/20"
        style="background-color: {colorDot};"
        aria-hidden="true"
      ></div>

      <!-- Channel name (double-click to edit) -->
      <div class="flex-1 min-w-0">
        {#if editingChannelId === channel.id}
          <input
            bind:this={editInputEl}
            class="w-full bg-[#0f0f1a] border border-[#6c63ff] rounded px-1 py-0.5 text-xs text-[#e2e8f0] outline-none focus:ring-1 focus:ring-[#6c63ff]"
            type="text"
            bind:value={editingName}
            onblur={() => commitEdit(channel.id)}
            onkeydown={(e) => handleNameKeydown(e, channel.id)}
          />
        {:else}
          <span
            class="block truncate text-xs text-[#e2e8f0] cursor-default"
            title={channel.displayName}
            ondblclick={() => startEdit(channel.id, channel.displayName)}
            role="button"
            tabindex="0"
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === 'F2') startEdit(channel.id, channel.displayName);
            }}
            aria-label="Channel name: {channel.displayName}. Double-click to edit."
            >{channel.displayName}</span
          >
        {/if}
      </div>

      <!-- Channel group indicator -->
      {#if group}
        <button
          class="flex-shrink-0 ml-1 text-xs px-1 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors leading-none"
          title="{group.name} ({group.mode.replace('GROUP_', '')})"
          onclick={() => {
            editingGroupId = group.id;
            uiStore.openModal('channel-group');
          }}
          aria-label="Edit group: {group.name}"
        >
          {group.mode === 'GROUP_MIRROR' ? '↔' : group.mode === 'GROUP_SPREAD' ? '→' : '↻'}
        </button>
      {/if}

      <!-- Solo button -->
      <button
        class="flex-shrink-0 w-5 h-5 rounded text-[10px] font-bold transition-colors leading-none"
        class:bg-[#6c63ff]={isSolo}
        class:text-white={isSolo}
        class:bg-[#252540]={!isSolo}
        class:text-[#94a3b8]={!isSolo}
        class:hover:bg-[#2f2f4a]={!isSolo}
        onclick={() => timelineStore.toggleSolo(channel.id)}
        title={isSolo ? 'Unsolo channel' : 'Solo channel'}
        aria-label={isSolo ? 'Unsolo channel' : 'Solo channel'}
        aria-pressed={isSolo}>S</button
      >

      <!-- Mute button -->
      <button
        class="flex-shrink-0 w-5 h-5 rounded text-[10px] font-bold transition-colors leading-none"
        class:bg-[#ef4444]={isMuted}
        class:text-white={isMuted}
        class:bg-[#252540]={!isMuted}
        class:text-[#94a3b8]={!isMuted}
        class:hover:bg-[#2f2f4a]={!isMuted}
        onclick={() => timelineStore.toggleMute(channel.id)}
        title={isMuted ? 'Unmute channel' : 'Mute channel'}
        aria-label={isMuted ? 'Unmute channel' : 'Mute channel'}
        aria-pressed={isMuted}>M</button
      >
    </div>
  {/each}

  <!-- Empty state -->
  {#if channels.length === 0}
    <div class="flex items-center justify-center py-4 px-2">
      <span class="text-[10px] text-[#94a3b8] text-center">No channels</span>
    </div>
  {/if}
</div>

{#if channelPopoverOpen}
  <ChannelPopover
    channelId={channelPopoverId}
    anchorRect={channelPopoverAnchor}
    bind:isOpen={channelPopoverOpen}
  />
{/if}
