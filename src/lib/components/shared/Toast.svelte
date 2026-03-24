<script lang="ts">
  import type { Toast } from '$lib/types/ui.js';

  let {
    toasts,
    ondismiss,
  }: {
    toasts: Toast[];
    ondismiss: (id: string) => void;
  } = $props();

  const visibleToasts = $derived(toasts.slice(-5));

  const icons: Record<string, string> = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };

  const colorClasses: Record<string, string> = {
    info: 'border-accent bg-accent/10',
    success: 'border-success bg-success/10',
    warning: 'border-warning bg-warning/10',
    error: 'border-danger bg-danger/10',
  };

  const textClasses: Record<string, string> = {
    info: 'text-accent',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-danger',
  };
</script>

<div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" aria-live="polite">
  {#each visibleToasts as toast (toast.id)}
    <div
      class="animate-slide-up flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm {colorClasses[
        toast.type
      ]}"
      role="alert"
    >
      <span class="mt-0.5 text-sm" aria-hidden="true">{icons[toast.type]}</span>
      <p class="flex-1 text-sm text-text-base">{toast.message}</p>
      <button
        onclick={() => ondismiss(toast.id)}
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-textMuted transition-colors hover:text-text-base {textClasses[
          toast.type
        ]}"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  {/each}
</div>
