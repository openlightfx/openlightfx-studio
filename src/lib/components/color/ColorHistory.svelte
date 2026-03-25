<script lang="ts">
  import type { RGBColor } from '$lib/types/index.js';
  import type { ColorHistoryEntry } from '$lib/types/ui.js';
  import { MAX_COLOR_HISTORY, LS_KEY_COLOR_HISTORY } from '$lib/types/ui.js';
  import { rgbToCssString, areColorsEqual } from '$lib/services/color-utils.js';

  let {
    onselect,
  }: {
    onselect: (color: RGBColor) => void;
  } = $props();

  let history: ColorHistoryEntry[] = $state([]);

  function loadHistory(): void {
    try {
      const raw = localStorage.getItem(LS_KEY_COLOR_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          history = parsed.slice(0, MAX_COLOR_HISTORY);
        }
      }
    } catch {
      history = [];
    }
  }

  function saveHistory(): void {
    try {
      localStorage.setItem(LS_KEY_COLOR_HISTORY, JSON.stringify(history));
    } catch {
      // localStorage may be unavailable
    }
  }

  export function addColor(color: RGBColor): void {
    // Remove duplicate if exists
    const filtered = history.filter((e) => !areColorsEqual(e.color, color));
    history = [{ color, addedAt: Date.now() }, ...filtered].slice(0, MAX_COLOR_HISTORY);
    saveHistory();
  }

  $effect(() => {
    loadHistory();
  });
</script>

<div class="flex flex-col gap-1">
  <span class="text-xs font-medium text-textMuted">Recent Colors</span>
  <div class="grid grid-cols-8 gap-1">
    {#each history as entry (entry.addedAt)}
      <button
        type="button"
        class="h-5 w-5 rounded-sm border border-surface2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style="background-color: {rgbToCssString(entry.color)};"
        title="R:{entry.color.r} G:{entry.color.g} B:{entry.color.b}"
        onclick={() => onselect(entry.color)}
      ></button>
    {/each}

    {#each Array(Math.max(0, MAX_COLOR_HISTORY - history.length)) as _}
      <div class="h-5 w-5 rounded-sm border border-surface2 bg-surface1"></div>
    {/each}
  </div>
</div>
