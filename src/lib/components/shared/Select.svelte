<script lang="ts">
  let {
    label, value = $bindable(), options,
  }: {
    label: string; value: string; options: { value: string; label: string }[];
  } = $props();
</script>

<div class="flex items-center gap-3">
  <label class="text-xs text-textMuted w-16 shrink-0">{label}</label>
  <select class="flex-1 bg-surface2 text-text-base rounded-lg px-3 py-2 text-sm border border-surface3 focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px]" bind:value>
    {#each options as opt}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>
</div>
