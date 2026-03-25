<script lang="ts">
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { rgbToHex } from '$lib/services/color-utils.js';
  import type { RGBColor } from '$lib/types/index.js';
  import { LS_KEY_COLOR_HISTORY, MAX_COLOR_HISTORY } from '$lib/types/index.js';
  import type { ColorHistoryEntry } from '$lib/types/ui.js';

  let { videoEl }: { videoEl: HTMLVideoElement } = $props();

  let overlayEl: HTMLDivElement | undefined = $state();
  let mouseX = $state(0);
  let mouseY = $state(0);
  let sampledColor: RGBColor | null = $state(null);
  let magnifiedImageData: string | null = $state(null);
  let isOverVideo = $state(false);

  // Offscreen canvas for pixel sampling
  let offscreenCanvas: HTMLCanvasElement | null = $state(null);
  let offscreenCtx: CanvasRenderingContext2D | null = $state(null);

  // Magnifier canvas for the preview
  let magnifierCanvas: HTMLCanvasElement | null = $state(null);
  let magnifierCtx: CanvasRenderingContext2D | null = $state(null);

  const MAGNIFIER_SIZE = 120;
  const MAGNIFIER_ZOOM = 8;
  const SAMPLE_RADIUS = Math.floor(MAGNIFIER_SIZE / MAGNIFIER_ZOOM / 2);

  $effect(() => {
    offscreenCanvas = document.createElement('canvas');
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    magnifierCanvas = document.createElement('canvas');
    magnifierCanvas.width = MAGNIFIER_SIZE;
    magnifierCanvas.height = MAGNIFIER_SIZE;
    magnifierCtx = magnifierCanvas.getContext('2d');
  });

  // Keyboard listener for Escape
  $effect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        uiStore.setEyedropperActive(false);
      }
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });

  function getVideoRelativeCoords(e: MouseEvent): { vx: number; vy: number } | null {
    if (!videoEl) return null;
    const rect = videoEl.getBoundingClientRect();
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    if (vx < 0 || vy < 0 || vx > rect.width || vy > rect.height) return null;
    return { vx, vy };
  }

  function samplePixel(vx: number, vy: number): RGBColor | null {
    if (!videoEl || !offscreenCanvas || !offscreenCtx) return null;

    const rect = videoEl.getBoundingClientRect();
    const scaleX = videoEl.videoWidth / rect.width;
    const scaleY = videoEl.videoHeight / rect.height;

    offscreenCanvas.width = videoEl.videoWidth;
    offscreenCanvas.height = videoEl.videoHeight;
    offscreenCtx.drawImage(videoEl, 0, 0);

    const px = Math.floor(vx * scaleX);
    const py = Math.floor(vy * scaleY);

    if (px < 0 || py < 0 || px >= videoEl.videoWidth || py >= videoEl.videoHeight) return null;

    const imageData = offscreenCtx.getImageData(px, py, 1, 1);
    return {
      r: imageData.data[0],
      g: imageData.data[1],
      b: imageData.data[2],
    };
  }

  function updateMagnifier(vx: number, vy: number) {
    if (!videoEl || !offscreenCanvas || !offscreenCtx || !magnifierCanvas || !magnifierCtx) return;

    const rect = videoEl.getBoundingClientRect();
    const scaleX = videoEl.videoWidth / rect.width;
    const scaleY = videoEl.videoHeight / rect.height;

    offscreenCanvas.width = videoEl.videoWidth;
    offscreenCanvas.height = videoEl.videoHeight;
    offscreenCtx.drawImage(videoEl, 0, 0);

    const px = Math.floor(vx * scaleX);
    const py = Math.floor(vy * scaleY);
    const sampleSize = SAMPLE_RADIUS * 2 + 1;

    // Source coords (clamped)
    const sx = Math.max(0, px - SAMPLE_RADIUS);
    const sy = Math.max(0, py - SAMPLE_RADIUS);
    const sw = Math.min(sampleSize, videoEl.videoWidth - sx);
    const sh = Math.min(sampleSize, videoEl.videoHeight - sy);

    magnifierCtx.imageSmoothingEnabled = false;
    magnifierCtx.clearRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
    magnifierCtx.drawImage(offscreenCanvas, sx, sy, sw, sh, 0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);

    // Draw crosshair
    const center = MAGNIFIER_SIZE / 2;
    magnifierCtx.strokeStyle = 'rgba(255,255,255,0.8)';
    magnifierCtx.lineWidth = 1;
    magnifierCtx.strokeRect(
      center - MAGNIFIER_ZOOM / 2,
      center - MAGNIFIER_ZOOM / 2,
      MAGNIFIER_ZOOM,
      MAGNIFIER_ZOOM
    );

    magnifiedImageData = magnifierCanvas.toDataURL();
  }

  function handleMouseMove(e: MouseEvent) {
    mouseX = e.clientX;
    mouseY = e.clientY;

    const coords = getVideoRelativeCoords(e);
    if (!coords) {
      isOverVideo = false;
      sampledColor = null;
      magnifiedImageData = null;
      return;
    }

    isOverVideo = true;
    sampledColor = samplePixel(coords.vx, coords.vy);
    updateMagnifier(coords.vx, coords.vy);
  }

  function handleClick(e: MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const coords = getVideoRelativeCoords(e);
    if (!coords) return;

    const color = samplePixel(coords.vx, coords.vy);
    if (!color) return;

    // Always store in color history (STU-019)
    addToColorHistory(color);

    // If a keyframe is selected, apply color to it
    const selectedKfIds = timelineStore.selection.keyframeIds;
    if (selectedKfIds.length > 0) {
      for (const id of selectedKfIds) {
        projectStore.updateKeyframe(id, { color: { ...color }, colorMode: 'RGB' });
      }
    }

    uiStore.setEyedropperActive(false);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    uiStore.setEyedropperActive(false);
  }

  function addToColorHistory(color: RGBColor) {
    let history: ColorHistoryEntry[] = [];
    try {
      const stored = localStorage.getItem(LS_KEY_COLOR_HISTORY);
      if (stored) history = JSON.parse(stored);
    } catch {
      // ignore
    }

    // Remove duplicate if exists
    history = history.filter(
      (h) => !(h.color.r === color.r && h.color.g === color.g && h.color.b === color.b)
    );

    // Prepend new color
    history.unshift({ color: { ...color }, addedAt: Date.now() });

    // Trim to max
    if (history.length > MAX_COLOR_HISTORY) {
      history = history.slice(0, MAX_COLOR_HISTORY);
    }

    localStorage.setItem(LS_KEY_COLOR_HISTORY, JSON.stringify(history));
  }

  const hexDisplay = $derived(sampledColor ? rgbToHex(sampledColor) : '');
</script>

<!-- Full overlay capturing mouse events -->
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={overlayEl}
  class="absolute inset-0 z-20"
  style="cursor: crosshair;"
  onmousemove={handleMouseMove}
  onclick={handleClick}
  oncontextmenu={handleContextMenu}
  onkeydown={(e) => { if (e.key === 'Escape') uiStore.setEyedropperActive(false); }}
  role="application"
  tabindex="-1"
  aria-label="Eyedropper — click to sample color, Escape to cancel"
>
  <!-- Magnifier preview following cursor -->
  {#if isOverVideo && magnifiedImageData && sampledColor}
    <div
      class="pointer-events-none fixed z-50"
      style="left: {mouseX + 20}px; top: {mouseY - MAGNIFIER_SIZE - 30}px;"
    >
      <!-- Magnified view circle -->
      <div
        class="overflow-hidden rounded-full border-2 border-white/60 shadow-lg"
        style="width: {MAGNIFIER_SIZE}px; height: {MAGNIFIER_SIZE}px;"
      >
        <img
          src={magnifiedImageData}
          alt="Magnified view"
          class="h-full w-full"
          style="image-rendering: pixelated;"
        />
      </div>
      <!-- Color info label -->
      <div
        class="mt-1 flex items-center gap-2 rounded bg-black/80 px-2 py-1 text-xs text-white"
      >
        <span
          class="inline-block h-3.5 w-3.5 rounded border border-white/30"
          style="background: rgb({sampledColor.r}, {sampledColor.g}, {sampledColor.b});"
        ></span>
        <span class="font-mono">{hexDisplay}</span>
      </div>
    </div>
  {/if}
</div>
