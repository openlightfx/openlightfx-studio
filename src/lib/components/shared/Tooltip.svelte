<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    text,
    position = 'top',
    children,
  }: {
    text: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    children: Snippet;
  } = $props();

  let visible = $state(false);
  let timeout: ReturnType<typeof setTimeout> | null = $state(null);

  function show() {
    timeout = setTimeout(() => {
      visible = true;
    }, 500);
  }

  function hide() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    visible = false;
  }

  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses: Record<string, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-surface2 border-x-transparent border-b-transparent',
    bottom:
      'bottom-full left-1/2 -translate-x-1/2 border-b-surface2 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-surface2 border-y-transparent border-r-transparent',
    right:
      'right-full top-1/2 -translate-y-1/2 border-r-surface2 border-y-transparent border-l-transparent',
  };
</script>

<div
  class="relative inline-flex"
  role="group"
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
>
  {@render children()}

  {#if visible && text}
    <div
      class="animate-fade-in pointer-events-none absolute z-[80] whitespace-nowrap rounded bg-surface2 px-2 py-1 text-xs text-text-base shadow-lg {positionClasses[
        position
      ]}"
      role="tooltip"
    >
      {text}
      <span class="absolute border-4 {arrowClasses[position]}" aria-hidden="true"></span>
    </div>
  {/if}
</div>
