<script lang="ts">
  let {
    icon,
    title,
    active = false,
    disabled = false,
    onclick,
    size = 'md',
  }: {
    icon: string;
    title: string;
    active?: boolean;
    disabled?: boolean;
    onclick?: () => void;
    size?: 'sm' | 'md';
  } = $props();

  const sizeClasses: Record<string, string> = {
    sm: 'h-7 w-7 text-sm',
    md: 'h-8 w-8 text-base',
  };
</script>

<button
  {disabled}
  {onclick}
  {title}
  aria-label={title}
  aria-pressed={active}
  class="inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
    {sizeClasses[size]}
    {active ? 'bg-accent/20 text-accent' : 'text-textMuted hover:bg-surface2 hover:text-text-base'}
    {disabled ? 'cursor-not-allowed opacity-40' : ''}"
>
  {icon}
</button>
