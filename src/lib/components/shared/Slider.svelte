<script lang="ts">
  let {
    value,
    min,
    max,
    step = 1,
    label,
    onchange,
  }: {
    value: number;
    min: number;
    max: number;
    step?: number;
    label?: string;
    onchange: (value: number) => void;
  } = $props();

  const inputId = $derived(`slider-${label?.replace(/\s+/g, '-').toLowerCase() ?? 'input'}`);
  const percentage = $derived(((value - min) / (max - min)) * 100);

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    onchange(Number(target.value));
  }
</script>

<div class="flex flex-col gap-1.5">
  {#if label}
    <div class="flex items-center justify-between">
      <label for={inputId} class="text-xs font-medium text-textMuted">{label}</label>
      <span class="text-xs tabular-nums text-text-base">{value}</span>
    </div>
  {/if}

  <div class="relative flex items-center">
    <input
      id={inputId}
      type="range"
      {min}
      {max}
      {step}
      {value}
      oninput={handleInput}
      class="slider-input h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface2"
      style="background: linear-gradient(to right, var(--accent) 0%, var(--accent) {percentage}%, var(--surface2) {percentage}%, var(--surface2) 100%);"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
    />
  </div>

  {#if !label}
    <div class="text-right">
      <span class="text-xs tabular-nums text-textMuted">{value}</span>
    </div>
  {/if}
</div>

<style>
  .slider-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg);
    cursor: pointer;
    box-shadow: 0 0 4px rgba(108, 99, 255, 0.4);
    transition: box-shadow 150ms ease;
  }

  .slider-input::-webkit-slider-thumb:hover {
    box-shadow: 0 0 8px rgba(108, 99, 255, 0.7);
  }

  .slider-input::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--bg);
    cursor: pointer;
    box-shadow: 0 0 4px rgba(108, 99, 255, 0.4);
    transition: box-shadow 150ms ease;
  }

  .slider-input::-moz-range-thumb:hover {
    box-shadow: 0 0 8px rgba(108, 99, 255, 0.7);
  }

  .slider-input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 9999px;
  }
</style>
