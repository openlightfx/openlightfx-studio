<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';

  let {
    anchorRect, onclose, children,
  }: {
    anchorRect: { x: number; y: number; width: number; height: number };
    onclose: () => void;
    children: Snippet;
  } = $props();

  let popoverEl: HTMLDivElement;
  let style = $state('');
  let isBottomSheet = $state(false);

  onMount(() => {
    isBottomSheet = window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches;
    if (!isBottomSheet) positionPopover();

    function handleClick(e: MouseEvent) {
      if (popoverEl && !popoverEl.contains(e.target as Node)) onclose();
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

  function positionPopover() {
    if (!popoverEl) return;
    const rect = popoverEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = anchorRect.y + anchorRect.height + 8;
    let left = anchorRect.x;
    if (top + rect.height > vh) top = anchorRect.y - rect.height - 8;
    if (left + rect.width > vw) left = vw - rect.width - 8;
    left = Math.max(8, left);
    style = `top: ${top}px; left: ${left}px;`;
  }
</script>

{#if isBottomSheet}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 bg-black/40" onclick={onclose}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div bind:this={popoverEl} class="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl border-t border-surface3 p-4 max-h-[70vh] overflow-y-auto animate-slide-up" onclick={(e) => e.stopPropagation()}>
      <div class="w-10 h-1 bg-surface3 rounded-full mx-auto mb-3"></div>
      {@render children()}
    </div>
  </div>
{:else}
  <div bind:this={popoverEl} class="fixed z-50 bg-surface rounded-xl shadow-2xl border border-surface3 p-4 min-w-[280px] animate-fade-in" {style}>
    {@render children()}
  </div>
{/if}
