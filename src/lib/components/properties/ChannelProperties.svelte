<script lang="ts">
  import type { Channel, RGBColor, SpatialHint } from '$lib/types/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { TextInput, Select, Slider } from '$lib/components/shared/index.js';
  import { rgbToHex, hexToRgb, rgbToCssString } from '$lib/services/color-utils.js';

  let {
    channelId,
  }: {
    channelId: string;
  } = $props();

  const channel = $derived(
    projectStore.project.file.track.channels.find((c: Channel) => c.id === channelId)
  );

  let descriptionValue = $state('');

  $effect(() => {
    if (channel) {
      descriptionValue = channel.description;
    }
  });

  const hexColor = $derived(channel ? rgbToHex(channel.defaultColor).toUpperCase() : '#000000');

  const spatialHintOptions: { value: string; label: string }[] = [
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

  function update(updates: Partial<Channel>) {
    projectStore.updateChannel(channelId, updates);
  }

  function handleDisplayName(value: string) {
    update({ displayName: value });
  }

  function handleDescription(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    descriptionValue = target.value;
    update({ description: target.value });
  }

  function handleDefaultColorR(value: number) {
    if (!channel) return;
    update({ defaultColor: { ...channel.defaultColor, r: Math.round(value) } });
  }

  function handleDefaultColorG(value: number) {
    if (!channel) return;
    update({ defaultColor: { ...channel.defaultColor, g: Math.round(value) } });
  }

  function handleDefaultColorB(value: number) {
    if (!channel) return;
    update({ defaultColor: { ...channel.defaultColor, b: Math.round(value) } });
  }

  function handleHexColor(value: string) {
    const parsed = hexToRgb(value);
    if (parsed) {
      update({ defaultColor: parsed });
    }
  }

  function handleBrightness(value: number) {
    update({ defaultBrightness: value });
  }

  function handleSpatialHint(value: string) {
    update({ spatialHint: value as SpatialHint });
  }

  function handleOptional() {
    if (!channel) return;
    update({ optional: !channel.optional });
  }
</script>

{#if channel}
  <div class="flex flex-col gap-4">
    <!-- Identity -->
    <section class="flex flex-col gap-3">
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-textMuted">Channel ID</span>
        <span class="rounded-md border border-surface2 bg-surface2/50 px-3 py-1.5 text-sm font-mono text-text-base">
          {channel.id}
        </span>
      </div>

      <TextInput
        value={channel.displayName}
        label="Display Name"
        placeholder="e.g. Left Wall"
        oninput={handleDisplayName}
      />

      <div class="flex flex-col gap-1.5">
        <label for="channel-description" class="text-xs font-medium text-textMuted">Description</label>
        <textarea
          id="channel-description"
          value={descriptionValue}
          oninput={handleDescription}
          placeholder="Optional channel description"
          rows={3}
          class="w-full resize-y rounded-md border border-surface2 bg-surface2 px-3 py-1.5 text-sm text-text-base placeholder-textMuted/50 transition-colors hover:border-surface3 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-bg"
        ></textarea>
      </div>
    </section>

    <hr class="border-surface2" />

    <!-- Default Color -->
    <section class="flex flex-col gap-3">
      <h4 class="text-xs font-semibold uppercase tracking-wider text-textMuted">Default Color</h4>

      <div class="flex items-center gap-3">
        <button
          class="h-8 w-8 shrink-0 rounded-md border border-surface3 shadow-sm"
          style="background-color: {rgbToCssString(channel.defaultColor)};"
          title="Default color"
          aria-label="Default color swatch"
        ></button>
        <TextInput
          value={hexColor.slice(1)}
          label="Hex"
          placeholder="FF0000"
          oninput={handleHexColor}
        />
      </div>

      <Slider value={channel.defaultColor.r} min={0} max={255} step={1} label="R" onchange={handleDefaultColorR} />
      <Slider value={channel.defaultColor.g} min={0} max={255} step={1} label="G" onchange={handleDefaultColorG} />
      <Slider value={channel.defaultColor.b} min={0} max={255} step={1} label="B" onchange={handleDefaultColorB} />
    </section>

    <hr class="border-surface2" />

    <!-- Brightness & Spatial -->
    <section class="flex flex-col gap-3">
      <Slider
        value={channel.defaultBrightness}
        min={0}
        max={100}
        step={1}
        label="Default Brightness"
        onchange={handleBrightness}
      />

      <Select
        value={channel.spatialHint}
        options={spatialHintOptions}
        label="Spatial Hint"
        onchange={handleSpatialHint}
      />

      <div class="flex items-center justify-between">
        <label for="channel-optional" class="text-xs font-medium text-textMuted">Optional</label>
        <button
          id="channel-optional"
          role="switch"
          aria-checked={channel.optional}
          aria-label="Toggle optional"
          onclick={handleOptional}
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors
            {channel.optional ? 'bg-accent' : 'bg-surface3'}"
        >
          <span
            class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform
              {channel.optional ? 'translate-x-4' : 'translate-x-0.5'}"
          ></span>
        </button>
      </div>
    </section>
  </div>
{:else}
  <p class="text-sm text-textMuted">Channel not found.</p>
{/if}
