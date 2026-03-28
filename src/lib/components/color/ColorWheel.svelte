<script lang="ts">
  import { rgbToHsl, hslToRgb } from '$lib/services/color-utils.js';
  import type { RGBColor } from '$lib/types/index.js';

  let {
    color,
    onchange,
  }: {
    color: RGBColor;
    onchange: (color: RGBColor) => void;
  } = $props();

  const SIZE = 200;
  const RADIUS = SIZE / 2;

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let dragging = $state(false);

  let hsl = $derived(rgbToHsl(color));
  // Wheel position of the selector dot (hue + saturation only)
  let dotX = $derived(
    RADIUS + (hsl.s / 100) * RADIUS * Math.cos(((hsl.h - 90) * Math.PI) / 180),
  );
  let dotY = $derived(
    RADIUS + (hsl.s / 100) * RADIUS * Math.sin(((hsl.h - 90) * Math.PI) / 180),
  );

  $effect(() => {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    drawWheel(ctx);
  });

  // Redraw when lightness changes so the wheel tint updates
  $effect(() => {
    void hsl.l;
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    drawWheel(ctx);
  });

  function drawWheel(ctx: CanvasRenderingContext2D) {
    const imageData = ctx.createImageData(SIZE, SIZE);
    const data = imageData.data;
    const l = hsl.l;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - RADIUS;
        const dy = y - RADIUS;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * SIZE + x) * 4;

        if (dist <= RADIUS) {
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
          const h = (angle + 360) % 360;
          const s = (dist / RADIUS) * 100;
          const rgb = hslToRgb({ h, s, l });
          data[idx] = rgb.r;
          data[idx + 1] = rgb.g;
          data[idx + 2] = rgb.b;
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function pickFromPointer(e: PointerEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - RADIUS;
    const dy = y - RADIUS;
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), RADIUS);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    const h = (angle + 360) % 360;
    const s = (dist / RADIUS) * 100;
    onchange(hslToRgb({ h, s, l: hsl.l }));
  }

  function onpointerdown(e: PointerEvent) {
    dragging = true;
    canvasEl?.setPointerCapture(e.pointerId);
    pickFromPointer(e);
  }

  function onpointermove(e: PointerEvent) {
    if (!dragging) return;
    pickFromPointer(e);
  }

  function onpointerup(e: PointerEvent) {
    dragging = false;
    canvasEl?.releasePointerCapture(e.pointerId);
  }

  function onLightnessInput(e: Event) {
    const v = parseFloat((e.target as HTMLInputElement).value);
    onchange(hslToRgb({ h: hsl.h, s: hsl.s, l: v }));
  }
</script>

<div class="flex flex-col items-center gap-3">
  <!-- Wheel -->
  <div class="relative" style="width:{SIZE}px; height:{SIZE}px;">
    <canvas
      bind:this={canvasEl}
      width={SIZE}
      height={SIZE}
      class="rounded-full cursor-crosshair touch-none"
      {onpointerdown}
      {onpointermove}
      {onpointerup}
    ></canvas>
    <!-- Selector dot -->
    <div
      class="absolute w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"
      style="left:{dotX}px; top:{dotY}px;"
    ></div>
  </div>

  <!-- Lightness slider -->
  <div class="w-full flex items-center gap-3 px-1">
    <span class="text-xs text-textMuted w-16 shrink-0">Lightness</span>
    <div class="relative flex-1">
      <div
        class="absolute inset-0 rounded-full h-2 top-1/2 -translate-y-1/2"
        style="background: linear-gradient(to right, #000, hsl({hsl.h}deg, {hsl.s}%, 50%), #fff);"
      ></div>
      <input
        type="range"
        class="relative flex-1 w-full h-2 rounded-full appearance-none bg-transparent accent-accent [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface3 [&::-webkit-slider-thumb]:shadow-md"
        min="0"
        max="100"
        step="1"
        value={hsl.l}
        oninput={onLightnessInput}
      />
    </div>
    <span class="text-xs text-textMuted w-12 text-right tabular-nums">{Math.round(hsl.l)}%</span>
  </div>
</div>
