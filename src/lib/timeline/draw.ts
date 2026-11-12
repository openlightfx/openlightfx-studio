import type { RGB } from '$lib/model/types';
import { luminance, rgbToHex } from '$lib/engine/color';
import { formatRuler } from '$lib/engine/time';
import {
  RULER_H,
  ROW_H,
  chooseTickStep,
  rowTop,
  timeToX,
  visibleRowRange,
  type View
} from '$lib/timeline/geometry';

export interface DrawChannel {
  id: string;
  color: string;
  muted: boolean;
  active: boolean;
}

export interface DrawKeyframe {
  id: string;
  channelIndex: number;
  timestampMs: number;
  transitionMs: number;
  color: RGB;
  brightness: number;
  selected: boolean;
}

export interface DrawEffect {
  id: string;
  channelIndex: number;
  timestampMs: number;
  durationMs: number;
  label: string;
  color: RGB;
  selected: boolean;
}

export interface DrawMarker {
  id: string;
  timestampMs: number;
  label: string;
  selected: boolean;
}

export interface DrawScene {
  view: View;
  channels: DrawChannel[];
  keyframes: DrawKeyframe[];
  effects: DrawEffect[];
  markers: DrawMarker[];
  playheadMs: number;
  guideMs: number | null;
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
}

const FONT = '11px "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif';
const MONO = '10px "IBM Plex Mono", ui-monospace, monospace';

export function drawTimeline(ctx: CanvasRenderingContext2D, scene: DrawScene): void {
  const { view } = scene;
  const w = view.widthPx;
  const h = view.heightPx;
  if (w < 2 || h < 2) return;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, w, h);

  const { start, end } = visibleRowRange(view, scene.channels.length);
  for (let i = start; i < end; i++) {
    const y = rowTop(view, i);
    const ch = scene.channels[i];
    ctx.fillStyle = ch.active ? '#1c2433' : i % 2 === 0 ? '#141820' : '#171b24';
    ctx.fillRect(0, y, w, ROW_H);
    ctx.fillStyle = ch.color;
    ctx.globalAlpha = ch.muted ? 0.25 : 0.95;
    ctx.fillRect(0, y, 3, ROW_H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#262c38';
    ctx.fillRect(0, y + ROW_H - 1, w, 1);
  }

  const step = chooseTickStep(view.pixelsPerMs);
  const startMs = Math.floor(view.viewStartMs / step) * step;
  const endMs = view.viewStartMs + w / view.pixelsPerMs + step;
  ctx.font = MONO;
  ctx.textBaseline = 'top';
  for (let t = startMs; t <= endMs; t += step) {
    const x = timeToX(view, t);
    if (x < -40 || x > w + 40) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.beginPath();
    ctx.moveTo(x + 0.5, RULER_H);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, RULER_H, w, Math.max(0, h - RULER_H));
  ctx.clip();
  drawEffects(ctx, scene);
  drawKeyframes(ctx, scene);
  ctx.restore();

  ctx.fillStyle = '#0e1116';
  ctx.fillRect(0, 0, w, RULER_H);
  ctx.fillStyle = '#2a3140';
  ctx.fillRect(0, RULER_H - 1, w, 1);
  ctx.font = MONO;
  ctx.textBaseline = 'top';
  for (let t = startMs; t <= endMs; t += step) {
    const x = timeToX(view, t);
    if (x < -80 || x > w + 10) continue;
    ctx.strokeStyle = '#8b95a8';
    ctx.beginPath();
    ctx.moveTo(x + 0.5, RULER_H - 8);
    ctx.lineTo(x + 0.5, RULER_H);
    ctx.stroke();
    ctx.fillStyle = '#9aa6b8';
    ctx.fillText(formatRuler(t, step), x + 4, 4);
  }

  for (const marker of scene.markers) {
    const x = timeToX(view, marker.timestampMs);
    if (x < -20 || x > w + 20) continue;
    ctx.fillStyle = marker.selected ? '#e6a23c' : '#d7c4a1';
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x + 7, 13);
    ctx.lineTo(x, 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = marker.selected ? '#ffe0b0' : '#c8d0dc';
    ctx.font = FONT;
    ctx.fillText(marker.label, x + 10, 8);
  }

  if (scene.guideMs !== null) {
    const x = timeToX(view, scene.guideMs);
    ctx.save();
    ctx.strokeStyle = 'rgba(230, 162, 60, 0.9)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
    ctx.restore();
  }

  const px = timeToX(view, scene.playheadMs);
  if (px >= -2 && px <= w + 2) {
    ctx.strokeStyle = '#ff4d3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 0.5, 0);
    ctx.lineTo(px + 0.5, h);
    ctx.stroke();
    ctx.fillStyle = '#ff4d3a';
    ctx.beginPath();
    ctx.moveTo(px - 6, 0);
    ctx.lineTo(px + 6, 0);
    ctx.lineTo(px, 9);
    ctx.closePath();
    ctx.fill();
  }

  if (scene.marquee) {
    const { x0, y0, x1, y1 } = scene.marquee;
    const left = Math.min(x0, x1);
    const top = Math.min(y0, y1);
    ctx.fillStyle = 'rgba(230, 162, 60, 0.14)';
    ctx.strokeStyle = '#e6a23c';
    ctx.lineWidth = 1;
    ctx.fillRect(left, top, Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.strokeRect(left + 0.5, top + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
  }
}

function drawEffects(ctx: CanvasRenderingContext2D, scene: DrawScene): void {
  const { view } = scene;
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  for (const effect of scene.effects) {
    const y = rowTop(view, effect.channelIndex);
    if (y > view.heightPx || y + ROW_H < RULER_H) continue;
    const x0 = timeToX(view, effect.timestampMs);
    const x1 = timeToX(view, effect.timestampMs + effect.durationMs);
    if (x1 < 0 || x0 > view.widthPx) continue;
    const left = Math.max(0, Math.min(x0, x1));
    const right = Math.min(view.widthPx, Math.max(x0, x1));
    const width = Math.max(2, right - left);
    ctx.fillStyle = rgbToHex(effect.color);
    ctx.globalAlpha = 0.88;
    roundRect(ctx, left, y + 8, width, ROW_H - 16, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (effect.selected) {
      ctx.strokeStyle = '#e6a23c';
      ctx.lineWidth = 2;
      roundRect(ctx, left, y + 8, width, ROW_H - 16, 4);
      ctx.stroke();
      ctx.fillStyle = '#e6a23c';
      ctx.fillRect(x0 - 3, y + 12, 6, ROW_H - 24);
      ctx.fillRect(x1 - 3, y + 12, 6, ROW_H - 24);
    }
    if (width > 46) {
      ctx.fillStyle = luminance(effect.color) > 0.62 ? '#1a140c' : '#f6f8fb';
      ctx.save();
      ctx.beginPath();
      ctx.rect(left + 4, y, width - 8, ROW_H);
      ctx.clip();
      ctx.fillText(effect.label, left + 8, y + ROW_H / 2);
      ctx.restore();
    }
  }
}

function drawKeyframes(ctx: CanvasRenderingContext2D, scene: DrawScene): void {
  const { view } = scene;
  const byRow = new Map<number, DrawKeyframe[]>();
  for (const kf of scene.keyframes) {
    const x = timeToX(view, kf.timestampMs);
    if (x < -20 || x > view.widthPx + 20) continue;
    const list = byRow.get(kf.channelIndex);
    if (list) list.push(kf);
    else byRow.set(kf.channelIndex, [kf]);
  }
  for (const [row, list] of byRow) {
    list.sort((a, b) => a.timestampMs - b.timestampMs);
    const y = rowTop(view, row);
    const cy = y + ROW_H / 2;
    let cluster: DrawKeyframe[] = [];
    const flush = () => {
      if (cluster.length === 0) return;
      if (cluster.length === 1 || cluster.some((k) => k.selected)) {
        for (const kf of cluster) drawOneKeyframe(ctx, view, kf, cy);
      } else {
        const a = timeToX(view, cluster[0].timestampMs);
        const b = timeToX(view, cluster[cluster.length - 1].timestampMs);
        ctx.fillStyle = rgbToHex(cluster[Math.floor(cluster.length / 2)].color);
        ctx.globalAlpha = 0.9;
        roundRect(ctx, a, cy - 5, Math.max(8, b - a), 10, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (b - a > 28) {
          ctx.fillStyle = '#0e1116';
          ctx.font = MONO;
          ctx.textBaseline = 'middle';
          ctx.fillText(String(cluster.length), a + 4, cy);
        }
      }
      cluster = [];
    };
    for (const kf of list) {
      const x = timeToX(view, kf.timestampMs);
      if (cluster.length === 0) cluster.push(kf);
      else {
        const prev = timeToX(view, cluster[cluster.length - 1].timestampMs);
        if (x - prev < 5 && !kf.selected && !cluster.some((k) => k.selected)) cluster.push(kf);
        else {
          flush();
          cluster.push(kf);
        }
      }
    }
    flush();
  }
}

function drawOneKeyframe(
  ctx: CanvasRenderingContext2D,
  view: View,
  kf: DrawKeyframe,
  cy: number
): void {
  const x = timeToX(view, kf.timestampMs);
  if (kf.transitionMs > 0) {
    const x0 = timeToX(view, kf.timestampMs - kf.transitionMs);
    ctx.strokeStyle = rgbToHex(kf.color);
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, cy);
    ctx.lineTo(x, cy);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const fill = rgbToHex(kf.color);
  ctx.fillStyle = fill;
  diamond(ctx, x, cy, 7);
  ctx.fill();
  ctx.fillStyle = `rgba(0,0,0,${(1 - Math.max(0, Math.min(100, kf.brightness)) / 100) * 0.72})`;
  diamond(ctx, x, cy, 7);
  ctx.fill();
  ctx.lineWidth = kf.selected ? 2 : 1;
  ctx.strokeStyle = kf.selected ? '#e6a23c' : luminance(kf.color) > 0.8 ? '#1b212b' : 'rgba(255,255,255,0.35)';
  diamond(ctx, x, cy, 7);
  ctx.stroke();
  if (kf.selected && kf.transitionMs >= 0) {
    const hx = kf.transitionMs > 0 ? timeToX(view, kf.timestampMs - kf.transitionMs) : x - 14;
    ctx.fillStyle = '#e6a23c';
    ctx.fillRect(hx - 3, cy - 4, 6, 8);
  }
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
