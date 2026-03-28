<script lang="ts">
  import { CHANNEL_LANE_HEIGHT, CHANNEL_HEADER_WIDTH, MINIMAP_HEIGHT } from '$lib/types/index.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { rgbToHex, kelvinToRgb } from '$lib/services/color-utils.js';

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let containerEl: HTMLDivElement | undefined = $state();
  let ctx: CanvasRenderingContext2D | null = $state(null);
  let dpr = $state(typeof window !== 'undefined' ? window.devicePixelRatio : 1);
  let minimapWidth = $state(0);
  let isDragging = $state(false);
  let dragOffsetMs = $state(0);

  let colors = {
    bg: '#0d0d1a',
    viewportBox: 'rgba(108, 99, 255, 0.3)',
    viewportBorder: '#6c63ff',
    playhead: '#ef4444',
    markerTick: 'rgba(200, 180, 255, 0.5)',
  };

  function readCssColors(): void {
    if (typeof document === 'undefined') return;
    const style = getComputedStyle(document.documentElement);
    const get = (name: string, fallback: string): string =>
      style.getPropertyValue(name).trim() || fallback;
    colors = {
      bg: get('--surface', '#0d0d1a'),
      viewportBox: get('--timeline-selection', 'rgba(108, 99, 255, 0.3)'),
      viewportBorder: get('--accent', '#6c63ff'),
      playhead: get('--timeline-playhead', '#ef4444'),
      markerTick: 'rgba(200, 180, 255, 0.5)',
    };
  }

  function getTrackDuration(): number {
    return projectStore.metadata.durationMs || videoStore.state.durationMs || 1;
  }

  function msToMinimapX(ms: number): number {
    const duration = getTrackDuration();
    if (duration <= 0) return 0;
    return (ms / duration) * minimapWidth;
  }

  function minimapXToMs(x: number): number {
    const duration = getTrackDuration();
    if (minimapWidth <= 0) return 0;
    return (x / minimapWidth) * duration;
  }

  function render(): void {
    if (!ctx || minimapWidth === 0) return;

    const c = ctx;
    const h = MINIMAP_HEIGHT;
    const w = minimapWidth;
    const duration = getTrackDuration();
    const channels = projectStore.channels;
    const keyframes = projectStore.keyframes;
    const sceneMarkers = projectStore.sceneMarkers;
    const vp = timelineStore.viewport;
    const currentTimeMs = videoStore.state.currentTimeMs;

    c.save();
    c.scale(dpr, dpr);

    // Background
    c.fillStyle = colors.bg;
    c.fillRect(0, 0, w, h);

    if (duration <= 0 || channels.length === 0) {
      c.restore();
      return;
    }

    // Keyframe density per channel as colored bands
    const laneH = Math.max(2, Math.floor(h / channels.length));
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const yBase = Math.floor(i * (h / channels.length));
      const chKeyframes = keyframes.filter((kf) => kf.channelId === ch.id);

      for (const kf of chKeyframes) {
        const x = msToMinimapX(kf.timestampMs);
        let fillColor: string;
        if (kf.colorMode === 'COLOR_TEMPERATURE') {
          fillColor = rgbToHex(kelvinToRgb(kf.colorTemperature));
        } else {
          fillColor = rgbToHex(kf.color);
        }
        c.fillStyle = fillColor;
        c.globalAlpha = 0.8;
        c.fillRect(Math.round(x), yBase, Math.max(2, 1), laneH);
      }
    }
    c.globalAlpha = 1;

    // Scene markers as tick marks
    c.strokeStyle = colors.markerTick;
    c.lineWidth = 1;
    for (const marker of sceneMarkers) {
      const x = msToMinimapX(marker.timestampMs);
      c.beginPath();
      c.moveTo(Math.round(x) + 0.5, 0);
      c.lineTo(Math.round(x) + 0.5, h);
      c.stroke();
    }

    // Viewport rectangle
    const vpStartX = msToMinimapX(vp.scrollX);
    const vpEndMs =
      vp.scrollX +
      (vp.viewportWidth > 0 && vp.pxPerMs > 0 ? vp.viewportWidth / vp.pxPerMs : duration);
    const vpEndX = msToMinimapX(Math.min(vpEndMs, duration));
    const vpW = Math.max(4, vpEndX - vpStartX);

    c.fillStyle = colors.viewportBox;
    c.fillRect(vpStartX, 0, vpW, h);
    c.strokeStyle = colors.viewportBorder;
    c.lineWidth = 1;
    c.strokeRect(vpStartX + 0.5, 0.5, vpW - 1, h - 1);

    // Playhead
    const playheadX = msToMinimapX(currentTimeMs);
    c.strokeStyle = colors.playhead;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(Math.round(playheadX), 0);
    c.lineTo(Math.round(playheadX), h);
    c.stroke();

    c.restore();
  }

  function updateSize(): void {
    if (!containerEl || !canvasEl) return;
    dpr = window.devicePixelRatio || 1;
    const rect = containerEl.getBoundingClientRect();
    minimapWidth = Math.floor(rect.width);
    canvasEl.width = minimapWidth * dpr;
    canvasEl.height = MINIMAP_HEIGHT * dpr;
    canvasEl.style.width = `${minimapWidth}px`;
    canvasEl.style.height = `${MINIMAP_HEIGHT}px`;
  }

  // React to store changes and rerender
  $effect(() => {
    timelineStore.viewport;
    projectStore.channels;
    projectStore.keyframes;
    projectStore.sceneMarkers;
    videoStore.state.currentTimeMs;
    render();
  });

  $effect(() => {
    if (!containerEl || !canvasEl) return;

    ctx = canvasEl.getContext('2d', { alpha: false });
    readCssColors();
    updateSize();
    render();

    const ro = new ResizeObserver(() => {
      updateSize();
      render();
    });
    ro.observe(containerEl);

    return () => {
      ro.disconnect();
    };
  });

  // ---- INTERACTION ----
  function handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !containerEl) return;
    e.preventDefault();

    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickedMs = minimapXToMs(x);

    const vp = timelineStore.viewport;
    const visibleDuration =
      vp.viewportWidth > 0 && vp.pxPerMs > 0 ? vp.viewportWidth / vp.pxPerMs : 0;

    // Check if click is within the viewport box
    const vpStartX = msToMinimapX(vp.scrollX);
    const vpEndX = msToMinimapX(vp.scrollX + visibleDuration);
    if (x >= vpStartX && x <= vpEndX) {
      // Drag the viewport box
      dragOffsetMs = clickedMs - vp.scrollX;
    } else {
      // Jump: center viewport on click position
      timelineStore.scrollTo(Math.max(0, clickedMs - visibleDuration / 2));
      dragOffsetMs = visibleDuration / 2;
    }

    isDragging = true;
    containerEl.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!isDragging || !containerEl) return;

    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickedMs = minimapXToMs(x);
    timelineStore.scrollTo(Math.max(0, clickedMs - dragOffsetMs));
  }

  function handlePointerUp(e: PointerEvent): void {
    if (!isDragging || !containerEl) return;
    isDragging = false;
    containerEl.releasePointerCapture(e.pointerId);
  }

  function handleContextMenu(e: MouseEvent): void {
    // STU-029m: no context menu on minimap
    e.preventDefault();
  }
</script>

<div
  bind:this={containerEl}
  class="relative w-full"
  style="height: {MINIMAP_HEIGHT}px;"
  role="slider"
  aria-label="Timeline minimap"
  aria-valuenow={Math.round(timelineStore.viewport.scrollX)}
  aria-valuemin={0}
  aria-valuemax={Math.round(getTrackDuration())}
  tabindex="-1"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  oncontextmenu={handleContextMenu}
>
  <canvas bind:this={canvasEl} class="block cursor-pointer"></canvas>
</div>
