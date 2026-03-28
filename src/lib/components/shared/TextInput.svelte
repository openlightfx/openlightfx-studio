<script lang="ts">
  let {
    label, value = $bindable(), placeholder = '', error = '',
  }: {
    label: string; value: string; placeholder?: string; error?: string;
  } = $props();
</script>

<div class="flex flex-col gap-1">
  <label class="text-xs text-textMuted">{label}</label>
  <input type="text" class="bg-surface2 text-text-base rounded-lg px-3 py-2 text-sm border border-surface3 focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px]" class:border-danger={error} bind:value {placeholder} />
  {#if error}<span class="text-xs text-danger">{error}</span>{/if}
</div>
