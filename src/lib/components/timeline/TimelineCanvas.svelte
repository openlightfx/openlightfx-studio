<script lang="ts">
  import type { Channel, Keyframe, EffectKeyframe, RGBColor } from '$lib/types/index.js';
  import type { SceneMarker } from '$lib/types/index.js';
  import {
    CHANNEL_LANE_HEIGHT,
    CHANNEL_HEADER_WIDTH,
    RULER_HEIGHT,
    KEYFRAME_MARKER_WIDTH,
    KEYFRAME_MARKER_HEIGHT,
  } from '$lib/types/index.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { rgbToHex, kelvinToRgb } from '$lib/services/color-utils.js';
  import { EFFECT_DEFINITION_MAP } from '$lib/effects/definitions.js';

  let {
    selectionRect = null,
  }: {
    selectionRect?: { startX: number; startY: number; endX: number; endY: number } | null;
  } = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let ctx: CanvasRenderingContext2D | null = $state(null);
  let containerEl: HTMLDivElement | undefined = $state();
  let dpr = $state(typeof window !== 'undefined' ? window.devicePixelRatio : 1);
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);
  let rafId: number | null = null;
  let dirty = true;

  // Cached CSS variable values (read once and on theme change)
  let colors = {
    rulerBg: '#141428',
    laneBg: '#161630',
    laneAltBg: '#1a1a35',
    gridLine: 'rgba(108, 99, 255, 0.08)',
    playhead: '#ef4444',
    selection: 'rgba(108, 99, 255, 0.2)',
    textBase: '#e0e0f0',
    textMuted: '#8888aa',
    surface: '#0d0d1a',
    accent: '#6c63ff',
  };

  function readCssColors(): void {
    if (typeof document === 'undefined') return;
    const style = getComputedStyle(document.documentElement);
    const get = (name: string, fallback: string): string =>
      style.getPropertyValue(name).trim() || fallback;
    colors = {
      rulerBg: get('--timeline-ruler-bg', '#141428'),
      laneBg: get('--timeline-lane-bg', '#161630'),
      laneAltBg: get('--timeline-lane-alt-bg', '#1a1a35'),
      gridLine: get('--timeline-grid-line', 'rgba(108, 99, 255, 0.08)'),
      playhead: get('--timeline-playhead', '#ef4444'),
      selection: get('--timeline-selection', 'rgba(108, 99, 255, 0.2)'),
      textBase: get('--text-base', '#e0e0f0'),
      textMuted: get('--textMuted', '#8888aa'),
      surface: get('--surface', '#0d0d1a'),
      accent: get('--accent', '#6c63ff'),
    };
  }

  // Time formatting
  function formatTime(ms: number, totalDurationMs: number): string {
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const millis = Math.floor(ms % 1000);

    if (totalDurationMs >= 3600000) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    if (ms < 1000 || totalDurationMs < 10000) {
      return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0').slice(0, 1)}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  // Tick interval selection based on zoom level (pxPerMs)
  interface TickLevel {
    majorMs: number;
    minorMs: number;
    label: string;
  }

  function getTickLevel(pxPerMs: number): TickLevel {
    // pxPerMs * intervalMs should give reasonable pixel spacing
    // Target: ~80-200px between major ticks
    const targetPx = 120;
    const idealMs = targetPx / pxPerMs;

    const levels: { major: number; minor: number; label: string }[] = [
      { major: 300000, minor: 60000, label: '5m' },
      { major: 60000, minor: 10000, label: '1m' },
      { major: 30000, minor: 5000, label: '30s' },
      { major: 10000, minor: 2000, label: '10s' },
      { major: 5000, minor: 1000, label: '5s' },
      { major: 1000, minor: 200, label: '1s' },
      { major: 500, minor: 100, label: '500ms' },
      { major: 100, minor: 20, label: '100ms' },
    ];

    for (const lev of levels) {
      if (lev.major <= idealMs * 2) {
        return { majorMs: lev.major, minorMs: lev.minor, label: lev.label };
      }
    }
    return { majorMs: 100, minorMs: 20, label: '100ms' };
  }

  // Keyframe display color
  function getKeyframeDisplayColor(kf: Keyframe): string {
    if (kf.colorMode === 'COLOR_TEMPERATURE') {
      return rgbToHex(kelvinToRgb(kf.colorTemperature));
    }
    return rgbToHex(kf.color);
  }

  function getEffectDisplayColor(ef: EffectKeyframe): string {
    return rgbToHex(ef.primaryColor);
  }

  // ---- RENDER ----
  function render(): void {
    if (!ctx || canvasWidth === 0 || canvasHeight === 0) return;

    const c = ctx;
    const vp = timelineStore.viewport;
    const channels = projectStore.channels;
    const keyframes = projectStore.keyframes;
    const effectKeyframes = projectStore.effectKeyframes;
    const sceneMarkers = projectStore.sceneMarkers;
    const selectedKfIds = timelineStore.selection.keyframeIds;
    const selectedEfIds = timelineStore.selection.effectKeyframeIds;
    const selectedSmIds = timelineStore.selection.sceneMarkerIds;
    const currentTimeMs = videoStore.state.currentTimeMs;
    const trackDurationMs = projectStore.metadata.durationMs || videoStore.state.durationMs || 0;

    const w = canvasWidth;
    const h = canvasHeight;
    const headerW = CHANNEL_HEADER_WIDTH;
    const rulerH = RULER_HEIGHT;
    const laneH = CHANNEL_LANE_HEIGHT;

    c.save();
    c.scale(dpr, dpr);

    // 1. Background
    c.fillStyle = colors.surface;
    c.fillRect(0, 0, w, h);

    // Content area starts after ruler
    const contentTop = rulerH;
    const contentLeft = headerW;
    const contentWidth = w - headerW;

    // 2. Channel lane backgrounds
    for (let i = 0; i < channels.length; i++) {
      const y = contentTop + i * laneH - vp.scrollY;
      if (y + laneH < contentTop || y > h) continue;
      c.fillStyle = i % 2 === 0 ? colors.laneBg : colors.laneAltBg;
      c.fillRect(contentLeft, Math.max(y, contentTop), contentWidth, laneH - Math.max(0, contentTop - y));
    }

    // Clip content area for grid, markers, keyframes
    c.save();
    c.beginPath();
    c.rect(contentLeft, contentTop, contentWidth, h - contentTop);
    c.clip();

    // 3. Grid lines (vertical)
    const tickLevel = getTickLevel(vp.pxPerMs);
    const visibleStartMs = vp.scrollX;
    const visibleEndMs = vp.scrollX + (contentWidth / vp.pxPerMs);

    const gridStartMs = Math.floor(visibleStartMs / tickLevel.minorMs) * tickLevel.minorMs;
    c.lineWidth = 1;
    for (let ms = gridStartMs; ms <= visibleEndMs; ms += tickLevel.minorMs) {
      const x = contentLeft + (ms - vp.scrollX) * vp.pxPerMs;
      if (x < contentLeft || x > w) continue;
      const isMajor = ms % tickLevel.majorMs === 0;
      c.strokeStyle = isMajor ? colors.gridLine.replace('0.08', '0.18') : colors.gridLine;
      c.beginPath();
      c.moveTo(Math.round(x) + 0.5, contentTop);
      c.lineTo(Math.round(x) + 0.5, h);
      c.stroke();
    }

    // 4. Scene markers (vertical dashed lines)
    c.setLineDash([6, 4]);
    c.lineWidth = 1;
    for (const marker of sceneMarkers) {
      const x = contentLeft + (marker.timestampMs - vp.scrollX) * vp.pxPerMs;
      if (x < contentLeft - 50 || x > w + 50) continue;
      const isSelected = selectedSmIds.includes(marker.id);
      c.strokeStyle = isSelected ? colors.accent : 'rgba(200, 180, 255, 0.4)';
      c.beginPath();
      c.moveTo(Math.round(x) + 0.5, contentTop);
      c.lineTo(Math.round(x) + 0.5, h);
      c.stroke();
    }
    c.setLineDash([]);

    // 5. Effect blocks (colored rectangles)
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const laneY = contentTop + i * laneH - vp.scrollY;
      if (laneY + laneH < contentTop || laneY > h) continue;

      const chEffects = effectKeyframes.filter((ef) => ef.channelId === ch.id);
      for (const ef of chEffects) {
        const x1 = contentLeft + (ef.timestampMs - vp.scrollX) * vp.pxPerMs;
        const x2 = contentLeft + (ef.timestampMs + ef.durationMs - vp.scrollX) * vp.pxPerMs;
        if (x2 < contentLeft || x1 > w) continue;

        const drawX = Math.max(x1, contentLeft);
        const drawW = Math.min(x2, w) - drawX;
        const drawY = Math.max(laneY + 2, contentTop);
        const drawH = laneH - 4;
        const isSelected = selectedEfIds.includes(ef.id);

        // Effect block background
        const efColor = getEffectDisplayColor(ef);
        c.globalAlpha = 0.35;
        c.fillStyle = efColor;
        c.fillRect(drawX, drawY, drawW, drawH);
        c.globalAlpha = 1;

        // Effect block border
        c.strokeStyle = isSelected ? colors.accent : efColor;
        c.lineWidth = isSelected ? 2 : 1;
        c.strokeRect(drawX, drawY, drawW, drawH);

        // Effect label
        if (drawW > 30) {
          const def = EFFECT_DEFINITION_MAP.get(ef.effectType);
          const label = def ? `${def.icon} ${def.name}` : ef.effectType;
          c.fillStyle = colors.textBase;
          c.font = '10px system-ui, sans-serif';
          c.save();
          c.beginPath();
          c.rect(drawX, drawY, drawW, drawH);
          c.clip();
          c.fillText(label, drawX + 4, drawY + drawH / 2 + 3);
          c.restore();
        }
      }
    }

    // 6. Keyframe markers
    const kfHalfW = KEYFRAME_MARKER_WIDTH / 2;
    const kfHalfH = KEYFRAME_MARKER_HEIGHT / 2;

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const laneY = contentTop + i * laneH - vp.scrollY;
      if (laneY + laneH < contentTop || laneY > h) continue;

      const centerY = laneY + laneH / 2;
      const chKeyframes = keyframes.filter((kf) => kf.channelId === ch.id);

      for (const kf of chKeyframes) {
        const x = contentLeft + (kf.timestampMs - vp.scrollX) * vp.pxPerMs;
        if (x < contentLeft - kfHalfW || x > w + kfHalfW) continue;

        const isSelected = selectedKfIds.includes(kf.id);
        const fillColor = getKeyframeDisplayColor(kf);

        // Diamond shape
        c.beginPath();
        c.moveTo(x, centerY - kfHalfH);
        c.lineTo(x + kfHalfW, centerY);
        c.lineTo(x, centerY + kfHalfH);
        c.lineTo(x - kfHalfW, centerY);
        c.closePath();

        c.fillStyle = fillColor;
        c.fill();

        if (isSelected) {
          c.strokeStyle = colors.accent;
          c.lineWidth = 2;
          c.stroke();
          // Glow effect
          c.shadowColor = colors.accent;
          c.shadowBlur = 6;
          c.stroke();
          c.shadowBlur = 0;
        } else {
          c.strokeStyle = 'rgba(255,255,255,0.3)';
          c.lineWidth = 1;
          c.stroke();
        }
      }
    }

    // 7. Playhead
    if (trackDurationMs > 0 || currentTimeMs > 0) {
      const playheadX = contentLeft + (currentTimeMs - vp.scrollX) * vp.pxPerMs;
      if (playheadX >= contentLeft && playheadX <= w) {
        c.strokeStyle = colors.playhead;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(Math.round(playheadX), 0);
        c.lineTo(Math.round(playheadX), h);
        c.stroke();

        // Playhead triangle at ruler
        c.fillStyle = colors.playhead;
        c.beginPath();
        c.moveTo(playheadX - 5, 0);
        c.lineTo(playheadX + 5, 0);
        c.lineTo(playheadX, 8);
        c.closePath();
        c.fill();
      }
    }

    // 8. Selection rectangle
    if (selectionRect) {
      const sr = selectionRect;
      const rx = Math.min(sr.startX, sr.endX);
      const ry = Math.min(sr.startY, sr.endY);
      const rw = Math.abs(sr.endX - sr.startX);
      const rh = Math.abs(sr.endY - sr.startY);
      c.fillStyle = colors.selection;
      c.fillRect(rx, ry, rw, rh);
      c.strokeStyle = colors.accent;
      c.lineWidth = 1;
      c.strokeRect(rx, ry, rw, rh);
    }

    c.restore(); // unclip content area

    // 9. Ruler (on top)
    c.fillStyle = colors.rulerBg;
    c.fillRect(0, 0, w, rulerH);

    // Ruler ticks
    c.font = '10px system-ui, sans-serif';
    for (let ms = gridStartMs; ms <= visibleEndMs; ms += tickLevel.minorMs) {
      const x = contentLeft + (ms - vp.scrollX) * vp.pxPerMs;
      if (x < contentLeft || x > w) continue;
      const isMajor = ms % tickLevel.majorMs === 0;
      const tickH = isMajor ? 10 : 5;

      c.strokeStyle = isMajor ? colors.textMuted : 'rgba(136,136,170,0.4)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(Math.round(x) + 0.5, rulerH);
      c.lineTo(Math.round(x) + 0.5, rulerH - tickH);
      c.stroke();

      if (isMajor) {
        c.fillStyle = colors.textMuted;
        c.fillText(formatTime(ms, trackDurationMs), x + 3, rulerH - 12);
      }
    }

    // Ruler left cap
    c.fillStyle = colors.rulerBg;
    c.fillRect(0, 0, headerW, rulerH);
    // Duration label in ruler cap
    c.fillStyle = colors.textMuted;
    c.font = '10px system-ui, sans-serif';
    c.fillText(formatTime(currentTimeMs, trackDurationMs), 8, rulerH - 10);

    // 10. Channel headers (left column)
    c.fillStyle = colors.rulerBg;
    c.fillRect(0, rulerH, headerW, h - rulerH);

    // Header separator line
    c.strokeStyle = 'rgba(108,99,255,0.15)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(headerW - 0.5, rulerH);
    c.lineTo(headerW - 0.5, h);
    c.stroke();

    c.save();
    c.beginPath();
    c.rect(0, rulerH, headerW, h - rulerH);
    c.clip();

    c.font = '11px system-ui, sans-serif';
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const y = contentTop + i * laneH - vp.scrollY;
      if (y + laneH < contentTop || y > h) continue;

      const isActive = timelineStore.selection.activeChannelId === ch.id;

      // Header background
      c.fillStyle = isActive ? 'rgba(108,99,255,0.12)' : 'transparent';
      if (isActive) c.fillRect(0, y, headerW, laneH);

      // Channel color indicator
      const indicatorColor = rgbToHex(ch.defaultColor);
      c.fillStyle = indicatorColor;
      c.fillRect(6, y + laneH / 2 - 5, 10, 10);
      c.strokeStyle = 'rgba(255,255,255,0.3)';
      c.lineWidth = 1;
      c.strokeRect(6, y + laneH / 2 - 5, 10, 10);

      // Channel name
      c.fillStyle = isActive ? colors.textBase : colors.textMuted;
      c.save();
      c.beginPath();
      c.rect(22, y, headerW - 26, laneH);
      c.clip();
      c.fillText(ch.displayName, 22, y + laneH / 2 + 4);
      c.restore();
    }

    // Scene marker labels in headers region (at top of content area)
    c.restore(); // unclip header area

    // Scene marker labels at the top of the content area
    c.save();
    c.beginPath();
    c.rect(contentLeft, contentTop, contentWidth, 16);
    c.clip();
    c.font = '9px system-ui, sans-serif';
    for (const marker of sceneMarkers) {
      const x = contentLeft + (marker.timestampMs - vp.scrollX) * vp.pxPerMs;
      if (x < contentLeft - 50 || x > w + 50) continue;
      const isSelected = selectedSmIds.includes(marker.id);
      c.fillStyle = isSelected ? colors.accent : 'rgba(200,180,255,0.6)';
      c.fillText(marker.label, x + 3, contentTop + 10);
    }
    c.restore();

    c.restore(); // undo initial scale
  }

  // ---- LIFECYCLE ----
  function setupCanvas(): void {
    if (!canvasEl || !containerEl) return;
    ctx = canvasEl.getContext('2d', { alpha: false });
    readCssColors();
    updateSize();
  }

  function updateSize(): void {
    if (!containerEl || !canvasEl) return;
    dpr = window.devicePixelRatio || 1;
    const rect = containerEl.getBoundingClientRect();
    canvasWidth = Math.floor(rect.width);
    canvasHeight = Math.floor(rect.height);
    canvasEl.width = canvasWidth * dpr;
    canvasEl.height = canvasHeight * dpr;
    canvasEl.style.width = `${canvasWidth}px`;
    canvasEl.style.height = `${canvasHeight}px`;
    timelineStore.setViewportSize(canvasWidth - CHANNEL_HEADER_WIDTH, canvasHeight - RULER_HEIGHT);
    dirty = true;
  }

  // Animation frame loop
  function startRenderLoop(): void {
    const tick = (): void => {
      if (dirty || videoStore.state.isPlaying) {
        render();
        dirty = false;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function stopRenderLoop(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  /** Call to force a redraw on the next frame */
  export function markDirty(): void {
    dirty = true;
  }

  // React to store changes
  $effect(() => {
    // Access reactive state to track dependencies
    timelineStore.viewport;
    timelineStore.selection;
    projectStore.channels;
    projectStore.keyframes;
    projectStore.effectKeyframes;
    projectStore.sceneMarkers;
    videoStore.state.currentTimeMs;
    selectionRect;
    dirty = true;
  });

  $effect(() => {
    if (!containerEl) return;

    setupCanvas();
    startRenderLoop();

    const ro = new ResizeObserver(() => {
      updateSize();
    });
    ro.observe(containerEl);

    // Listen for DPI changes
    const mql = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const handleDprChange = () => {
      updateSize();
    };
    mql.addEventListener('change', handleDprChange);

    return () => {
      stopRenderLoop();
      ro.disconnect();
      mql.removeEventListener('change', handleDprChange);
    };
  });
</script>

<div bind:this={containerEl} class="absolute inset-0 overflow-hidden">
  <canvas bind:this={canvasEl} class="block"></canvas>
</div>
