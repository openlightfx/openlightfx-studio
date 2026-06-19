<script lang="ts">
  const sliderId = crypto.randomUUID();
  let {
    label, value = $bindable(), min = 0, max = 100, step = 1, unit = '',
  }: {
    label: string; value: number; min?: number; max?: number; step?: number; unit?: string;
  } = $props();
</script>

<div class="flex items-center gap-3">
  <label for={sliderId} class="text-xs text-textMuted w-16 shrink-0">{label}</label>
  <input id={sliderId} type="range" class="flex-1 h-2 rounded-full appearance-none bg-surface3 accent-accent [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:appearance-none" bind:value {min} {max} {step} />
  <span class="text-xs text-textMuted w-12 text-right tabular-nums">{value}{unit}</span>
</div>
