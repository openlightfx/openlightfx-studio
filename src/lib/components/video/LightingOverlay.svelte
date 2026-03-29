<script lang="ts">
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { getChannelStateAtTime, getKeyframesForChannel, getEffectStateAtTime } from '$lib/services/interpolation.js';
  import { rgbToCssString } from '$lib/services/color-utils.js';
  import type { SpatialHint } from '$lib/types/track.js';

  // Canvas element
  let canvasEl = $state<HTMLCanvasElement | null>(null);

  // RAF handle for playback loop
  let rafId: number | null = null;

  // Spatial hint → normalized position {x, y} and radius multiplier
  interface SpatialPosition {
    x: number;
    y: number;
    radiusMultiplier: number;
  }

  function getSpatialPosition(hint: SpatialHint): SpatialPosition {
    switch (hint) {
      case 'SPATIAL_LEFT':          return { x: 0.1, y: 0.5, radiusMultiplier: 0.4 };
      case 'SPATIAL_RIGHT':         return { x: 0.9, y: 0.5, radiusMultiplier: 0.4 };
      case 'SPATIAL_CENTER':        return { x: 0.5, y: 0.5, radiusMultiplier: 0.4 };
      case 'SPATIAL_SURROUND_LEFT': return { x: 0.0, y: 0.7, radiusMultiplier: 0.4 };
      case 'SPATIAL_SURROUND_RIGHT':return { x: 1.0, y: 0.7, radiusMultiplier: 0.4 };
      case 'SPATIAL_CEILING':       return { x: 0.5, y: 0.0, radiusMultiplier: 0.4 };
      case 'SPATIAL_FLOOR':         return { x: 0.5, y: 1.0, radiusMultiplier: 0.4 };
      case 'SPATIAL_BEHIND_SCREEN': return { x: 0.5, y: 0.3, radiusMultiplier: 0.4 };
      case 'SPATIAL_AMBIENT':       return { x: 0.5, y: 0.5, radiusMultiplier: 0.6 };
      case 'SPATIAL_UNSPECIFIED':
      default:                      return { x: 0.5, y: 0.5, radiusMultiplier: 0.4 };
    }
  }

  function drawFrame() {
    if (!canvasEl) return;

    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    // Use physical pixel dimensions (canvas.width/height are set in ResizeObserver
    // already scaled by devicePixelRatio, and CSS w-full/h-full handles CSS display size)
    const width = canvasEl.width;
    const height = canvasEl.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (!videoStore.isLoaded || !projectStore.file) return;

    const channels = projectStore.file.track.channels;
    const allKeyframes = projectStore.file.track.keyframes;
    const timeMs = videoStore.currentTimeMs;

    for (const channel of channels) {
      // Skip channels that are not audible (muted or not soloed)
      if (!timelineStore.isChannelAudible(channel.id)) continue;

      // Get interpolated state
      const channelKeyframes = getKeyframesForChannel(allKeyframes, channel.id);
      const state = getChannelStateAtTime(channelKeyframes, timeMs);

      // Skip if no state or powered off or zero brightness
      if (!state || !state.powerOn || state.brightness <= 0) continue;

      const { x: normX, y: normY, radiusMultiplier } = getSpatialPosition(channel.spatialHint);

      const cx = normX * width;
      const cy = normY * height;
      const radius = radiusMultiplier * width;

      // Use screen blending for additive glow
      ctx.globalCompositeOperation = 'screen';

      const alpha = (state.brightness / 255) * 0.6;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, rgbToCssString(state.color, alpha));
      gradient.addColorStop(1, rgbToCssString(state.color, 0));

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    // Effect overlay pass
    const allEffects = projectStore.file.track.effectKeyframes;

    for (const channel of channels) {
      if (!timelineStore.isChannelAudible(channel.id)) continue;

      const effectState = getEffectStateAtTime(allEffects, channel.id, timeMs);
      if (!effectState || effectState.brightness <= 0) continue;

      const { x: normX, y: normY, radiusMultiplier } = getSpatialPosition(channel.spatialHint);
      const cx = normX * width;
      const cy = normY * height;
      const radius = radiusMultiplier * width;

      ctx.globalCompositeOperation = 'screen';
      const alpha = effectState.brightness * 0.8;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, rgbToCssString(effectState.color, alpha));
      gradient.addColorStop(1, rgbToCssString(effectState.color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
  }

  // Resize observer to match parent container dimensions
  $effect(() => {
    if (!canvasEl) return;

    const parent = canvasEl.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvasEl!.width = Math.round(width * dpr);
        canvasEl!.height = Math.round(height * dpr);

        // ctx.scale accumulates on repeated calls; drawFrame reads canvas.width/height
        // directly (physical pixels), so no scale transform is needed here.

        // Redraw after resize
        drawFrame();
      }
    });

    observer.observe(parent);

    return () => {
      observer.disconnect();
    };
  });

  // RAF loop during playback
  $effect(() => {
    if (!uiStore.overlayEnabled || !videoStore.isPlaying) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      return;
    }

    const loop = () => {
      drawFrame();
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  });

  // Static redraw on scrub (when not playing)
  $effect(() => {
    // Access reactive values to track them
    const _time = videoStore.currentTimeMs;
    const _channels = projectStore.file?.track.channels;
    const _keyframes = projectStore.file?.track.keyframes;
    const _solo = timelineStore.soloChannelIds;
    const _muted = timelineStore.mutedChannelIds;
    const _effects = projectStore.file?.track.effectKeyframes;

    if (!videoStore.isPlaying && uiStore.overlayEnabled) {
      drawFrame();
    }
  });
</script>

{#if uiStore.overlayEnabled && videoStore.isLoaded}
  <canvas
    bind:this={canvasEl}
    class="absolute inset-0 w-full h-full pointer-events-none"
    style="mix-blend-mode: screen;"
    aria-hidden="true"
  ></canvas>
{/if}
