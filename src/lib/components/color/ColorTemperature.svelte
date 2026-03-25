<script lang="ts">
  import {
    MIN_COLOR_TEMPERATURE,
    MAX_COLOR_TEMPERATURE,
    COLOR_TEMPERATURE_STEP,
  } from '$lib/types/track.js';
  import { kelvinToRgb, rgbToCssString } from '$lib/services/color-utils.js';

  let {
    kelvin,
    onchange,
  }: {
    kelvin: number;
    onchange: (kelvin: number) => void;
  } = $props();

  const previewColor = $derived(kelvinToRgb(kelvin));
  const previewCss = $derived(rgbToCssString(previewColor));

  // Build gradient stops for the track background
  const gradientStops = $derived.by(() => {
    const stops: string[] = [];
    const count = 10;
    for (let i = 0; i <= count; i++) {
      const k = MIN_COLOR_TEMPERATURE + (i / count) * (MAX_COLOR_TEMPERATURE - MIN_COLOR_TEMPERATURE);
      const pct = (i / count) * 100;
      stops.push(`${rgbToCssString(kelvinToRgb(k))} ${pct}%`);
    }
    return `linear-gradient(to right, ${stops.join(', ')})`;
  });

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    onchange(Number(target.value));
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between">
    <span class="text-xs font-medium text-textMuted">Color Temperature</span>
    <span class="text-xs font-semibold tabular-nums text-text-base">{kelvin}K</span>
  </div>

  <div class="flex flex-col gap-1">
    <div class="relative">
      <input
        type="range"
        min={MIN_COLOR_TEMPERATURE}
        max={MAX_COLOR_TEMPERATURE}
        step={COLOR_TEMPERATURE_STEP}
        value={kelvin}
        oninput={handleInput}
        class="temp-slider h-2 w-full cursor-pointer appearance-none rounded-full"
        style="background: {gradientStops};"
        aria-label="Color temperature in Kelvin"
        aria-valuemin={MIN_COLOR_TEMPERATURE}
        aria-valuemax={MAX_COLOR_TEMPERATURE}
        aria-valuenow={kelvin}
      />
    </div>
    <div class="flex justify-between">
      <span class="text-[10px] text-textMuted">Warm ({MIN_COLOR_TEMPERATURE}K)</span>
      <span class="text-[10px] text-textMuted">Cool ({MAX_COLOR_TEMPERATURE}K)</span>
    </div>
  </div>

  <div class="flex items-center gap-2">
    <div
      class="h-6 w-6 rounded border border-surface2"
      style="background-color: {previewCss};"
    ></div>
    <span class="text-xs tabular-nums text-textMuted">
      R:{previewColor.r} G:{previewColor.g} B:{previewColor.b}
    </span>
  </div>
</div>

<style>
  .temp-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    border: 2px solid var(--surface3);
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }

  .temp-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    border: 2px solid var(--surface3);
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }

  .temp-slider:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 9999px;
  }
</style>
