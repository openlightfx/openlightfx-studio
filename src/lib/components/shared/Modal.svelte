<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onclick={handleBackdrop}>
  <div class="bg-surface rounded-xl shadow-2xl border border-surface3 w-full max-w-lg mx-4 p-6 animate-slide-up" role="dialog" aria-modal="true" aria-label={title}>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-text-base">{title}</h2>
      <button class="text-textMuted hover:text-text-base p-1 rounded-lg hover:bg-surface2 transition-colors" onclick={onclose} aria-label="Close">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
    {@render children()}
  </div>
</div>
