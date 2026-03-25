<script lang="ts">
  import type { RGBColor } from '$lib/types/index.js';
  import {
    rgbToHsl,
    hslToRgb,
  } from '$lib/services/color-utils.js';

  let {
    color,
    onchange,
  }: {
    color: RGBColor;
    onchange: (color: RGBColor) => void;
  } = $props();

  const SPECTRUM_WIDTH = 256;
  const SPECTRUM_HEIGHT = 128;

  let canvas: HTMLCanvasElement | undefined = $state();
  let isDragging = $state(false);

  // Derive HSL from current color
  const hsl = $derived(rgbToHsl(color));

  // Crosshair position on the spectrum
  const crosshairX = $derived((hsl.h / 360) * SPECTRUM_WIDTH);
  const crosshairY = $derived((1 - hsl.s / 100) * SPECTRUM_HEIGHT);

  // Render the spectrum canvas whenever lightness changes
  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const lightness = hsl.l;
    const imageData = ctx.createImageData(SPECTRUM_WIDTH, SPECTRUM_HEIGHT);
    const data = imageData.data;

    for (let y = 0; y < SPECTRUM_HEIGHT; y++) {
      const saturation = (1 - y / SPECTRUM_HEIGHT) * 100;
      for (let x = 0; x < SPECTRUM_WIDTH; x++) {
        const hue = (x / SPECTRUM_WIDTH) * 360;
        const rgb = hslToRgb(hue, saturation, lightness);
        const idx = (y * SPECTRUM_WIDTH + x) * 4;
        data[idx] = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  });

  function pickFromPosition(clientX: number, clientY: number) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(SPECTRUM_WIDTH - 1, ((clientX - rect.left) / rect.width) * SPECTRUM_WIDTH));
    const y = Math.max(0, Math.min(SPECTRUM_HEIGHT - 1, ((clientY - rect.top) / rect.height) * SPECTRUM_HEIGHT));

    const hue = (x / SPECTRUM_WIDTH) * 360;
    const saturation = (1 - y / SPECTRUM_HEIGHT) * 100;
    onchange(hslToRgb(hue, saturation, hsl.l));
  }

  function handlePointerDown(e: PointerEvent) {
    isDragging = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pickFromPosition(e.clientX, e.clientY);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging) return;
    pickFromPosition(e.clientX, e.clientY);
  }

  function handlePointerUp() {
    isDragging = false;
  }

  function handleLightnessChange(e: Event) {
    const val = Number((e.target as HTMLInputElement).value);
    onchange(hslToRgb(hsl.h, hsl.s, val));
  }

  const lightnessPct = $derived(((hsl.l) / 100) * 100);
</script>

<div class="flex flex-col gap-2">
  <!-- Spectrum canvas -->
  <div class="relative" style="width: 100%; aspect-ratio: {SPECTRUM_WIDTH}/{SPECTRUM_HEIGHT};">
    <canvas
      bind:this={canvas}
      width={SPECTRUM_WIDTH}
      height={SPECTRUM_HEIGHT}
      class="h-full w-full cursor-crosshair rounded border border-surface2"
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      role="slider"
      aria-label="Color spectrum: hue and saturation"
      aria-valuenow={Math.round(hsl.h)}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuetext="Hue {Math.round(hsl.h)}°, Saturation {Math.round(hsl.s)}%"
      tabindex="0"
    ></canvas>
    <!-- Crosshair -->
    <div
      class="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
      style="left: {(hsl.h / 360) * 100}%; top: {(1 - hsl.s / 100) * 100}%; box-shadow: 0 0 2px rgba(0,0,0,0.6);"
    ></div>
  </div>

  <!-- Lightness slider -->
  <div class="flex items-center gap-2">
    <span class="text-xs text-textMuted">L</span>
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      value={Math.round(hsl.l)}
      oninput={handleLightnessChange}
      class="lightness-slider h-1.5 w-full flex-1 cursor-pointer appearance-none rounded-full"
      style="background: linear-gradient(to right, #000 0%, hsl({Math.round(hsl.h)}, {Math.round(hsl.s)}%, 50%) 50%, #fff 100%);"
      aria-label="Lightness"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hsl.l)}
    />
    <span class="w-7 text-right text-xs tabular-nums text-textMuted">{Math.round(hsl.l)}</span>
  </div>
</div>

<style>
  .lightness-slider::-webkit-slider-thumb {
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

  .lightness-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: white;
    border: 2px solid var(--surface3);
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .lightness-slider:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 9999px;
  }
</style>
