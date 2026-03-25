<script lang="ts">
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { interpolateAtTime } from '$lib/services/interpolation.js';
  import { kelvinToRgb } from '$lib/services/color-utils.js';
  import type { Channel, RGBColor, SpatialHint } from '$lib/types/index.js';

  let { videoEl }: { videoEl: HTMLVideoElement } = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);
  let rafId: number | null = $state(null);

  const overlayEnabled = $derived(uiStore.state.overlayEnabled);
  const currentTimeMs = $derived(videoStore.state.currentTimeMs);
  const isPlaying = $derived(videoStore.state.isPlaying);
  const channels = $derived(projectStore.channels);
  const keyframes = $derived(projectStore.keyframes);

  const OVERLAY_OPACITY = 0.6;

  // Channels with spatial hints for overlay
  const spatialChannels = $derived(
    channels.filter(
      (ch) => ch.spatialHint !== 'SPATIAL_UNSPECIFIED'
    )
  );

  // Channels without spatial hint — for the "Unassigned" indicator
  const unassignedChannels = $derived(
    channels.filter((ch) => ch.spatialHint === 'SPATIAL_UNSPECIFIED')
  );

  // Match canvas size to video element via ResizeObserver
  $effect(() => {
    if (!videoEl) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        canvasWidth = Math.round(entry.contentRect.width);
        canvasHeight = Math.round(entry.contentRect.height);
      }
    });
    observer.observe(videoEl);
    return () => observer.disconnect();
  });

  // Redraw when relevant state changes
  $effect(() => {
    if (!overlayEnabled) {
      clearCanvas();
      return;
    }
    // Depend on these to trigger re-render
    void currentTimeMs;
    void channels;
    void keyframes;
    void canvasWidth;
    void canvasHeight;
    drawOverlay();
  });

  function clearCanvas() {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx || !canvasEl) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  }

  function getChannelColor(channel: Channel): { color: RGBColor; alpha: number } | null {
    const state = interpolateAtTime(channel.id, currentTimeMs, keyframes);
    if (!state || !state.powerOn) return null;

    let color: RGBColor;
    if (state.colorMode === 'COLOR_TEMPERATURE') {
      color = kelvinToRgb(state.brightness > 0 ? 2700 : 6500);
    } else {
      color = state.color;
    }

    const alpha = (state.brightness / 100) * OVERLAY_OPACITY;
    return { color, alpha };
  }

  function drawOverlay() {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx || !canvasEl || canvasWidth === 0 || canvasHeight === 0) return;

    canvasEl.width = canvasWidth;
    canvasEl.height = canvasHeight;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    for (const channel of spatialChannels) {
      const result = getChannelColor(channel);
      if (!result) continue;
      const { color, alpha } = result;
      if (alpha <= 0) continue;

      drawGlowForHint(ctx, channel.spatialHint, color, alpha);
    }
  }

  function drawGlowForHint(
    ctx: CanvasRenderingContext2D,
    hint: SpatialHint,
    color: RGBColor,
    alpha: number
  ) {
    const w = canvasWidth;
    const h = canvasHeight;
    const rgba = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
    const rgbaTransparent = `rgba(${color.r}, ${color.g}, ${color.b}, 0)`;

    switch (hint) {
      case 'SPATIAL_LEFT': {
        // Top-left area: left 33%, top 15%
        const regionW = w / 3;
        const regionH = h * 0.15;
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(regionW, regionH));
        grad.addColorStop(0, rgba);
        grad.addColorStop(1, rgbaTransparent);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, regionW, regionH);
        break;
      }
      case 'SPATIAL_CENTER': {
        // Top-center area: center 33%, top 15%
        const regionX = w / 3;
        const regionW = w / 3;
        const regionH = h * 0.15;
        const cx = regionX + regionW / 2;
        const grad = ctx.createRadialGradient(cx, 0, 0, cx, 0, Math.max(regionW / 2, regionH));
        grad.addColorStop(0, rgba);
        grad.addColorStop(1, rgbaTransparent);
        ctx.fillStyle = grad;
        ctx.fillRect(regionX, 0, regionW, regionH);
        break;
      }
      case 'SPATIAL_RIGHT': {
        // Top-right area: right 33%, top 15%
        const regionX = (w * 2) / 3;
        const regionW = w / 3;
        const regionH = h * 0.15;
        const grad = ctx.createRadialGradient(w, 0, 0, w, 0, Math.max(regionW, regionH));
        grad.addColorStop(0, rgba);
        grad.addColorStop(1, rgbaTransparent);
        ctx.fillStyle = grad;
        ctx.fillRect(regionX, 0, regionW, regionH);
        break;
      }
      case 'SPATIAL_SURROUND_LEFT': {
        // Bottom-left: left 50%, bottom 15%
        const regionW = w / 2;
        const regionH = h * 0.15;
        const regionY = h - regionH;
        const grad = ctx.createRadialGradient(0, h, 0, 0, h, Math.max(regionW, regionH));
        grad.addColorStop(0, rgba);
        grad.addColorStop(1, rgbaTransparent);
        ctx.fillStyle = grad;
        ctx.fillRect(0, regionY, regionW, regionH);
        break;
      }
      case 'SPATIAL_SURROUND_RIGHT': {
        // Bottom-right: right 50%, bottom 15%
        const regionW = w / 2;
        const regionH = h * 0.15;
        const regionX = w / 2;
        const regionY = h - regionH;
        const grad = ctx.createRadialGradient(w, h, 0, w, h, Math.max(regionW, regionH));
        grad.addColorStop(0, rgba);
        grad.addColorStop(1, rgbaTransparent);
        ctx.fillStyle = grad;
        ctx.fillRect(regionX, regionY, regionW, regionH);
        break;
      }
      case 'SPATIAL_AMBIENT': {
        // 20% border fade from all edges
        const fadeSize = Math.min(w, h) * 0.2;

        // Top edge
        const topGrad = ctx.createLinearGradient(0, 0, 0, fadeSize);
        topGrad.addColorStop(0, rgba);
        topGrad.addColorStop(1, rgbaTransparent);
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, w, fadeSize);

        // Bottom edge
        const bottomGrad = ctx.createLinearGradient(0, h, 0, h - fadeSize);
        bottomGrad.addColorStop(0, rgba);
        bottomGrad.addColorStop(1, rgbaTransparent);
        ctx.fillStyle = bottomGrad;
        ctx.fillRect(0, h - fadeSize, w, fadeSize);

        // Left edge
        const leftGrad = ctx.createLinearGradient(0, 0, fadeSize, 0);
        leftGrad.addColorStop(0, rgba);
        leftGrad.addColorStop(1, rgbaTransparent);
        ctx.fillStyle = leftGrad;
        ctx.fillRect(0, 0, fadeSize, h);

        // Right edge
        const rightGrad = ctx.createLinearGradient(w, 0, w - fadeSize, 0);
        rightGrad.addColorStop(0, rgba);
        rightGrad.addColorStop(1, rgbaTransparent);
        ctx.fillStyle = rightGrad;
        ctx.fillRect(w - fadeSize, 0, fadeSize, h);
        break;
      }
      case 'SPATIAL_CEILING': {
        // Treat as top-center band
        const regionH = h * 0.1;
        const grad = ctx.createLinearGradient(0, 0, 0, regionH);
        grad.addColorStop(0, rgba);
        grad.addColorStop(1, rgbaTransparent);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, regionH);
        break;
      }
      case 'SPATIAL_FLOOR': {
        // Treat as bottom band
        const regionH = h * 0.1;
        const grad = ctx.createLinearGradient(0, h, 0, h - regionH);
        grad.addColorStop(0, rgba);
        grad.addColorStop(1, rgbaTransparent);
        ctx.fillStyle = grad;
        ctx.fillRect(0, h - regionH, w, regionH);
        break;
      }
      case 'SPATIAL_BEHIND_SCREEN': {
        // Similar to center top — glow from top center
        const regionH = h * 0.15;
        const cx = w / 2;
        const grad = ctx.createRadialGradient(cx, 0, 0, cx, 0, Math.max(w * 0.4, regionH));
        grad.addColorStop(0, rgba);
        grad.addColorStop(1, rgbaTransparent);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, regionH);
        break;
      }
      default:
        break;
    }
  }
</script>

<!-- Canvas overlay matching video dimensions -->
<canvas
  bind:this={canvasEl}
  class="pointer-events-none absolute"
  style="width: {canvasWidth}px; height: {canvasHeight}px; left: 50%; top: 50%; transform: translate(-50%, -50%);"
  width={canvasWidth}
  height={canvasHeight}
  aria-hidden="true"
></canvas>

<!-- Unassigned channels indicator (STU-097) -->
{#if unassignedChannels.length > 0 && overlayEnabled}
  <div
    class="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-surface/80 px-2 py-0.5 text-[10px] text-textMuted backdrop-blur-sm"
  >
    Unassigned: {unassignedChannels.map((ch) => ch.displayName).join(', ')}
  </div>
{/if}
