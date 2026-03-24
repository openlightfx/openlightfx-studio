<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open,
    title,
    onclose,
    size = 'md',
    children,
    footer,
  }: {
    open: boolean;
    title: string;
    onclose: () => void;
    size?: 'sm' | 'md' | 'lg';
    children: Snippet;
    footer?: Snippet;
  } = $props();

  let dialogEl: HTMLDialogElement | undefined = $state();

  const sizeClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  };

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  // Focus trap: keep focus inside the dialog while open
  $effect(() => {
    if (!open || !dialogEl) return;

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onclose();
        return;
      }
      if (e.key !== 'Tab' || !dialogEl) return;

      const focusable = dialogEl.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) {
      onclose();
    }
  }
</script>

{#if open}
  <dialog
    bind:this={dialogEl}
    onclick={handleBackdropClick}
    class="fixed inset-0 z-50 m-0 h-full w-full max-h-full max-w-full bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm open:flex open:items-center open:justify-center"
  >
    <div
      class="animate-slide-up w-full {sizeClasses[
        size
      ]} rounded-lg border border-surface2 bg-surface shadow-2xl"
      role="document"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-surface2 px-5 py-3">
        <h2 class="text-sm font-semibold text-text-base">{title}</h2>
        <button
          onclick={onclose}
          class="flex h-7 w-7 items-center justify-center rounded text-textMuted transition-colors hover:bg-surface2 hover:text-text-base"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <!-- Body -->
      <div class="px-5 py-4 text-sm text-text-base">
        {@render children()}
      </div>

      <!-- Footer -->
      {#if footer}
        <div class="flex items-center justify-end gap-2 border-t border-surface2 px-5 py-3">
          {@render footer()}
        </div>
      {/if}
    </div>
  </dialog>
{/if}
