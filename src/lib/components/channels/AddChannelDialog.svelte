<script lang="ts">
  import type { SpatialHint, RGBColor } from '$lib/types/index.js';
  import { Modal, Button, TextInput, Select, Slider } from '$lib/components/shared/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';

  let {
    open,
    onclose,
  }: {
    open: boolean;
    onclose: () => void;
  } = $props();

  const CHANNEL_ID_REGEX = /^[a-z0-9_-]{1,64}$/;

  const SPATIAL_HINT_OPTIONS: { value: SpatialHint; label: string }[] = [
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
  let defaultColor = $state<RGBColor>({ r: 0, g: 0, b: 0 });
  let colorHex = $state('#000000');
  let defaultBrightness = $state(50);
  let optional = $state(true);

  const idError = $derived.by(() => {
    if (channelId.length === 0) return 'Channel ID is required';
    if (!CHANNEL_ID_REGEX.test(channelId)) return 'Only lowercase a-z, 0-9, hyphens, underscores (1-64 chars)';
    if (projectStore.channels.some((ch) => ch.id === channelId)) return 'Channel ID already exists';
    return '';
  });

  const isValid = $derived(channelId.length > 0 && idError === '' && displayName.trim().length > 0);

  function rgbToHex(c: RGBColor): string {
    return '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function hexToRgb(hex: string): RGBColor | null {
    const m = hex.match(/^#([0-9a-f]{6})$/i);
    if (!m) return null;
    return {
      r: parseInt(m[1].slice(0, 2), 16),
      g: parseInt(m[1].slice(2, 4), 16),
      b: parseInt(m[1].slice(4, 6), 16),
    };
  }

  function handleColorInput(hex: string) {
    colorHex = hex;
    const rgb = hexToRgb(hex);
    if (rgb) defaultColor = rgb;
  }

  function handleSwatchChange(e: Event) {
    const target = e.target as HTMLInputElement;
    colorHex = target.value;
    const rgb = hexToRgb(target.value);
    if (rgb) defaultColor = rgb;
  }

  function resetForm() {
    channelId = '';
    displayName = '';
    spatialHint = 'SPATIAL_UNSPECIFIED';
    defaultColor = { r: 0, g: 0, b: 0 };
    colorHex = '#000000';
    defaultBrightness = 50;
    optional = true;
  }

  function handleCreate() {
    if (!isValid) return;
    projectStore.addChannel({
      id: channelId,
      displayName: displayName.trim(),
      spatialHint,
      defaultColor: { ...defaultColor },
      defaultBrightness,
      optional,
    });
    resetForm();
    onclose();
  }

  function handleClose() {
    resetForm();
    onclose();
  }
</script>

<Modal open={open} title="Add Channel" onclose={handleClose} size="md">
  <div class="flex flex-col gap-4">
    <TextInput
      value={channelId}
      label="Channel ID"
      placeholder="e.g. left, ambient-1"
      error={channelId.length > 0 ? idError : undefined}
      oninput={(v) => (channelId = v)}
    />

    <TextInput
      value={displayName}
      label="Display Name"
      placeholder="e.g. Left, Ambient"
      oninput={(v) => (displayName = v)}
    />

    <Select
      value={spatialHint}
      options={SPATIAL_HINT_OPTIONS}
      label="Spatial Hint"
      onchange={(v) => (spatialHint = v as SpatialHint)}
    />

    <div class="flex flex-col gap-1.5">
      <label for="channel-default-color" class="text-xs font-medium text-textMuted">Default Color</label>
      <div class="flex items-center gap-3">
        <input
          id="channel-default-color"
          type="color"
          value={rgbToHex(defaultColor)}
          oninput={handleSwatchChange}
          class="h-8 w-10 cursor-pointer rounded border border-surface2 bg-transparent"
        />
        <input
          type="text"
          value={colorHex}
          placeholder="#000000"
          oninput={(e) => handleColorInput((e.target as HTMLInputElement).value)}
          class="w-24 rounded-md border border-surface2 bg-surface2 px-3 py-1.5 text-sm text-text-base placeholder-textMuted/50 font-mono focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-bg"
        />
      </div>
    </div>

    <Slider
      value={defaultBrightness}
      min={0}
      max={100}
      step={1}
      label="Default Brightness"
      onchange={(v) => (defaultBrightness = v)}
    />

    <label class="flex items-center gap-2 text-sm text-text-base">
      <input
        type="checkbox"
        checked={optional}
        onchange={(e) => (optional = (e.target as HTMLInputElement).checked)}
        class="h-4 w-4 rounded border-surface2 bg-surface2 text-accent focus:ring-accent"
      />
      Optional channel
    </label>
  </div>

  {#snippet footer()}
    <Button variant="ghost" onclick={handleClose}>Cancel</Button>
    <Button variant="primary" disabled={!isValid} onclick={handleCreate}>Create</Button>
  {/snippet}
</Modal>
