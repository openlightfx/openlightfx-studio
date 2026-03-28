<script lang="ts">
  import { onMount } from 'svelte';
  import type { ContextMenuItem } from '$lib/types/ui.js';

  let { x, y, items, onclose }: { x: number; y: number; items: ContextMenuItem[]; onclose: () => void } = $props();

  let menuEl: HTMLDivElement;

  onMount(() => {
    function handleClick(e: MouseEvent) {
      if (menuEl && !menuEl.contains(e.target as Node)) onclose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onclose();
    }
    document.addEventListener('pointerdown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  });
</script>

<div bind:this={menuEl} class="fixed z-50 bg-surface rounded-xl shadow-2xl border border-surface3 py-1 min-w-[200px] animate-fade-in" style="top: {y}px; left: {x}px;">
  {#each items as item}
    {#if item.separator}
      <div class="h-px bg-surface3 my-1"></div>
    {:else}
      <button
        class="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-surface2 transition-colors min-h-[40px] disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={!item.enabled}
        onclick={() => { item.action?.(); onclose(); }}
      >
        <span class:text-textMuted={!item.enabled}>{item.label}</span>
        {#if item.shortcut}<span class="text-xs text-textMuted ml-4">{item.shortcut}</span>{/if}
      </button>
    {/if}
  {/each}
</div>
