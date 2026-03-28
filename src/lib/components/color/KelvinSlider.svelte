<script lang="ts">
  import { kelvinToRgb, rgbToCssString } from '$lib/services/color-utils.js';
  import type { RGBColor } from '$lib/types/index.js';

  let {
    temperature,
    onchange,
  }: {
    temperature: number;
    onchange: (temperature: number, color: RGBColor) => void;
  } = $props();

  const MIN_K = 1000;
  const MAX_K = 10000;
  const STEP = 100;

  // Pre-compute gradient stops at every 1000K
  const GRADIENT_STOPS = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
  const gradientCss = $derived(
    'linear-gradient(to right, ' +
      GRADIENT_STOPS.map((k) => rgbToCssString(kelvinToRgb(k))).join(', ') +
      ')',
  );

  let currentRgb = $derived(kelvinToRgb(temperature));

  function oninput(e: Event) {
    const k = parseInt((e.target as HTMLInputElement).value, 10);
    onchange(k, kelvinToRgb(k));
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center gap-3">
    <span class="text-xs text-textMuted w-16 shrink-0">Kelvin</span>
    <div class="relative flex-1">
      <div
        class="absolute inset-0 rounded-full h-2 top-1/2 -translate-y-1/2"
        style="background: {gradientCss};"
      ></div>
      <input
        type="range"
        class="relative w-full h-2 rounded-full appearance-none bg-transparent accent-accent [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface3 [&::-webkit-slider-thumb]:shadow-md"
        min={MIN_K}
        max={MAX_K}
        step={STEP}
        value={temperature}
        {oninput}
      />
    </div>
    <span class="text-xs text-textMuted w-16 text-right tabular-nums">{temperature}K</span>
  </div>

  <!-- Color swatch preview -->
  <div class="flex items-center gap-3 pl-[76px]">
    <div
      class="w-8 h-8 rounded-md border border-surface3 shrink-0"
      style="background-color: {rgbToCssString(currentRgb)};"
    ></div>
    <span class="text-xs text-textMuted">
      rgb({currentRgb.r}, {currentRgb.g}, {currentRgb.b})
    </span>
  </div>
</div>
