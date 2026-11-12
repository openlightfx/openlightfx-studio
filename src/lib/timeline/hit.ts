import type { EffectKeyframe, Keyframe, Marker } from '$lib/model/types';
import {
  DIAMOND_R,
  HANDLE_PX,
  RULER_H,
  ROW_H,
  rowIndexAt,
  rowTop,
  timeToX,
  type View
} from '$lib/timeline/geometry';

export interface Placed {
  kind: 'keyframe' | 'effect';
  id: string;
  channelId: string;
  channelIndex: number;
  timestampMs: number;
  durationMs: number;
  transitionMs: number;
}

export type Hit =
  | { type: 'handle'; kind: 'keyframe' | 'effect'; id: string; edge: 'start' | 'end' }
  | { type: 'item'; kind: 'keyframe' | 'effect'; id: string; channelId: string }
  | { type: 'marker'; id: string }
  | { type: 'playhead' }
  | { type: 'ruler'; timeMs: number }
  | { type: 'lane'; channelId: string; timeMs: number }
  | { type: 'empty' };

function near(a: number, b: number, slop: number): boolean {
  return Math.abs(a - b) <= slop;
}

export function hitTest(args: {
  x: number;
  y: number;
  view: View;
  items: readonly Placed[];
  markers: readonly Marker[];
  selected: ReadonlySet<string>;
  playheadMs: number;
  channels: readonly { id: string }[];
}): Hit {
  const { x, y, view, items, markers, selected, playheadMs, channels } = args;
  const timeMs = view.viewStartMs + x / Math.max(view.pixelsPerMs, 1e-9);

  if (y < RULER_H) {
    for (const marker of markers) {
      const mx = timeToX(view, marker.timestampMs);
      if (near(x, mx, 8) && y > 8) return { type: 'marker', id: marker.id };
    }
    if (near(x, timeToX(view, playheadMs), 7)) return { type: 'playhead' };
    return { type: 'ruler', timeMs: Math.max(0, timeMs) };
  }

  const row = rowIndexAt(view, y);
  if (row < 0 || row >= channels.length) {
    if (near(x, timeToX(view, playheadMs), 4)) return { type: 'playhead' };
    return { type: 'empty' };
  }
  const top = rowTop(view, row);
  const cy = top + ROW_H / 2;
  const channelId = channels[row].id;

  const inRow = items.filter((item) => item.channelIndex === row);
  for (const item of inRow) {
    if (!selected.has(item.id)) continue;
    if (item.kind === 'keyframe') {
      const startMs = item.timestampMs - item.transitionMs;
      const hx = item.transitionMs > 0 ? timeToX(view, startMs) : timeToX(view, item.timestampMs) - 14;
      if (near(x, hx, HANDLE_PX) && near(y, cy, HANDLE_PX + 2)) {
        return { type: 'handle', kind: 'keyframe', id: item.id, edge: 'start' };
      }
    } else {
      const x0 = timeToX(view, item.timestampMs);
      const x1 = timeToX(view, item.timestampMs + item.durationMs);
      if (near(y, cy, 12)) {
        if (near(x, x0, HANDLE_PX)) return { type: 'handle', kind: 'effect', id: item.id, edge: 'start' };
        if (near(x, x1, HANDLE_PX)) return { type: 'handle', kind: 'effect', id: item.id, edge: 'end' };
      }
    }
  }

  for (const item of inRow) {
    if (item.kind !== 'keyframe') continue;
    const ix = timeToX(view, item.timestampMs);
    if (Math.abs(x - ix) <= DIAMOND_R + 3 && Math.abs(y - cy) <= DIAMOND_R + 3) {
      return { type: 'item', kind: 'keyframe', id: item.id, channelId };
    }
  }
  for (const item of inRow) {
    if (item.kind !== 'effect') continue;
    const x0 = timeToX(view, item.timestampMs);
    const x1 = timeToX(view, item.timestampMs + item.durationMs);
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1, left + 6);
    if (x >= left && x <= right && y >= top + 6 && y <= top + ROW_H - 6) {
      return { type: 'item', kind: 'effect', id: item.id, channelId };
    }
  }

  if (near(x, timeToX(view, playheadMs), 4)) return { type: 'playhead' };
  return { type: 'lane', channelId, timeMs: Math.max(0, timeMs) };
}

export function rectHits(
  view: View,
  items: readonly Placed[],
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { keyframes: string[]; effects: string[] } {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const keyframes: string[] = [];
  const effects: string[] = [];
  for (const item of items) {
    const rowY = rowTop(view, item.channelIndex);
    const cy = rowY + ROW_H / 2;
    if (item.kind === 'keyframe') {
      const ix = timeToX(view, item.timestampMs);
      if (ix >= left && ix <= right && cy >= top && cy <= bottom) keyframes.push(item.id);
    } else {
      const a = timeToX(view, item.timestampMs);
      const b = timeToX(view, item.timestampMs + item.durationMs);
      const ix0 = Math.min(a, b);
      const ix1 = Math.max(a, b);
      const overlaps = ix1 >= left && ix0 <= right && rowY + ROW_H >= top && rowY <= bottom;
      if (overlaps) effects.push(item.id);
    }
  }
  return { keyframes, effects };
}

export function placeFromTrack(
  channels: readonly { id: string }[],
  keyframes: readonly Keyframe[],
  effects: readonly EffectKeyframe[],
  overrides: ReadonlyMap<string, { channelId: string; timestampMs: number; durationMs: number; transitionMs: number }> = new Map()
): Placed[] {
  const index = new Map(channels.map((c, i) => [c.id, i]));
  const out: Placed[] = [];
  for (const kf of keyframes) {
    const o = overrides.get(`keyframe:${kf.id}`);
    const channelId = o?.channelId ?? kf.channelId;
    const channelIndex = index.get(channelId);
    if (channelIndex === undefined) continue;
    out.push({
      kind: 'keyframe',
      id: kf.id,
      channelId,
      channelIndex,
      timestampMs: o?.timestampMs ?? kf.timestampMs,
      durationMs: 0,
      transitionMs: o?.transitionMs ?? kf.transitionMs
    });
  }
  for (const fx of effects) {
    const o = overrides.get(`effect:${fx.id}`);
    const channelId = o?.channelId ?? fx.channelId;
    const channelIndex = index.get(channelId);
    if (channelIndex === undefined) continue;
    out.push({
      kind: 'effect',
      id: fx.id,
      channelId,
      channelIndex,
      timestampMs: o?.timestampMs ?? fx.timestampMs,
      durationMs: o?.durationMs ?? fx.durationMs,
      transitionMs: 0
    });
  }
  return out;
}
