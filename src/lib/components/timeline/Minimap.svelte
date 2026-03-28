<script lang="ts">
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { rgbToCssString } from '$lib/services/color-utils.js';
  import { MINIMAP_MIN_HEIGHT, MINIMAP_MAX_HEIGHT } from '$lib/types/timeline.js';

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);

  // Resize drag state
  let isResizing = $state(false);
  let resizeStartY = 0;
  let resizeStartHeight = 0;

  // Scroll drag state
  let isDragging = $state(false);

  // ---- Drawing ----

  function draw(): void {
    const canvas = canvasEl;
    if (!canvas || canvasWidth === 0 || canvasHeight === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvasWidth;
    const h = canvasHeight;

    ctx.clearRect(0, 0, w * dpr, h * dpr);

    const durationMs = videoStore.durationMs || 1;
    const channels = projectStore.file?.track.channels ?? [];
    const keyframes = projectStore.file?.track.keyframes ?? [];
    const channelCount = channels.length || 1;
    const channelIndex = new Map(channels.map((c, i) => [c.id, i]));

    // Background
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, w * dpr, h * dpr);

    // Scale: each ms maps to a horizontal pixel position
    const msToX = (ms: number) => (ms / durationMs) * w * dpr;
    const laneH = (h * dpr) / channelCount;

    // Draw keyframes as 1px-wide vertical lines in their lane color
    for (const kf of keyframes) {
      const x = Math.floor(msToX(kf.timestampMs));
      const lane = channelIndex.get(kf.channelId);
      if (lane === undefined) continue;
      const y = Math.floor(lane * laneH);
      ctx.fillStyle = rgbToCssString(kf.color, 0.8);
      ctx.fillRect(x, y, Math.max(1, dpr), laneH);
    }

    // Draw playhead line
    const playX = Math.floor(msToX(videoStore.currentTimeMs));
    ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
    ctx.fillRect(playX, 0, Math.max(1, dpr), h * dpr);

    // Viewport highlight rectangle
    const visStart = timelineStore.scrollX;
    const visEnd = timelineStore.visibleEndMs;
    const vpX = Math.floor(msToX(visStart));
    const vpW = Math.max(2, Math.floor(msToX(visEnd) - vpX));

    ctx.fillStyle = 'rgba(108, 99, 255, 0.15)';
    ctx.fillRect(vpX, 0, vpW, h * dpr);
    ctx.strokeStyle = 'rgba(108, 99, 255, 0.6)';
    ctx.lineWidth = dpr;
    ctx.strokeRect(vpX + dpr / 2, dpr / 2, vpW - dpr, h * dpr - dpr);
  }

  // React to store changes
  $effect(() => {
    // Establish reactive dependencies
    const _keyframes = projectStore.file?.track.keyframes;
    const _channels = projectStore.file?.track.channels;
    const _scrollX = timelineStore.scrollX;
    const _pxPerMs = timelineStore.pxPerMs;
    const _vw = timelineStore.viewportWidth;
    const _currentTime = videoStore.currentTimeMs;
    const _duration = videoStore.durationMs;
    const _w = canvasWidth;
    const _h = canvasHeight;
    draw();
  });

  // RAF loop during playback
  $effect(() => {
    if (!videoStore.isPlaying) return;
    let rafId: number;
    const loop = () => { draw(); rafId = requestAnimationFrame(loop); };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  });

  // ResizeObserver
  $effect(() => {
    const el = containerEl;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvasWidth = Math.floor(width);
        canvasHeight = Math.floor(height);
        const canvas = canvasEl;
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvasWidth * dpr;
        canvas.height = canvasHeight * dpr;
        canvas.style.width = `${canvasWidth}px`;
        canvas.style.height = `${canvasHeight}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);
        draw();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  // ---- Interaction ----

  function pointerEventToMs(e: PointerEvent): number {
    const canvas = canvasEl;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = relX / rect.width;
    return ratio * (videoStore.durationMs || 1);
  }

  function seekOrScroll(e: PointerEvent): void {
    const ms = pointerEventToMs(e);
    // Center the viewport on the clicked position
    const halfViewMs = timelineStore.viewportWidth / timelineStore.pxPerMs / 2;
    timelineStore.scrollTo(ms - halfViewMs);
  }

  function handlePointerDown(e: PointerEvent): void {
    // Ignore resize handle target
    if ((e.target as HTMLElement).dataset.resizeHandle) return;
    e.preventDefault();
    isDragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seekOrScroll(e);
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!isDragging) return;
    seekOrScroll(e);
  }

  function handlePointerUp(e: PointerEvent): void {
    isDragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  // Resize handle drag
  function handleResizePointerDown(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    resizeStartY = e.clientY;
    resizeStartHeight = timelineStore.minimapHeight;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleResizePointerMove(e: PointerEvent): void {
    if (!isResizing) return;
    // Dragging up = bigger minimap (subtract delta because top edge goes up)
    const delta = resizeStartY - e.clientY;
    timelineStore.resizeMinimap(resizeStartHeight + delta);
  }

  function handleResizePointerUp(e: PointerEvent): void {
    isResizing = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  const minimapHeight = $derived(timelineStore.minimapHeight);
</script>

<div
  class="minimap relative w-full bg-[#0f0f1a] border-t border-[#2f2f4a] flex-shrink-0"
  style="height: {minimapHeight}px;"
  bind:this={containerEl}
>
  <!-- Resize handle at top edge -->
  <div
    class="absolute top-0 left-0 right-0 h-1 cursor-row-resize z-10 hover:bg-[#6c63ff]/40 transition-colors"
    data-resize-handle="true"
    role="separator"
    aria-label="Drag to resize minimap"
    aria-orientation="horizontal"
    onpointerdown={handleResizePointerDown}
    onpointermove={handleResizePointerMove}
    onpointerup={handleResizePointerUp}
  ></div>

  <!-- Canvas for minimap rendering -->
  <canvas
    bind:this={canvasEl}
    class="block w-full h-full cursor-pointer"
    style="touch-action: none;"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    role="slider"
    aria-label="Timeline minimap — click or drag to scroll"
    aria-valuemin={0}
    aria-valuemax={videoStore.durationMs}
    aria-valuenow={timelineStore.scrollX}
  ></canvas>
</div>
