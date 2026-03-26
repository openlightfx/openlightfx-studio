<script lang="ts">
  import { videoStore } from '$lib/stores/video.svelte.js';
  import type { RGBColor } from '$lib/types/index.js';
  import { rgbToHex } from '$lib/services/color-utils.js';
  import { captureVideoFrame, tonemapImageData, isHdrSignal } from '$lib/services/hdr-tonemap.js';

  let { onpick }: { onpick: (color: RGBColor) => void } = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let hoverColor: RGBColor | null = $state(null);
  let hoverPos = $state({ x: 0, y: 0 });

  const isLoaded = $derived(videoStore.state.isLoaded);

  // Capture and tone-map the current video frame onto the visible canvas
  $effect(() => {
    if (!canvasEl || !isLoaded) return;
    const videoEl = videoStore.getVideoElement();
    if (!videoEl) return;

    captureVideoFrame(videoEl).then(({ imageData, wideGamut }) => {
      if (!canvasEl) return;
      if (wideGamut && isHdrSignal(imageData)) {
        tonemapImageData(imageData);
      }
      canvasEl.width = imageData.width;
      canvasEl.height = imageData.height;
      const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
      if (ctx) ctx.putImageData(imageData, 0, 0);
    });
  });

  function sampleAt(e: MouseEvent): RGBColor | null {
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = canvasEl.width / rect.width;
    const scaleY = canvasEl.height / rect.height;
    const px = Math.floor((e.clientX - rect.left) * scaleX);
    const py = Math.floor((e.clientY - rect.top) * scaleY);
    const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const d = ctx.getImageData(px, py, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  }

  function handleMouseMove(e: MouseEvent) {
    hoverColor = sampleAt(e);
    hoverPos = { x: e.clientX, y: e.clientY };
  }

  function handleMouseLeave() {
    hoverColor = null;
  }

  function handleClick(e: MouseEvent) {
    const color = sampleAt(e);
    if (color) onpick(color);
  }
</script>

{#if isLoaded}
  <div class="flex flex-col gap-2">
    <p class="text-xs text-textMuted">Click anywhere on the frame to sample a color.</p>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <canvas
      bind:this={canvasEl}
      class="w-full cursor-crosshair rounded border border-surface2"
      style="image-rendering: pixelated;"
      onmousemove={handleMouseMove}
      onmouseleave={handleMouseLeave}
      onclick={handleClick}
      aria-label="Video frame — click to sample color"
    ></canvas>
    {#if hoverColor}
      <div
        class="pointer-events-none fixed z-[60] flex items-center gap-2 rounded bg-black/80 px-2 py-1 text-xs text-white"
        style="left: {hoverPos.x + 14}px; top: {hoverPos.y - 30}px;"
      >
        <span
          class="inline-block h-3.5 w-3.5 shrink-0 rounded border border-white/30"
          style="background: rgb({hoverColor.r},{hoverColor.g},{hoverColor.b});"
        ></span>
        <span class="font-mono">{rgbToHex(hoverColor).toUpperCase()}</span>
      </div>
    {/if}
  </div>
{:else}
  <p class="text-xs text-textMuted italic">No video loaded.</p>
{/if}
