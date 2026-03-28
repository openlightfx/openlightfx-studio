<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    label, disabled = false, active = false, onclick, children,
  }: {
    label: string; disabled?: boolean; active?: boolean; onclick?: (e: MouseEvent) => void; children: Snippet;
  } = $props();
</script>

<button
  class="w-11 h-11 flex items-center justify-center rounded-lg transition-colors text-textMuted hover:text-text-base hover:bg-surface2 focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-40 disabled:cursor-not-allowed"
  class:bg-surface2={active}
  class:text-accent={active}
  {disabled} {onclick} aria-label={label} title={label}
>
  {@render children()}
</button>
