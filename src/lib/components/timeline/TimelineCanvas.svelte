<script lang="ts">
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import {
    drawBackground,
    drawKeyframes,
    drawPlayhead,
    drawSceneMarkers,
    drawSelectionRect,
    type RenderViewport,
  } from './render.js';

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);

  // Build viewport from store values
  function getViewport(width: number, height: number): RenderViewport {
    return {
      pxPerMs: timelineStore.pxPerMs,
      scrollX: timelineStore.scrollX,
      width,
      height,
    };
  }

  // Full render pass (background + keyframes + markers + selection)
  function render(): void {
    const canvas = canvasEl;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = timelineStore.viewportWidth;
    const h = timelineStore.viewportHeight;
    if (w === 0 || h === 0) return;

    const vp = getViewport(w, h);

    const channels = projectStore.file?.track.channels ?? [];
    const keyframes = projectStore.file?.track.keyframes ?? [];
    const markers = projectStore.file?.sceneMarkers ?? [];
    const selectedIds = new Set(timelineStore.selectedKeyframeIds);

    drawBackground(ctx, vp, channels.length);
    drawKeyframes(ctx, keyframes, channels, vp, selectedIds);
    drawSceneMarkers(ctx, markers, vp, h);
    if (timelineStore.selectionRect) {
      drawSelectionRect(ctx, timelineStore.selectionRect);
    }
    drawPlayhead(ctx, videoStore.currentTimeMs, vp, h);
  }

  // Scale canvas for devicePixelRatio
  function resizeCanvas(width: number, height: number): void {
    const canvas = canvasEl;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }

  // ResizeObserver to track container size changes
  $effect(() => {
    const container = containerEl;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const w = Math.floor(width);
        const h = Math.floor(height);
        timelineStore.setViewportSize(w, h);
        resizeCanvas(w, h);
        render();
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  });

  // Re-render whenever relevant store state changes
  $effect(() => {
    // Access reactive state to establish dependencies
    const _pxPerMs = timelineStore.pxPerMs;
    const _scrollX = timelineStore.scrollX;
    const _selectedIds = timelineStore.selectedKeyframeIds;
    const _selectionRect = timelineStore.selectionRect;
    const _channels = projectStore.file?.track.channels;
    const _keyframes = projectStore.file?.track.keyframes;
    const _markers = projectStore.file?.sceneMarkers;
    const _currentTime = videoStore.currentTimeMs;
    const _vw = timelineStore.viewportWidth;
    const _vh = timelineStore.viewportHeight;

    render();
  });

  // Playhead RAF loop during playback — avoids re-running the full effect every frame
  $effect(() => {
    if (!videoStore.isPlaying) return;

    let rafId: number;

    const loop = () => {
      render();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafId);
  });
</script>

<div bind:this={containerEl} class="relative w-full h-full overflow-hidden">
  <canvas bind:this={canvasEl} class="block"></canvas>
</div>
