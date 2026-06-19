<script lang="ts">
  import Slider from '$lib/components/shared/Slider.svelte';
  import type { RGBColor } from '$lib/types/index.js';

  let {
    color,
    onchange,
  }: {
    color: RGBColor;
    onchange: (color: RGBColor) => void;
  } = $props();

  let r = $state(0);
  let g = $state(0);
  let b = $state(0);
  // Flag to suppress re-emission when syncing from external color prop
  let syncing = false;

  // Sync incoming color into local state
  $effect(() => {
    syncing = true;
    r = color.r;
    g = color.g;
    b = color.b;
    // Clear flag after reactive updates settle
    Promise.resolve().then(() => { syncing = false; });
  });

  function handleInput() {
    if (!syncing) onchange({ r, g, b });
  }
</script>

<div class="flex flex-col gap-2" oninput={handleInput}>
  <Slider label="R" bind:value={r} min={0} max={255} step={1} />
  <Slider label="G" bind:value={g} min={0} max={255} step={1} />
  <Slider label="B" bind:value={b} min={0} max={255} step={1} />
</div>
