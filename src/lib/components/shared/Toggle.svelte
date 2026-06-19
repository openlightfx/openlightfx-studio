<script lang="ts">
  let { label, checked = $bindable(), onclick }: {
    label: string;
    checked: boolean;
    onclick?: () => void;
  } = $props();
</script>

<label class="flex items-center gap-3 cursor-pointer min-h-[44px]">
  {#if label}<span class="text-xs text-textMuted">{label}</span>{/if}
  <button
    role="switch"
    aria-checked={checked}
    aria-label={label || 'Toggle'}
    class="relative w-10 h-6 rounded-full transition-colors"
    class:bg-accent={checked}
    class:bg-surface3={!checked}
    onclick={() => { checked = !checked; onclick?.(); }}
  >
    <span class="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform" class:translate-x-5={checked} class:translate-x-1={!checked}></span>
  </button>
</label>
