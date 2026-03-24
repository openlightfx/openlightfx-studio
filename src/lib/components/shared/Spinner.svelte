<script lang="ts">
  let {
    size = 'md',
  }: {
    size?: 'sm' | 'md' | 'lg';
  } = $props();

  const sizeClasses: Record<string, string> = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-[3px]',
    lg: 'h-12 w-12 border-4',
  };
</script>

<div class="flex items-center justify-center" role="status" aria-label="Loading">
  <div class="animate-spin rounded-full border-accent/30 border-t-accent {sizeClasses[size]}"></div>
  <span class="sr-only">Loading…</span>
</div>
