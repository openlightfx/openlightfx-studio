<script lang="ts">
  import type { RGBColor } from '$lib/types/index.js';
  import { clampColorComponent, rgbToCssString } from '$lib/services/color-utils.js';

  let {
    color,
    onchange,
  }: {
    color: RGBColor;
    onchange: (color: RGBColor) => void;
  } = $props();

  const channels = [
    { key: 'r' as const, label: 'R', cssLow: (c: RGBColor) => rgbToCssString({ ...c, r: 0 }), cssHigh: (c: RGBColor) => rgbToCssString({ ...c, r: 255 }) },
    { key: 'g' as const, label: 'G', cssLow: (c: RGBColor) => rgbToCssString({ ...c, g: 0 }), cssHigh: (c: RGBColor) => rgbToCssString({ ...c, g: 255 }) },
    { key: 'b' as const, label: 'B', cssLow: (c: RGBColor) => rgbToCssString({ ...c, b: 0 }), cssHigh: (c: RGBColor) => rgbToCssString({ ...c, b: 255 }) },
  ] as const;

  function handleSlider(key: 'r' | 'g' | 'b', val: number) {
    onchange({ ...color, [key]: clampColorComponent(val) });
  }

  function handleNumberInput(key: 'r' | 'g' | 'b', e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseInt(target.value, 10);
    if (!isNaN(val)) {
      onchange({ ...color, [key]: clampColorComponent(val) });
    }
  }
</script>

<div class="flex flex-col gap-2">
  {#each channels as ch (ch.key)}
    {@const val = color[ch.key]}
    {@const pct = (val / 255) * 100}
    <div class="flex items-center gap-2">
      <span class="w-3 text-xs font-semibold text-textMuted">{ch.label}</span>
      <div class="relative flex-1">
        <input
          type="range"
          min="0"
          max="255"
          step="1"
          value={val}
          oninput={(e) => handleSlider(ch.key, Number((e.target as HTMLInputElement).value))}
          class="slider-input h-1.5 w-full cursor-pointer appearance-none rounded-full"
          style="background: linear-gradient(to right, {ch.cssLow(color)}, {ch.cssHigh(color)});"
          aria-label="{ch.label} channel"
          aria-valuemin={0}
          aria-valuemax={255}
          aria-valuenow={val}
        />
      </div>
      <input
        type="number"
        min="0"
        max="255"
        value={val}
        onchange={(e) => handleNumberInput(ch.key, e)}
        class="w-12 rounded border border-surface2 bg-surface2 px-1.5 py-0.5 text-center text-xs tabular-nums text-text-base focus:outline-none focus:ring-1 focus:ring-accent"
        aria-label="{ch.label} value"
      />
    </div>
  {/each}
</div>

<style>
  .slider-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: white;
    border: 2px solid var(--surface3);
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .slider-input::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: white;
    border: 2px solid var(--surface3);
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .slider-input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 9999px;
  }
</style>
