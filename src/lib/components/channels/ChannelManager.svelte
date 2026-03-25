<script lang="ts">
  import type { Channel } from '$lib/types/index.js';
  import type { ContextMenu as ContextMenuType } from '$lib/types/ui.js';
  import { Modal, Button, Badge, IconButton, ContextMenu } from '$lib/components/shared/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import AddChannelDialog from './AddChannelDialog.svelte';
  import TemplateDialog from './TemplateDialog.svelte';
  import GroupDialog from './GroupDialog.svelte';
  import type { ChannelGroup } from '$lib/types/index.js';

  // Solo/mute state (local UI state, not persisted in track)
  let soloSet = $state<Set<string>>(new Set());
  let muteSet = $state<Set<string>>(new Set());

  // Dialog state
  let showAddDialog = $state(false);
  let showTemplateDialog = $state(false);
  let showGroupDialog = $state(false);
  let editingGroup = $state<ChannelGroup | undefined>(undefined);

  // Context menu
  let contextMenu = $state<ContextMenuType | null>(null);

  // Delete confirmation
  let deleteConfirmOpen = $state(false);
  let pendingDeleteChannel = $state<Channel | null>(null);

  // Rename inline
  let renamingChannelId = $state<string | null>(null);
  let renameValue = $state('');

  // Drag reorder state
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  const channels = $derived(projectStore.channels);
  const groups = $derived(projectStore.channelGroups);

  // Build a map of channelId → groups for indicators
  const channelGroupMap = $derived.by(() => {
    const map = new Map<string, ChannelGroup[]>();
    for (const g of groups) {
      for (const chId of g.channelIds) {
        const existing = map.get(chId) ?? [];
        existing.push(g);
        map.set(chId, existing);
      }
    }
    return map;
  });

  // Group color palette for visual indicators
  const GROUP_COLORS = ['#6c63ff', '#ff6b6b', '#51cf66', '#fcc419', '#22b8cf', '#cc5de8', '#ff922b', '#20c997'];

  function groupColor(groupId: string): string {
    const idx = groups.findIndex((g) => g.id === groupId);
    return GROUP_COLORS[idx % GROUP_COLORS.length];
  }

  function modeLabel(mode: string): string {
    switch (mode) {
      case 'GROUP_MIRROR': return 'Mirror';
      case 'GROUP_SPREAD': return 'Spread';
      case 'GROUP_ALTERNATE': return 'Alternate';
      default: return mode;
    }
  }

  function spatialLabel(hint: string): string {
    if (hint === 'SPATIAL_UNSPECIFIED') return '';
    return hint
      .replace('SPATIAL_', '')
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
  }

  // Solo/mute handlers (STU-055 additive solo)
  function toggleSolo(channelId: string) {
    const next = new Set(soloSet);
    if (next.has(channelId)) {
      next.delete(channelId);
    } else {
      next.add(channelId);
    }
    soloSet = next;
  }

  function toggleMute(channelId: string) {
    const next = new Set(muteSet);
    if (next.has(channelId)) {
      next.delete(channelId);
    } else {
      next.add(channelId);
    }
    muteSet = next;
  }

  function isChannelAudible(channelId: string): boolean {
    if (muteSet.has(channelId)) return false;
    if (soloSet.size > 0 && !soloSet.has(channelId)) return false;
    return true;
  }

  // Context menu
  function showChannelMenu(e: MouseEvent, channel: Channel) {
    e.preventDefault();
    contextMenu = {
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: 'rename',
          label: 'Rename',
          icon: '✏',
          enabled: true,
          action: () => startRename(channel),
        },
        {
          id: 'duplicate',
          label: 'Duplicate',
          icon: '⧉',
          enabled: true,
          action: () => duplicateChannel(channel),
        },
        {
          id: 'properties',
          label: 'Channel Properties',
          icon: '⚙',
          enabled: true,
          action: () => {
            timelineStore.setActiveChannel(channel.id);
          },
        },
        { id: 'sep1', label: '', enabled: true, separator: true },
        {
          id: 'create-group',
          label: 'Create Group...',
          icon: '🔗',
          enabled: true,
          action: () => {
            editingGroup = undefined;
            showGroupDialog = true;
          },
        },
        { id: 'sep2', label: '', enabled: true, separator: true },
        {
          id: 'delete',
          label: 'Delete',
          icon: '🗑',
          enabled: true,
          action: () => confirmDelete(channel),
        },
      ],
    };
  }

  function startRename(channel: Channel) {
    renamingChannelId = channel.id;
    renameValue = channel.displayName;
  }

  function commitRename() {
    if (renamingChannelId && renameValue.trim().length > 0) {
      projectStore.updateChannel(renamingChannelId, { displayName: renameValue.trim() });
    }
    renamingChannelId = null;
    renameValue = '';
  }

  function cancelRename() {
    renamingChannelId = null;
    renameValue = '';
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  }

  function duplicateChannel(channel: Channel) {
    let newId = channel.id + '-copy';
    let suffix = 1;
    while (projectStore.channels.some((ch) => ch.id === newId)) {
      newId = channel.id + '-copy-' + suffix;
      suffix++;
    }
    projectStore.addChannel({
      id: newId,
      displayName: channel.displayName + ' (Copy)',
      description: channel.description,
      defaultColor: { ...channel.defaultColor },
      defaultBrightness: channel.defaultBrightness,
      spatialHint: channel.spatialHint,
      optional: channel.optional,
    });
  }

  function confirmDelete(channel: Channel) {
    pendingDeleteChannel = channel;
    deleteConfirmOpen = true;
  }

  function executeDelete() {
    if (pendingDeleteChannel) {
      projectStore.removeChannel(pendingDeleteChannel.id);
    }
    deleteConfirmOpen = false;
    pendingDeleteChannel = null;
  }

  function cancelDelete() {
    deleteConfirmOpen = false;
    pendingDeleteChannel = null;
  }

  // Drag & drop reorder
  function handleDragStart(e: DragEvent, index: number) {
    dragIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  function handleDrop(e: DragEvent, toIndex: number) {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== toIndex) {
      const reordered = [...channels];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(toIndex, 0, moved);
      projectStore.reorderChannels(reordered);
    }
    dragIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd() {
    dragIndex = null;
    dragOverIndex = null;
  }

  function editExistingGroup(group: ChannelGroup) {
    editingGroup = group;
    showGroupDialog = true;
  }

  function handleSelectChannel(channelId: string) {
    timelineStore.setActiveChannel(channelId);
  }
</script>

<div class="flex h-full flex-col bg-surface">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-surface2 px-3 py-2">
    <h3 class="text-xs font-semibold uppercase tracking-wider text-textMuted">Channels</h3>
    <div class="flex items-center gap-1">
      <IconButton icon="📋" title="From Template..." size="sm" onclick={() => (showTemplateDialog = true)} />
      <IconButton icon="＋" title="Add Channel" size="sm" onclick={() => (showAddDialog = true)} />
    </div>
  </div>

  <!-- Channel list -->
  <div class="flex-1 overflow-y-auto">
    {#each channels as channel, index (channel.id)}
      {@const audible = isChannelAudible(channel.id)}
      {@const channelGroups = channelGroupMap.get(channel.id) ?? []}
      {@const isActive = timelineStore.selection.activeChannelId === channel.id}
      <div
        class="group flex items-center gap-1.5 border-b border-surface2/50 px-2 py-1.5 transition-colors
          {isActive ? 'bg-accent/10' : 'hover:bg-surface2/50'}
          {!audible ? 'opacity-40' : ''}
          {dragOverIndex === index ? 'border-t-2 border-t-accent' : ''}"
        draggable="true"
        role="button"
        tabindex="0"
        ondragstart={(e) => handleDragStart(e, index)}
        ondragover={(e) => handleDragOver(e, index)}
        ondragleave={handleDragLeave}
        ondrop={(e) => handleDrop(e, index)}
        ondragend={handleDragEnd}
        onclick={() => handleSelectChannel(channel.id)}
        oncontextmenu={(e) => showChannelMenu(e, channel)}
      >
        <!-- Drag handle -->
        <span
          class="flex-shrink-0 cursor-grab text-xs text-textMuted/50 group-hover:text-textMuted active:cursor-grabbing"
          aria-hidden="true"
        >⠿</span>

        <!-- Group indicator brackets -->
        {#if channelGroups.length > 0}
          <div class="flex flex-shrink-0 gap-0.5">
            {#each channelGroups as cg (cg.id)}
              <button
                class="h-5 w-1.5 rounded-sm transition-opacity hover:opacity-80"
                style="background-color: {groupColor(cg.id)};"
                title="{cg.name} ({modeLabel(cg.mode)})"
                onclick={(e: MouseEvent) => { e.stopPropagation(); editExistingGroup(cg); }}
              ></button>
            {/each}
          </div>
        {/if}

        <!-- Color dot -->
        <span
          class="h-3 w-3 flex-shrink-0 rounded-full border border-white/10"
          style="background-color: rgb({channel.defaultColor.r}, {channel.defaultColor.g}, {channel.defaultColor.b});"
        ></span>

        <!-- Name -->
        <div class="flex min-w-0 flex-1 items-center gap-1.5">
          {#if renamingChannelId === channel.id}
            <input
              type="text"
              value={renameValue}
              oninput={(e) => (renameValue = (e.target as HTMLInputElement).value)}
              onblur={commitRename}
              onkeydown={handleRenameKeydown}
              class="min-w-0 flex-1 rounded border border-accent bg-surface2 px-1.5 py-0.5 text-xs text-text-base focus:outline-none"
              autofocus
            />
          {:else}
            <span class="truncate text-xs text-text-base">{channel.displayName}</span>
          {/if}

          {#if spatialLabel(channel.spatialHint)}
            <Badge text={spatialLabel(channel.spatialHint)} />
          {/if}
        </div>

        <!-- Solo / Mute buttons -->
        <div class="flex flex-shrink-0 items-center gap-0.5">
          <button
            class="flex h-5 w-5 items-center justify-center rounded text-2xs font-bold transition-colors
              {soloSet.has(channel.id)
                ? 'bg-accent text-white'
                : 'text-textMuted/60 hover:bg-surface2 hover:text-text-base'}"
            title={soloSet.has(channel.id) ? 'Unsolo' : 'Solo'}
            onclick={(e: MouseEvent) => { e.stopPropagation(); toggleSolo(channel.id); }}
          >S</button>
          <button
            class="flex h-5 w-5 items-center justify-center rounded text-2xs font-bold transition-colors
              {muteSet.has(channel.id)
                ? 'bg-danger/80 text-white'
                : 'text-textMuted/60 hover:bg-surface2 hover:text-text-base'}"
            title={muteSet.has(channel.id) ? 'Unmute' : 'Mute'}
            onclick={(e: MouseEvent) => { e.stopPropagation(); toggleMute(channel.id); }}
          >M</button>
        </div>

        <!-- Three-dot menu -->
        <button
          class="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-xs text-textMuted/60 opacity-0 transition-all group-hover:opacity-100 hover:bg-surface2 hover:text-text-base"
          title="Channel actions"
          onclick={(e: MouseEvent) => { e.stopPropagation(); showChannelMenu(e, channel); }}
        >⋯</button>
      </div>
    {/each}

    {#if channels.length === 0}
      <div class="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <p class="text-xs text-textMuted">No channels yet.</p>
        <div class="flex gap-2">
          <Button variant="secondary" size="sm" onclick={() => (showAddDialog = true)}>Add Channel</Button>
          <Button variant="ghost" size="sm" onclick={() => (showTemplateDialog = true)}>From Template...</Button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Groups section -->
  {#if groups.length > 0}
    <div class="border-t border-surface2">
      <div class="flex items-center justify-between px-3 py-1.5">
        <span class="text-2xs font-semibold uppercase tracking-wider text-textMuted">Groups</span>
      </div>
      <div class="flex flex-col gap-0.5 px-2 pb-2">
        {#each groups as group (group.id)}
          <button
            class="flex items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-surface2"
            onclick={() => editExistingGroup(group)}
          >
            <span
              class="h-2.5 w-2.5 rounded-sm flex-shrink-0"
              style="background-color: {groupColor(group.id)};"
            ></span>
            <span class="flex-1 truncate text-text-base">{group.name}</span>
            <Badge text={modeLabel(group.mode)} />
            <span class="text-2xs text-textMuted">{group.channelIds.length}ch</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Footer actions -->
  <div class="flex items-center gap-2 border-t border-surface2 px-3 py-2">
    <Button variant="secondary" size="sm" onclick={() => (showAddDialog = true)}>
      ＋ Add Channel
    </Button>
    <Button variant="ghost" size="sm" onclick={() => (showTemplateDialog = true)}>
      From Template...
    </Button>
  </div>
</div>

<!-- Context menu -->
<ContextMenu menu={contextMenu} onclose={() => (contextMenu = null)} />

<!-- Dialogs -->
<AddChannelDialog open={showAddDialog} onclose={() => (showAddDialog = false)} />
<TemplateDialog open={showTemplateDialog} onclose={() => (showTemplateDialog = false)} />
<GroupDialog
  open={showGroupDialog}
  editGroup={editingGroup}
  onclose={() => {
    showGroupDialog = false;
    editingGroup = undefined;
  }}
/>

<!-- Delete confirmation modal (STU-053) -->
<Modal open={deleteConfirmOpen} title="Delete Channel" onclose={cancelDelete} size="sm">
  {#if pendingDeleteChannel}
    <div class="flex flex-col gap-3">
      <p class="text-sm text-text-base">
        Are you sure you want to delete <strong>{pendingDeleteChannel.displayName}</strong>?
      </p>
      <p class="text-xs text-warning">
        ⚠ All keyframes and effect keyframes on this channel will be permanently lost.
      </p>
    </div>
  {/if}

  {#snippet footer()}
    <Button variant="ghost" onclick={cancelDelete}>Cancel</Button>
    <Button variant="danger" onclick={executeDelete}>Delete Channel</Button>
  {/snippet}
</Modal>
