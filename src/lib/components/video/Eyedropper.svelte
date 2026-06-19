<script lang="ts">
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { toastStore } from '$lib/stores/toast.svelte.js';
  import { extractAndTonemapFrame } from '$lib/services/frame-extractor.js';
  import { EditKeyframeCommand } from '$lib/commands/edit-keyframe.js';
  import { CompositeCommand } from '$lib/commands/composite.js';
  import { rgbToHex } from '$lib/services/color-utils.js';
  import { LS_KEY_COLOR_HISTORY, MAX_COLOR_HISTORY } from '$lib/types/ui.js';
  import type { RGBColor, Keyframe } from '$lib/types/track.js';
  import type { ColorHistoryEntry } from '$lib/types/ui.js';

  // The container element that overlays the video
  let overlayEl = $state<HTMLDivElement | null>(null);
  // Offscreen canvas holding the extracted frame at original resolution
  let offscreenCanvas = $state<HTMLCanvasElement | null>(null);
  // Full-size display canvas shown to the user in the overlay
  let displayCanvas = $state<HTMLCanvasElement | null>(null);
  // Magnifier lens canvas (100x100 visible)
  let lensCanvas = $state<HTMLCanvasElement | null>(null);

  let isLoading = $state(false);
  let isReady = $state(false);

  // Cursor position relative to the overlay element
  let cursorX = $state(0);
  let cursorY = $state(0);

  // Hex color under cursor
  let hexUnderCursor = $state('#000000');

  const LENS_SIZE = 100;
  const ZOOM = 4;

  // Activate/deactivate logic
  $effect(() => {
    if (!uiStore.eyedropperActive) {
      cleanup();
      return;
    }

    // Pause video if playing
    if (videoStore.isPlaying) {
      videoStore.pause();
    }

    activate();

    return () => {
      cleanup();
    };
  });

  async function activate() {
    if (!videoStore.file) {
      toastStore.error('No video file loaded.');
      uiStore.toggleEyedropper();
      return;
    }

    isLoading = true;
    isReady = false;

    try {
      const videoEl = videoStore.element;
      if (!videoEl) throw new Error('No video element');

      const imageData = await extractAndTonemapFrame(
        videoStore.file,
        videoEl,
        videoStore.currentTimeMs,
        videoStore.isHdr
      );

      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Could not get 2D context');
      ctx.putImageData(imageData, 0, 0);
      offscreenCanvas = canvas;

      isReady = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Eyedropper] Frame extraction failed:', err);
      toastStore.error(`Failed to extract frame for eyedropper: ${message}`);
      uiStore.toggleEyedropper();
    } finally {
      isLoading = false;
    }
  }

  function cleanup() {
    isLoading = false;
    isReady = false;
    offscreenCanvas = null;
    displayCanvas = null;
  }

  // Blit the tone-mapped frame into the visible display canvas whenever both are ready
  $effect(() => {
    if (!offscreenCanvas || !displayCanvas) return;
    displayCanvas.width = offscreenCanvas.width;
    displayCanvas.height = offscreenCanvas.height;
    const ctx = displayCanvas.getContext('2d');
    ctx?.drawImage(offscreenCanvas, 0, 0);
  });

  // Sample a pixel from the offscreen canvas given overlay-relative coordinates
  function samplePixel(overlayX: number, overlayY: number): RGBColor {
    if (!offscreenCanvas || !overlayEl) return { r: 0, g: 0, b: 0 };

    const rect = overlayEl.getBoundingClientRect();
    const scaleX = offscreenCanvas.width / rect.width;
    const scaleY = offscreenCanvas.height / rect.height;

    const imgX = Math.round(overlayX * scaleX);
    const imgY = Math.round(overlayY * scaleY);

    const clampedX = Math.max(0, Math.min(offscreenCanvas.width - 1, imgX));
    const clampedY = Math.max(0, Math.min(offscreenCanvas.height - 1, imgY));

    const ctx = offscreenCanvas.getContext('2d');
    if (!ctx) return { r: 0, g: 0, b: 0 };

    const data = ctx.getImageData(clampedX, clampedY, 1, 1).data;
    return { r: data[0], g: data[1], b: data[2] };
  }

  function updateLens(overlayX: number, overlayY: number) {
    if (!lensCanvas || !offscreenCanvas || !overlayEl) return;

    const ctx = lensCanvas.getContext('2d');
    if (!ctx) return;

    const rect = overlayEl.getBoundingClientRect();
    const scaleX = offscreenCanvas.width / rect.width;
    const scaleY = offscreenCanvas.height / rect.height;

    // Source region in the offscreen canvas (un-zoomed area to magnify)
    const srcW = LENS_SIZE / ZOOM;
    const srcH = LENS_SIZE / ZOOM;
    const srcX = overlayX * scaleX - srcW / 2;
    const srcY = overlayY * scaleY - srcH / 2;

    ctx.clearRect(0, 0, LENS_SIZE, LENS_SIZE);
    ctx.drawImage(offscreenCanvas, srcX, srcY, srcW, srcH, 0, 0, LENS_SIZE, LENS_SIZE);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isReady || !overlayEl) return;

    const rect = overlayEl.getBoundingClientRect();
    cursorX = e.clientX - rect.left;
    cursorY = e.clientY - rect.top;

    const color = samplePixel(cursorX, cursorY);
    hexUnderCursor = rgbToHex(color);
    updateLens(cursorX, cursorY);
  }

  function handleClick(e: MouseEvent) {
    if (!isReady || !overlayEl) return;

    const rect = overlayEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const color = samplePixel(x, y);
    applyColor(color);
  }

  function applyColor(color: RGBColor) {
    const selectedIds = timelineStore.selectedKeyframeIds;

    if (selectedIds.length > 0) {
      const keyframes = selectedIds
        .map((id) => projectStore.getKeyframes().find((kf) => kf.id === id))
        .filter((kf): kf is Keyframe => kf != null);

      if (keyframes.length > 0) {
        const patch: Partial<Keyframe> = { color: { ...color }, colorMode: 'RGB' };
        const commands = keyframes.map((kf) => new EditKeyframeCommand(kf.id, patch, projectStore));

        if (commands.length === 1) {
          undoStore.execute(commands[0]);
        } else {
          undoStore.execute(new CompositeCommand('Apply eyedropper color', commands));
        }

        toastStore.success(
          `Color ${rgbToHex(color)} applied to ${keyframes.length} keyframe${keyframes.length > 1 ? 's' : ''}`
        );
      } else {
        toastStore.success(`Color picked: ${rgbToHex(color)}`);
      }
    } else {
      toastStore.success(`Color picked: ${rgbToHex(color)}`);
    }

    addColorToHistory(color);
    uiStore.toggleEyedropper();
  }

  function addColorToHistory(color: RGBColor) {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(LS_KEY_COLOR_HISTORY);
      let history: ColorHistoryEntry[] = [];
      if (raw) {
        const parsed = JSON.parse(raw) as ColorHistoryEntry[];
        if (Array.isArray(parsed)) history = parsed;
      }
      // Remove duplicate
      history = history.filter(
        (e) => !(e.color.r === color.r && e.color.g === color.g && e.color.b === color.b)
      );
      history = [{ color, addedAt: Date.now() }, ...history].slice(0, MAX_COLOR_HISTORY);
      localStorage.setItem(LS_KEY_COLOR_HISTORY, JSON.stringify(history));
    } catch {
      // ignore
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      uiStore.toggleEyedropper();
    }
  }

  // Lens offset so it doesn't cover the cursor: place it to the upper-right
  const LENS_OFFSET_X = 16;
  const LENS_OFFSET_Y = -LENS_SIZE - 24;

  // Compute lens position clamped within the overlay
  let lensLeft = $derived.by(() => {
    if (!overlayEl) return cursorX + LENS_OFFSET_X;
    const rect = overlayEl.getBoundingClientRect();
    let x = cursorX + LENS_OFFSET_X;
    // If it would go off the right edge, flip to the left
    if (x + LENS_SIZE > rect.width) {
      x = cursorX - LENS_OFFSET_X - LENS_SIZE;
    }
    return x;
  });

  let lensTop = $derived.by(() => {
    if (!overlayEl) return cursorY + LENS_OFFSET_Y;
    const rect = overlayEl.getBoundingClientRect();
    let y = cursorY + LENS_OFFSET_Y;
    // If it would go off the top, place below cursor
    if (y < 0) {
      y = cursorY + 24;
    }
    return y;
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if uiStore.eyedropperActive}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={overlayEl}
    class="absolute inset-0 z-20"
    style="cursor: crosshair;"
    onpointermove={handlePointerMove}
    onclick={handleClick}
    onkeydown={handleKeyDown}
    role="application"
    aria-label="Eyedropper — click to sample color"
    tabindex="-1"
  >
    <!-- Loading state -->
    {#if isLoading}
      <div class="absolute inset-0 flex items-center justify-center bg-black/60">
        <div class="flex flex-col items-center gap-2">
          <div
            class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"
          ></div>
          <span class="text-sm text-text-base">Extracting frame…</span>
        </div>
      </div>
    {/if}

    <!-- Magnifier lens + hex label, shown when ready -->
    {#if isReady}
      <!-- Tone-mapped frame fills the overlay, replacing the browser's HDR rendering -->
      <canvas
        bind:this={displayCanvas}
        class="absolute inset-0 w-full h-full"
      ></canvas>

      <div class="absolute pointer-events-none" style="left: {lensLeft}px; top: {lensTop}px;">
        <!-- Lens canvas -->
        <canvas
          bind:this={lensCanvas}
          width={LENS_SIZE}
          height={LENS_SIZE}
          class="rounded-full border-2 border-accent shadow-lg"
          style="width: {LENS_SIZE}px; height: {LENS_SIZE}px; display: block;"
        ></canvas>

        <!-- Crosshair in the center of the lens -->
        <div
          class="absolute inset-0 flex items-center justify-center pointer-events-none"
          style="border-radius: 50%;"
        >
          <div
            class="w-px h-3 bg-white/70 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full"
          ></div>
          <div class="w-px h-3 bg-white/70 absolute top-1/2 left-1/2 -translate-x-1/2"></div>
          <div
            class="w-3 h-px bg-white/70 absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-full"
          ></div>
          <div class="w-3 h-px bg-white/70 absolute top-1/2 left-1/2 -translate-y-1/2"></div>
        </div>

        <!-- Hex color label below the lens -->
        <div
          class="mt-1 px-2 py-0.5 rounded text-xs font-mono text-text-base bg-surface/90 border border-surface2 text-center select-none"
        >
          {hexUnderCursor}
        </div>

        <!-- Color swatch -->
        <div
          class="mt-1 w-full h-3 rounded border border-surface2"
          style="background-color: {hexUnderCursor};"
        ></div>
      </div>
    {/if}
  </div>
{/if}
