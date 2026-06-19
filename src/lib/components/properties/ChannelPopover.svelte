<script lang="ts">
  import Popover from '$lib/components/shared/Popover.svelte';
  import TextInput from '$lib/components/shared/TextInput.svelte';
  import Select from '$lib/components/shared/Select.svelte';
  import Toggle from '$lib/components/shared/Toggle.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { EditChannelCommand } from '$lib/commands/edit-channel.js';
  import { DeleteChannelCommand } from '$lib/commands/delete-channel.js';
  import { AddChannelCommand } from '$lib/commands/add-channel.js';
  import { generateId } from '$lib/services/id.js';
  import { rgbToCssString, rgbToHex } from '$lib/services/color-utils.js';
  import type { SpatialHint, Channel } from '$lib/types/track.js';

  let {
    channelId,
    anchorRect,
    isOpen = $bindable(),
  }: {
    channelId: string;
    anchorRect: { x: number; y: number; width: number; height: number };
    isOpen: boolean;
  } = $props();

  let channel = $derived(projectStore.getChannels().find((c) => c.id === channelId));

  // Local editable state synced from channel
  let displayName = $state('');
  let description = $state('');
  let spatialHint = $state<SpatialHint>('SPATIAL_UNSPECIFIED');
  let optional = $state(false);
  let displayNameError = $state('');

  // Track last value synced from store to detect user-driven changes
  let lastSyncedOptional = false;

  // Confirmation state for delete
  let confirmDelete = $state(false);

  // Sync local state when channel changes (keyed on channelId + channel identity)
  $effect(() => {
    if (!channel) return;
    displayName = channel.displayName;
    description = channel.description;
    spatialHint = channel.spatialHint;
    optional = channel.optional;
    lastSyncedOptional = channel.optional;
    displayNameError = '';
  });


  function applyPatch(patch: Partial<Channel>) {
    if (!channel) return;
    undoStore.execute(new EditChannelCommand(channelId, patch, projectStore));
  }

  function handleDisplayNameBlur() {
    if (!channel) return;
    const trimmed = displayName.trim();
    if (!trimmed) {
      displayNameError = 'Name cannot be empty';
      displayName = channel.displayName; // revert
      return;
    }
    displayNameError = '';
    if (trimmed !== channel.displayName) {
      applyPatch({ displayName: trimmed });
    }
  }

  function handleDescriptionBlur() {
    if (!channel) return;
    if (description !== channel.description) {
      applyPatch({ description });
    }
  }

  function handleSpatialHintChange() {
    applyPatch({ spatialHint });
  }

  function handleOptionalToggle() {
    // Only dispatch if the value differs from what was last synced from the store
    if (optional !== lastSyncedOptional) {
      lastSyncedOptional = optional;
      applyPatch({ optional });
    }
  }

  function handleDuplicate() {
    if (!channel) return;
    const newChannel: Channel = {
      ...channel,
      id: generateId(),
      displayName: `${channel.displayName} (copy)`,
    };
    undoStore.execute(new AddChannelCommand(newChannel, projectStore));
    isOpen = false;
  }

  function handleDeleteRequest() {
    confirmDelete = true;
  }

  function handleDeleteConfirm() {
    undoStore.execute(new DeleteChannelCommand(channelId, projectStore));
    isOpen = false;
  }

  function handleDeleteCancel() {
    confirmDelete = false;
  }

  const spatialOptions: { value: SpatialHint; label: string }[] = [
    { value: 'SPATIAL_UNSPECIFIED', label: 'Unspecified' },
    { value: 'SPATIAL_LEFT', label: 'Left' },
    { value: 'SPATIAL_RIGHT', label: 'Right' },
    { value: 'SPATIAL_CENTER', label: 'Center' },
    { value: 'SPATIAL_SURROUND_LEFT', label: 'Surround Left' },
    { value: 'SPATIAL_SURROUND_RIGHT', label: 'Surround Right' },
    { value: 'SPATIAL_CEILING', label: 'Ceiling' },
    { value: 'SPATIAL_FLOOR', label: 'Floor' },
    { value: 'SPATIAL_BEHIND_SCREEN', label: 'Behind Screen' },
    { value: 'SPATIAL_AMBIENT', label: 'Ambient' },
  ];
</script>

{#if isOpen && channel}
  <Popover {anchorRect} onclose={() => { isOpen = false; confirmDelete = false; }}>
    <div class="flex flex-col gap-3 w-[280px]">

      <!-- Channel ID (read-only) -->
      <div class="flex flex-col gap-1">
        <span class="text-xs text-textMuted">Channel ID</span>
        <span class="text-xs font-mono text-text-base bg-surface2 rounded-lg px-3 py-2 border border-surface3 truncate select-all" title={channelId}>{channelId}</span>
      </div>

      <!-- Display name -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div onblur={handleDisplayNameBlur}>
        <TextInput
          label="Name"
          bind:value={displayName}
          placeholder="Channel name"
          error={displayNameError}
        />
      </div>

      <!-- Description -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div onblur={handleDescriptionBlur}>
        <TextInput
          label="Description"
          bind:value={description}
          placeholder="Optional description"
        />
      </div>

      <!-- Spatial hint -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div onchange={handleSpatialHintChange}>
        <Select
          label="Spatial"
          bind:value={spatialHint}
          options={spatialOptions}
        />
      </div>

      <!-- Default color (read-only swatch) -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-textMuted w-16 shrink-0">Default</span>
        <div
          class="w-8 h-8 rounded-md border border-surface3"
          style="background-color: {rgbToCssString(channel.defaultColor)};"
          title={rgbToHex(channel.defaultColor)}
        ></div>
        <span class="text-xs font-mono text-textMuted">{rgbToHex(channel.defaultColor)}</span>
      </div>

      <!-- Optional toggle -->
      <div class="flex items-center justify-between">
        <span class="text-xs text-textMuted">Optional</span>
        <Toggle label="" bind:checked={optional} onclick={handleOptionalToggle} />
      </div>

      <div class="border-t border-surface3"></div>

      <!-- Actions -->
      {#if confirmDelete}
        <div class="flex flex-col gap-2">
          <p class="text-sm text-text-base">Delete <strong>{channel.displayName}</strong> and all its keyframes?</p>
          <div class="flex gap-2">
            <Button variant="danger" size="sm" onclick={handleDeleteConfirm}>
              Delete
            </Button>
            <Button variant="secondary" size="sm" onclick={handleDeleteCancel}>
              Cancel
            </Button>
          </div>
        </div>
      {:else}
        <div class="flex gap-2">
          <Button variant="secondary" size="sm" onclick={handleDuplicate}>
            Duplicate
          </Button>
          <Button variant="danger" size="sm" onclick={handleDeleteRequest}>
            Delete
          </Button>
        </div>
      {/if}

    </div>
  </Popover>
{/if}
