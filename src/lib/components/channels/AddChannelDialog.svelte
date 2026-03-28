<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import TextInput from '$lib/components/shared/TextInput.svelte';
  import Select from '$lib/components/shared/Select.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { AddChannelCommand } from '$lib/commands/add-channel.js';
  import { DEFAULT_RGB_COLOR, DEFAULT_BRIGHTNESS } from '$lib/types/track.js';
  import type { SpatialHint, Channel } from '$lib/types/track.js';

  let {
    isOpen = $bindable(),
  }: {
    isOpen: boolean;
  } = $props();

  const CHANNEL_ID_REGEX = /^[a-z0-9_-]{1,64}$/;

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

  let channelId = $state('');
  let displayName = $state('');
  let spatialHint = $state<SpatialHint>('SPATIAL_UNSPECIFIED');
  let channelIdError = $state('');
  let displayNameError = $state('');

  function validateChannelId(id: string): string {
    if (!id.trim()) return 'Channel ID is required';
    if (!CHANNEL_ID_REGEX.test(id)) return 'Use only lowercase letters, digits, hyphens, or underscores (max 64 chars)';
    const existing = projectStore.file ? projectStore.getChannels().map((c) => c.id) : [];
    if (existing.includes(id)) return 'A channel with this ID already exists';
    return '';
  }

  function validateDisplayName(name: string): string {
    if (!name.trim()) return 'Display name is required';
    return '';
  }

  function handleAdd() {
    channelIdError = validateChannelId(channelId);
    displayNameError = validateDisplayName(displayName);
    if (channelIdError || displayNameError) return;

    const channel: Channel = {
      id: channelId.trim(),
      displayName: displayName.trim(),
      description: '',
      defaultColor: { ...DEFAULT_RGB_COLOR },
      defaultBrightness: DEFAULT_BRIGHTNESS,
      spatialHint,
      optional: true,
    };

    undoStore.execute(new AddChannelCommand(channel, projectStore));
    handleClose();
  }

  function handleClose() {
    isOpen = false;
    channelId = '';
    displayName = '';
    spatialHint = 'SPATIAL_UNSPECIFIED';
    channelIdError = '';
    displayNameError = '';
  }

  function handleChannelIdInput() {
    if (channelIdError) channelIdError = validateChannelId(channelId);
  }

  function handleDisplayNameInput() {
    if (displayNameError) displayNameError = validateDisplayName(displayName);
  }
</script>

{#if isOpen}
  <Modal title="Add Channel" onclose={handleClose}>
    <div class="flex flex-col gap-4">
      <div oninput={handleChannelIdInput}>
        <TextInput
          label="Channel ID"
          bind:value={channelId}
          placeholder="e.g. ambient, left, surround-right"
          error={channelIdError}
        />
      </div>
      <p class="text-xs text-textMuted -mt-2">
        Lowercase letters, digits, hyphens, and underscores only. Cannot be changed later.
      </p>

      <div oninput={handleDisplayNameInput}>
        <TextInput
          label="Display Name"
          bind:value={displayName}
          placeholder="e.g. Ambient"
          error={displayNameError}
        />
      </div>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div onchange={() => {}}>
        <Select
          label="Spatial"
          bind:value={spatialHint}
          options={spatialOptions}
        />
      </div>

      <div class="flex gap-2 justify-end pt-1">
        <Button variant="secondary" size="md" onclick={handleClose}>
          Cancel
        </Button>
        <Button variant="primary" size="md" onclick={handleAdd}>
          Add Channel
        </Button>
      </div>
    </div>
  </Modal>
{/if}
