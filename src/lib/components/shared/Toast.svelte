<script lang="ts">
  import { toastStore } from '$lib/stores/index.js';

  const typeColors: Record<string, string> = {
    info: 'border-accent2', success: 'border-success', warning: 'border-warning', error: 'border-danger',
  };
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
  {#each toastStore.toasts as toast (toast.id)}
    <div class="pointer-events-auto bg-surface rounded-lg shadow-xl border-l-4 {typeColors[toast.type]} px-4 py-3 text-sm text-text-base animate-slide-up max-w-sm">
      <div class="flex items-center justify-between gap-3">
        <span>{toast.message}</span>
        <button class="text-textMuted hover:text-text-base shrink-0" onclick={() => toastStore.dismiss(toast.id)} aria-label="Dismiss">&times;</button>
      </div>
    </div>
  {/each}
</div>
