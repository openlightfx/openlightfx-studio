import type { Keyframe, Channel } from '$lib/types/index.js';
import type { SceneMarker } from '$lib/types/timeline.js';
import type { EffectKeyframe } from '$lib/types/track.js';
import { CHANNEL_LANE_HEIGHT, RULER_HEIGHT, KEYFRAME_MARKER_RADIUS } from '$lib/types/timeline.js';
import { rgbToCssString } from '$lib/services/color-utils.js';
import { getEffectDisplayInfo } from '$lib/services/effect-defaults.js';

const EFFECT_BLOCK_HEIGHT = 24;
const EFFECT_BLOCK_Y_OFFSET = (CHANNEL_LANE_HEIGHT - EFFECT_BLOCK_HEIGHT) / 2 + 4;
const MIN_EFFECT_BLOCK_WIDTH = 6;

export interface RenderViewport {
  pxPerMs: number;
  scrollX: number;
  width: number;
  height: number;
}

export function msToPx(ms: number, vp: RenderViewport): number {
  return (ms - vp.scrollX) * vp.pxPerMs;
}

export function pxToMs(px: number, vp: RenderViewport): number {
  return px / vp.pxPerMs + vp.scrollX;
}

export function drawBackground(ctx: CanvasRenderingContext2D, vp: RenderViewport, channelCount: number): void {
  ctx.clearRect(0, 0, vp.width, vp.height);

  // Lane stripes
  for (let i = 0; i < channelCount; i++) {
    const y = RULER_HEIGHT + i * CHANNEL_LANE_HEIGHT;
    ctx.fillStyle = i % 2 === 0 ? '#1a1a2e' : '#1f1f35';
    ctx.fillRect(0, y, vp.width, CHANNEL_LANE_HEIGHT);
  }

  // Time grid
  const startMs = vp.scrollX;
  const endMs = vp.scrollX + vp.width / vp.pxPerMs;
  const interval = getGridInterval(vp.pxPerMs);
  const firstTick = Math.floor(startMs / interval) * interval;

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
  ctx.lineWidth = 1;
  ctx.font = '11px Inter, system-ui';
  ctx.fillStyle = '#94a3b8';

  for (let ms = firstTick; ms <= endMs; ms += interval) {
    const x = msToPx(ms, vp);
    ctx.beginPath();
    ctx.moveTo(x, RULER_HEIGHT);
    ctx.lineTo(x, vp.height);
    ctx.stroke();
    ctx.fillText(formatTime(ms), x + 4, RULER_HEIGHT - 6);
  }
}

export function drawKeyframes(
  ctx: CanvasRenderingContext2D, keyframes: Keyframe[], channels: Channel[],
  vp: RenderViewport, selectedIds: Set<string>,
): void {
  const channelIndex = new Map(channels.map((c, i) => [c.id, i]));

  for (const kf of keyframes) {
    const x = msToPx(kf.timestampMs, vp);
    if (x < -KEYFRAME_MARKER_RADIUS || x > vp.width + KEYFRAME_MARKER_RADIUS) continue;
    const lane = channelIndex.get(kf.channelId);
    if (lane === undefined) continue;
    const y = RULER_HEIGHT + lane * CHANNEL_LANE_HEIGHT + CHANNEL_LANE_HEIGHT / 2;

    const isSelected = selectedIds.has(kf.id);
    ctx.beginPath();
    ctx.arc(x, y, KEYFRAME_MARKER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = rgbToCssString(kf.color);
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, KEYFRAME_MARKER_RADIUS + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(108, 99, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

export function drawPlayhead(ctx: CanvasRenderingContext2D, timeMs: number, vp: RenderViewport, height: number): void {
  const x = msToPx(timeMs, vp);
  if (x < 0 || x > vp.width) return;
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(x - 6, 0);
  ctx.lineTo(x + 6, 0);
  ctx.lineTo(x, 10);
  ctx.closePath();
  ctx.fill();
}

export function drawSceneMarkers(
  ctx: CanvasRenderingContext2D, markers: SceneMarker[], vp: RenderViewport, height: number,
): void {
  for (const marker of markers) {
    const x = msToPx(marker.timestampMs, vp);
    if (x < 0 || x > vp.width) continue;
    ctx.strokeStyle = 'rgba(0, 217, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, RULER_HEIGHT);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#00d9ff';
    ctx.font = '10px Inter';
    ctx.fillText(marker.label, x + 4, RULER_HEIGHT + 12);
  }
}

export function drawSelectionRect(ctx: CanvasRenderingContext2D, rect: { startX: number; startY: number; endX: number; endY: number }): void {
  const x = Math.min(rect.startX, rect.endX);
  const y = Math.min(rect.startY, rect.endY);
  const w = Math.abs(rect.endX - rect.startX);
  const h = Math.abs(rect.endY - rect.startY);
  ctx.fillStyle = 'rgba(108, 99, 255, 0.15)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(108, 99, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

export function drawEffectBlocks(
  ctx: CanvasRenderingContext2D,
  effects: EffectKeyframe[],
  channels: Channel[],
  vp: RenderViewport,
  selectedIds: Set<string>,
): void {
  const channelIndex = new Map(channels.map((c, i) => [c.id, i]));

  for (const effect of effects) {
    const x = msToPx(effect.timestampMs, vp);
    const rawW = effect.durationMs * vp.pxPerMs;
    const w = Math.max(rawW, MIN_EFFECT_BLOCK_WIDTH);

    // Cull offscreen
    if (x + w < 0 || x > vp.width) continue;

    const lane = channelIndex.get(effect.channelId);
    if (lane === undefined) continue;

    const y = RULER_HEIGHT + lane * CHANNEL_LANE_HEIGHT + EFFECT_BLOCK_Y_OFFSET;
    const info = getEffectDisplayInfo(effect.effectType);
    const isSelected = selectedIds.has(effect.id);

    ctx.save();

    // Semi-transparent fill
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = info.color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, EFFECT_BLOCK_HEIGHT, 4);
    ctx.fill();

    // Diagonal stripe overlay — clip to block shape
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.roundRect(x, y, w, EFFECT_BLOCK_HEIGHT, 4);
    ctx.clip();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    const stripeSpacing = 8;
    const stripeExtent = w + EFFECT_BLOCK_HEIGHT;
    for (let offset = -EFFECT_BLOCK_HEIGHT; offset < stripeExtent; offset += stripeSpacing) {
      ctx.beginPath();
      ctx.moveTo(x + offset, y);
      ctx.lineTo(x + offset + EFFECT_BLOCK_HEIGHT, y + EFFECT_BLOCK_HEIGHT);
      ctx.stroke();
    }

    ctx.restore();

    // Label (icon + label) if block is wide enough
    if (w > 40) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Inter, system-ui';
      ctx.textBaseline = 'middle';
      // Clip text to block bounds
      ctx.beginPath();
      ctx.roundRect(x, y, w, EFFECT_BLOCK_HEIGHT, 4);
      ctx.clip();
      ctx.fillText(`${info.icon} ${info.label}`, x + 6, y + EFFECT_BLOCK_HEIGHT / 2);
      ctx.restore();
    }

    // Selection stroke + glow ring
    if (isSelected) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, w, EFFECT_BLOCK_HEIGHT, 4);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(108, 99, 255, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x - 2, y - 2, w + 4, EFFECT_BLOCK_HEIGHT + 4, 6);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function drawSnapIndicator(
  ctx: CanvasRenderingContext2D,
  timeMs: number,
  vp: RenderViewport,
  height: number,
): void {
  const x = msToPx(timeMs, vp);
  if (x < 0 || x > vp.width) return;
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)'; // yellow snap line
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(x, RULER_HEIGHT);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.setLineDash([]);
}

function getGridInterval(pxPerMs: number): number {
  const candidates = [100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000, 300000];
  for (const ms of candidates) {
    if (ms * pxPerMs >= 80) return ms;
  }
  return 600000;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
