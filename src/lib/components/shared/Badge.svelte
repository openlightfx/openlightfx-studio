<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    text,
    variant = 'default',
    children,
  }: {
    text: string;
    variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
    children?: Snippet;
  } = $props();

  const variantClasses: Record<string, string> = {
    default: 'bg-surface2 text-textMuted',
    accent: 'bg-accent/20 text-accent',
    success: 'bg-success/20 text-success',
    warning: 'bg-warning/20 text-warning',
    danger: 'bg-danger/20 text-danger',
  };
</script>

<span
  class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium {variantClasses[
    variant
  ]}"
>
  {#if children}
    {@render children()}
  {/if}
  {text}
</span>
