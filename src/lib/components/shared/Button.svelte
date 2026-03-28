<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    variant = 'secondary', size = 'md', disabled = false, onclick, children,
  }: {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();

  const baseClasses = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-40 disabled:cursor-not-allowed';
  const sizeClasses = size === 'sm' ? 'px-3 py-1.5 text-sm min-h-[36px]' : 'px-4 py-2 text-sm min-h-[44px]';
  const variantClasses = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    secondary: 'bg-surface2 text-text-base hover:bg-surface3',
    ghost: 'text-textMuted hover:text-text-base hover:bg-surface2',
    danger: 'bg-danger/10 text-danger hover:bg-danger/20',
  }[variant];
</script>

<button class="{baseClasses} {sizeClasses} {variantClasses}" {disabled} {onclick}>
  {@render children()}
</button>
