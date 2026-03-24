<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    onclick,
    children,
    title,
  }: {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    onclick?: () => void;
    children: Snippet;
    title?: string;
  } = $props();

  const variantClasses: Record<string, string> = {
    primary: 'bg-accent text-white hover:bg-accent-hover active:brightness-90',
    secondary: 'bg-surface2 text-text-base hover:bg-surface3 active:brightness-90',
    ghost: 'bg-transparent text-text-base hover:bg-surface2 active:bg-surface3',
    danger: 'bg-danger text-white hover:brightness-110 active:brightness-90',
  };

  const sizeClasses: Record<string, string> = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-4 py-1.5 text-sm',
    lg: 'px-5 py-2 text-sm',
  };
</script>

<button
  {disabled}
  {onclick}
  {title}
  class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg
    {variantClasses[variant]} {sizeClasses[size]}
    {disabled ? 'cursor-not-allowed opacity-40' : ''}"
>
  {@render children()}
</button>
