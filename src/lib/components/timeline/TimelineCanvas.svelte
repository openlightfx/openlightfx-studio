<script lang="ts">
  import { onMount } from 'svelte';

  let {
    channels = [],
    keyframes = [],
    effectKeyframes = [],
    sceneMarkers = [],
    playheadMs = 0,
    viewportStartMs = 0,
    viewportEndMs = 60000,
    pixelsPerMs = 0.1,
    selectedKeyframeIds = new Set<string>(),
    selectedEffectIds = new Set<string>(),
    selectedChannelId = null as string | null,
    laneHeight = 40,
    rulerHeight = 28,
    onseek,
    onkeyframeclick,
    onkeyframedblclick,
    onlanedblclick,
    onlaneclick,
    oncontextmenu,
    onkeyframedrag,
  }: {
    channels?: Array<{ id: string; displayName: string }>;
    keyframes?: Array<{
      id: string;
      channelId: string;
      timestampMs: number;
      color?: { r: number; g: number; b: number };
      brightness?: number;
    }>;
    effectKeyframes?: Array<{
      id: string;
      channelId: string;
      timestampMs: number;
      durationMs: number;
      effectType: string;
      primaryColor?: { r: number; g: number; b: number };
    }>;
    sceneMarkers?: Array<{ id: string; timestampMs: number; label: string; type: string }>;
    playheadMs?: number;
    viewportStartMs?: number;
    viewportEndMs?: number;
    pixelsPerMs?: number;
    selectedKeyframeIds?: Set<string>;
    selectedEffectIds?: Set<string>;
    selectedChannelId?: string | null;
    laneHeight?: number;
    rulerHeight?: number;
    onseek?: (ms: number) => void;
    onkeyframeclick?: (id: string, e: MouseEvent) => void;
    onkeyframedblclick?: (id: string) => void;
    onlanedblclick?: (channelId: string, timestampMs: number) => void;
    onlaneclick?: (channelId: string) => void;
    oncontextmenu?: (e: MouseEvent, channelId: string, timestampMs: number) => void;
    onkeyframedrag?: (id: string, newTimestampMs: number) => void;
  } = $props();

  let canvasEl: HTMLCanvasElement;
  let containerEl: HTMLDivElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let canvasWidth = $state(800);
  let canvasHeight = $state(400);
  let dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  // Dragging state
  let dragKeyframeId = $state<string | null>(null);
  let dragStartX = 0;
  let dragStartMs = 0;

  const HEADER_WIDTH = 140;
  const KEYFRAME_SIZE = 10;

  function msToX(ms: number): number {
    return HEADER_WIDTH + (ms - viewportStartMs) * pixelsPerMs;
  }

  function xToMs(x: number): number {
    return viewportStartMs + (x - HEADER_WIDTH) / pixelsPerMs;
  }

  function channelIndexToY(index: number): number {
    return rulerHeight + index * laneHeight;
  }

  function draw() {
    if (!ctx || !canvasEl) return;
    const w = canvasWidth;
    const h = canvasHeight;

    ctx.clearRect(0, 0, w * dpr, h * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = getComputedStyle(canvasEl).getPropertyValue('--bg').trim() || '#0f0f1a';
    ctx.fillRect(0, 0, w, h);

    // Draw ruler
    drawRuler(ctx, w);

    // Draw channel lanes
    channels.forEach((ch, i) => {
      drawLane(ctx!, ch, i, w);
    });

    // Draw scene markers
    sceneMarkers.forEach((marker) => {
      const x = msToX(marker.timestampMs);
      if (x < HEADER_WIDTH || x > w) return;
      ctx!.save();
      ctx!.strokeStyle = '#f59e0b';
      ctx!.lineWidth = 1;
      ctx!.setLineDash([4, 4]);
      ctx!.beginPath();
      ctx!.moveTo(x, rulerHeight);
      ctx!.lineTo(x, h);
      ctx!.stroke();
      ctx!.setLineDash([]);

      // Label
      ctx!.fillStyle = '#f59e0b';
      ctx!.font = '9px Inter, system-ui';
      ctx!.fillText(marker.label, x + 3, rulerHeight - 4);
      ctx!.restore();
    });

    // Draw effect blocks
    effectKeyframes.forEach((ek) => {
      const chIndex = channels.findIndex((c) => c.id === ek.channelId);
      if (chIndex < 0) return;
      const x1 = msToX(ek.timestampMs);
      const x2 = msToX(ek.timestampMs + ek.durationMs);
      if (x2 < HEADER_WIDTH || x1 > w) return;
      const y = channelIndexToY(chIndex);
      const selected = selectedEffectIds.has(ek.id);

      ctx!.fillStyle = selected
        ? 'rgba(108, 99, 255, 0.4)'
        : 'rgba(108, 99, 255, 0.2)';
      ctx!.strokeStyle = selected ? '#6c63ff' : 'rgba(108, 99, 255, 0.5)';
      ctx!.lineWidth = selected ? 2 : 1;

      const bx = Math.max(x1, HEADER_WIDTH);
      const bw = Math.min(x2, w) - bx;
      const r = 4;
      ctx!.beginPath();
      ctx!.roundRect(bx, y + 4, bw, laneHeight - 8, r);
      ctx!.fill();
      ctx!.stroke();

      // Effect type label
      ctx!.fillStyle = '#e2e8f0';
      ctx!.font = '9px Inter, system-ui';
      ctx!.fillText(ek.effectType, bx + 4, y + laneHeight / 2 + 3);
    });

    // Draw keyframes
    keyframes.forEach((kf) => {
      const chIndex = channels.findIndex((c) => c.id === kf.channelId);
      if (chIndex < 0) return;
      const x = msToX(kf.timestampMs);
      if (x < HEADER_WIDTH - KEYFRAME_SIZE || x > w + KEYFRAME_SIZE) return;
      const y = channelIndexToY(chIndex) + laneHeight / 2;
      const selected = selectedKeyframeIds.has(kf.id);
      const color = kf.color
        ? `rgb(${kf.color.r}, ${kf.color.g}, ${kf.color.b})`
        : '#6c63ff';

      // Diamond shape
      const s = KEYFRAME_SIZE / 2;
      ctx!.save();
      ctx!.beginPath();
      ctx!.moveTo(x, y - s);
      ctx!.lineTo(x + s, y);
      ctx!.lineTo(x, y + s);
      ctx!.lineTo(x - s, y);
      ctx!.closePath();
      ctx!.fillStyle = color;
      ctx!.fill();

      if (selected) {
        ctx!.strokeStyle = '#ffffff';
        ctx!.lineWidth = 2;
        ctx!.stroke();
      } else {
        ctx!.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }
      ctx!.restore();
    });

    // Draw playhead
    const playheadX = msToX(playheadMs);
    if (playheadX >= HEADER_WIDTH && playheadX <= w) {
      ctx!.strokeStyle = '#ff4444';
      ctx!.lineWidth = 1.5;
      ctx!.beginPath();
      ctx!.moveTo(playheadX, 0);
      ctx!.lineTo(playheadX, h);
      ctx!.stroke();

      // Playhead triangle
      ctx!.fillStyle = '#ff4444';
      ctx!.beginPath();
      ctx!.moveTo(playheadX - 5, 0);
      ctx!.lineTo(playheadX + 5, 0);
      ctx!.lineTo(playheadX, 7);
      ctx!.closePath();
      ctx!.fill();
    }

    ctx.restore();
  }

  function drawRuler(ctx: CanvasRenderingContext2D, width: number) {
    ctx.fillStyle = getComputedStyle(canvasEl).getPropertyValue('--surface').trim() || '#1a1a2e';
    ctx.fillRect(0, 0, width, rulerHeight);

    // Bottom border
    ctx.strokeStyle =
      getComputedStyle(canvasEl).getPropertyValue('--surface2').trim() || '#252540';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerHeight);
    ctx.lineTo(width, rulerHeight);
    ctx.stroke();

    // Tick marks
    const { majorMs, minorMs, labelFn } = getRulerIntervals();
    const startMs = Math.floor(viewportStartMs / minorMs) * minorMs;
    const endMs = viewportEndMs;

    for (let ms = startMs; ms <= endMs; ms += minorMs) {
      const x = msToX(ms);
      if (x < HEADER_WIDTH) continue;
      if (x > width) break;

      const isMajor = ms % majorMs === 0;
      ctx.strokeStyle = isMajor ? '#94a3b8' : '#4a4a6a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, isMajor ? rulerHeight - 12 : rulerHeight - 6);
      ctx.lineTo(x, rulerHeight);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Inter, system-ui';
        ctx.fillText(labelFn(ms), x + 3, rulerHeight - 14);
      }
    }
  }

  function getRulerIntervals(): {
    majorMs: number;
    minorMs: number;
    labelFn: (ms: number) => string;
  } {
    const pxPerSec = pixelsPerMs * 1000;
    if (pxPerSec > 200) return { majorMs: 1000, minorMs: 100, labelFn: formatMs };
    if (pxPerSec > 50) return { majorMs: 5000, minorMs: 1000, labelFn: formatMs };
    if (pxPerSec > 20) return { majorMs: 10000, minorMs: 2000, labelFn: formatMs };
    if (pxPerSec > 5) return { majorMs: 30000, minorMs: 5000, labelFn: formatMs };
    return { majorMs: 60000, minorMs: 10000, labelFn: formatMs };
  }

  function formatMs(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function drawLane(
    ctx: CanvasRenderingContext2D,
    channel: { id: string; displayName: string },
    index: number,
    width: number
  ) {
    const y = channelIndexToY(index);
    const isSelected = channel.id === selectedChannelId;

    // Lane background
    ctx.fillStyle = isSelected
      ? 'rgba(108, 99, 255, 0.08)'
      : index % 2 === 0
        ? 'rgba(26, 26, 46, 0.5)'
        : 'rgba(26, 26, 46, 0.3)';
    ctx.fillRect(0, y, width, laneHeight);

    // Lane border
    ctx.strokeStyle = '#252540';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y + laneHeight);
    ctx.lineTo(width, y + laneHeight);
    ctx.stroke();

    // Channel header background
    ctx.fillStyle = isSelected ? 'rgba(108, 99, 255, 0.15)' : '#1a1a2e';
    ctx.fillRect(0, y, HEADER_WIDTH, laneHeight);

    // Header right border
    ctx.strokeStyle = '#252540';
    ctx.beginPath();
    ctx.moveTo(HEADER_WIDTH, y);
    ctx.lineTo(HEADER_WIDTH, y + laneHeight);
    ctx.stroke();

    // Channel name
    ctx.fillStyle = isSelected ? '#e2e8f0' : '#94a3b8';
    ctx.font = '11px Inter, system-ui';
    ctx.fillText(channel.displayName, 10, y + laneHeight / 2 + 4, HEADER_WIDTH - 20);
  }

  // Canvas interaction handlers
  function handleCanvasClick(e: MouseEvent) {
    const rect = canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Ruler click -> seek
    if (y < rulerHeight && x > HEADER_WIDTH) {
      onseek?.(xToMs(x));
      return;
    }

    // Channel header click
    if (x < HEADER_WIDTH && y > rulerHeight) {
      const laneIndex = Math.floor((y - rulerHeight) / laneHeight);
      if (laneIndex >= 0 && laneIndex < channels.length) {
        onlaneclick?.(channels[laneIndex].id);
      }
      return;
    }

    // Check if clicking on a keyframe
    if (x > HEADER_WIDTH && y > rulerHeight) {
      const hitKf = findKeyframeAt(x, y);
      if (hitKf) {
        onkeyframeclick?.(hitKf.id, e);
        return;
      }

      // Click on empty lane area -> select channel
      const laneIndex = Math.floor((y - rulerHeight) / laneHeight);
      if (laneIndex >= 0 && laneIndex < channels.length) {
        onlaneclick?.(channels[laneIndex].id);
      }
    }
  }

  function handleCanvasDblClick(e: MouseEvent) {
    const rect = canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x > HEADER_WIDTH && y > rulerHeight) {
      // Check for keyframe double-click first
      const hitKf = findKeyframeAt(x, y);
      if (hitKf) {
        onkeyframedblclick?.(hitKf.id);
        return;
      }

      // Double-click on lane -> add keyframe
      const laneIndex = Math.floor((y - rulerHeight) / laneHeight);
      if (laneIndex >= 0 && laneIndex < channels.length) {
        const timestampMs = xToMs(x);
        onlanedblclick?.(channels[laneIndex].id, timestampMs);
      }
    }
  }

  function handleCanvasContextMenu(e: MouseEvent) {
    e.preventDefault();
    const rect = canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x > HEADER_WIDTH && y > rulerHeight) {
      const laneIndex = Math.floor((y - rulerHeight) / laneHeight);
      if (laneIndex >= 0 && laneIndex < channels.length) {
        const timestampMs = xToMs(x);
        oncontextmenu?.(e, channels[laneIndex].id, timestampMs);
      }
    }
  }

  function findKeyframeAt(
    x: number,
    y: number
  ): { id: string; channelId: string; timestampMs: number } | null {
    const hitRadius = KEYFRAME_SIZE;
    for (const kf of keyframes) {
      const chIndex = channels.findIndex((c) => c.id === kf.channelId);
      if (chIndex < 0) continue;
      const kfX = msToX(kf.timestampMs);
      const kfY = channelIndexToY(chIndex) + laneHeight / 2;
      if (Math.abs(x - kfX) < hitRadius && Math.abs(y - kfY) < hitRadius) {
        return kf;
      }
    }
    return null;
  }

  // Pointer events for keyframe dragging
  function handlePointerDown(e: PointerEvent) {
    const rect = canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check for ruler drag-scrub
    if (y < rulerHeight && x > HEADER_WIDTH) {
      canvasEl.setPointerCapture(e.pointerId);
      onseek?.(xToMs(x));
      return;
    }

    const hitKf = findKeyframeAt(x, y);
    if (hitKf && selectedKeyframeIds.has(hitKf.id)) {
      dragKeyframeId = hitKf.id;
      dragStartX = x;
      dragStartMs = hitKf.timestampMs;
      canvasEl.setPointerCapture(e.pointerId);
    }
  }

  function handlePointerMove(e: PointerEvent) {
    const rect = canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Ruler scrub
    if (canvasEl.hasPointerCapture(e.pointerId) && !dragKeyframeId && y < rulerHeight + 20) {
      onseek?.(Math.max(0, xToMs(x)));
      return;
    }

    if (dragKeyframeId) {
      const deltaX = x - dragStartX;
      const deltaMs = deltaX / pixelsPerMs;
      const newMs = Math.max(0, dragStartMs + deltaMs);
      onkeyframedrag?.(dragKeyframeId, newMs);
    }
  }

  function handlePointerUp() {
    dragKeyframeId = null;
  }

  // Resize observer for HiDPI
  onMount(() => {
    dpr = window.devicePixelRatio || 1;
    ctx = canvasEl.getContext('2d');

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        canvasWidth = entry.contentRect.width;
        canvasHeight = entry.contentRect.height;
        canvasEl.width = canvasWidth * dpr;
        canvasEl.height = canvasHeight * dpr;
        draw();
      }
    });
    observer.observe(containerEl);

    return () => observer.disconnect();
  });

  // Redraw on state changes
  $effect(() => {
    // Touch all reactive props to track them
    channels;
    keyframes;
    effectKeyframes;
    sceneMarkers;
    playheadMs;
    viewportStartMs;
    viewportEndMs;
    pixelsPerMs;
    selectedKeyframeIds;
    selectedEffectIds;
    selectedChannelId;
    draw();
  });
</script>

<div bind:this={containerEl} class="flex-1 overflow-hidden relative">
  <canvas
    bind:this={canvasEl}
    class="absolute inset-0 w-full h-full"
    style="--bg: var(--bg); --surface: var(--surface); --surface2: var(--surface2);"
    onclick={handleCanvasClick}
    ondblclick={handleCanvasDblClick}
    oncontextmenu={handleCanvasContextMenu}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
  ></canvas>
</div>
