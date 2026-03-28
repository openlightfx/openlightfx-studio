<script lang="ts">
  import { rgbToCssString, rgbEqual } from '$lib/services/color-utils.js';
  import { MAX_COLOR_HISTORY, LS_KEY_COLOR_HISTORY } from '$lib/types/ui.js';
  import type { ColorHistoryEntry } from '$lib/types/ui.js';
  import type { RGBColor } from '$lib/types/index.js';

  let {
    onselect,
  }: {
    onselect: (color: RGBColor) => void;
  } = $props();

  let history = $state<ColorHistoryEntry[]>([]);

  // Load from localStorage on mount
  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(LS_KEY_COLOR_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw) as ColorHistoryEntry[];
        if (Array.isArray(parsed)) history = parsed.slice(0, MAX_COLOR_HISTORY);
      }
    } catch {
      // ignore malformed data
    }
  });

  // Persist whenever history changes
  $effect(() => {
    if (typeof localStorage === 'undefined') return;
    // Accessing history[0] to create reactive dependency
    void history.length;
    localStorage.setItem(LS_KEY_COLOR_HISTORY, JSON.stringify(history));
  });

  // Expose a method for parent to add a color to history
  export function addColor(color: RGBColor) {
    // Remove any existing entry with the same color
    const filtered = history.filter((e) => !rgbEqual(e.color, color));
    history = [{ color, addedAt: Date.now() }, ...filtered].slice(0, MAX_COLOR_HISTORY);
  }
</script>

<div class="flex flex-col gap-2">
  <span class="text-xs text-textMuted">Recent Colors</span>
  <div class="grid grid-cols-8 gap-1">
    {#each Array(MAX_COLOR_HISTORY) as _, i}
      {#if history[i]}
        {@const entry = history[i]}
        <button
          class="w-8 h-8 rounded-md border border-surface3 hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-accent/50"
          style="background-color: {rgbToCssString(entry.color)};"
          title="rgb({entry.color.r}, {entry.color.g}, {entry.color.b})"
          onclick={() => onselect(entry.color)}
          aria-label="Apply color rgb({entry.color.r}, {entry.color.g}, {entry.color.b})"
        ></button>
      {:else}
        <div class="w-8 h-8 rounded-md border border-surface3/40 bg-surface2/30"></div>
      {/if}
    {/each}
  </div>
</div>
