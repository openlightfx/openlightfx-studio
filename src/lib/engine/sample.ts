import type { EffectKeyframe, Keyframe, LightFXTrack } from '$lib/model/types';
import { bulbSupportsEffect, renderEffect, type BulbCaps } from '$lib/engine/effects';
import { stateAt, type LightState } from '$lib/engine/interpolate';

export interface DragOverride {
  kind: 'keyframe' | 'effect' | 'marker';
  id: string;
  channelId: string;
  timestampMs: number;
  durationMs: number;
  transitionMs: number;
}

export function withDrag(track: LightFXTrack, drag: readonly DragOverride[] | null): LightFXTrack {
  return applyOverrides(track, drag);
}

function applyOverrides(track: LightFXTrack, drag: readonly DragOverride[] | null): LightFXTrack {
  if (!drag || drag.length === 0) return track;
  const kf = new Map<string, DragOverride>();
  const fx = new Map<string, DragOverride>();
  for (const item of drag) {
    if (item.kind === 'keyframe') kf.set(item.id, item);
    else if (item.kind === 'effect') fx.set(item.id, item);
  }
  if (kf.size === 0 && fx.size === 0) return track;
  return {
    ...track,
    keyframes: track.keyframes.map((k) => {
      const o = kf.get(k.id);
      if (!o) return k;
      return {
        ...k,
        channelId: o.channelId,
        timestampMs: o.timestampMs,
        transitionMs: Math.min(o.transitionMs, o.timestampMs)
      };
    }),
    effectKeyframes: track.effectKeyframes.map((e) => {
      const o = fx.get(e.id);
      if (!o) return e;
      return {
        ...e,
        channelId: o.channelId,
        timestampMs: o.timestampMs,
        durationMs: o.durationMs
      };
    })
  };
}

export function keyframesForChannel(track: LightFXTrack, channelId: string): Keyframe[] {
  return track.keyframes
    .filter((k) => k.channelId === channelId)
    .sort((a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id));
}

export function effectsForChannel(track: LightFXTrack, channelId: string): EffectKeyframe[] {
  return track.effectKeyframes
    .filter((e) => e.channelId === channelId)
    .sort((a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id));
}

export function sampleChannel(
  track: LightFXTrack,
  channelId: string,
  timeMs: number,
  drag: readonly DragOverride[] | null = null
): LightState {
  const resolved = applyOverrides(track, drag);
  const channel = resolved.channels.find((c) => c.id === channelId) ?? {
    defaultColor: { r: 0, g: 0, b: 0 },
    defaultBrightness: 0
  };
  const base = stateAt(keyframesForChannel(resolved, channelId), timeMs, channel);
  const effects = effectsForChannel(resolved, channelId);
  let winner: EffectKeyframe | null = null;
  for (const effect of effects) {
    if (timeMs >= effect.timestampMs && timeMs < effect.timestampMs + effect.durationMs) {
      if (!winner || effect.timestampMs >= winner.timestampMs) winner = effect;
    }
  }
  if (!winner) return base;
  const rendered = renderEffect(winner, timeMs);
  if (!rendered) return base;
  return {
    ...base,
    r: rendered.color.r,
    g: rendered.color.g,
    b: rendered.color.b,
    brightness: Math.max(0, Math.min(100, Math.round(rendered.brightness))),
    colorMode: 'RGB',
    colorTemperature: 0,
    powerOn: rendered.brightness > 0 || base.powerOn
  };
}

export interface BulbFrame {
  bulbId: string;
  r: number;
  g: number;
  b: number;
  brightness: number;
  transitionMs: number;
}

export function audibleChannel(
  channelId: string,
  muted: ReadonlySet<string>,
  solo: ReadonlySet<string>
): boolean {
  if (solo.size > 0) return solo.has(channelId);
  return !muted.has(channelId);
}

export function framesForBulbs(
  track: LightFXTrack,
  timeMs: number,
  mapping: Readonly<Record<string, readonly string[]>>,
  bulbs: readonly { id: string; capabilities: BulbCaps }[],
  muted: ReadonlySet<string>,
  solo: ReadonlySet<string>,
  transitionMs: number,
  drag: readonly DragOverride[] | null = null
): BulbFrame[] {
  const byBulb = new Map<string, string[]>();
  for (const channel of track.channels) {
    if (!audibleChannel(channel.id, muted, solo)) continue;
    for (const bulbId of mapping[channel.id] ?? []) {
      const list = byBulb.get(bulbId);
      if (list) list.push(channel.id);
      else byBulb.set(bulbId, [channel.id]);
    }
  }

  const frames: BulbFrame[] = [];
  for (const bulb of bulbs) {
    const channels = byBulb.get(bulb.id);
    if (!channels || channels.length === 0) continue;
    let r = 0;
    let g = 0;
    let b = 0;
    let brightness = 0;
    let power = false;
    for (const channelId of channels) {
      let state = sampleChannel(track, channelId, timeMs, drag);
      const active = activeEffect(track, channelId, timeMs, drag);
      if (active && !bulbSupportsEffect(active, bulb.capabilities)) {
        state = {
          ...state,
          r: active.fallbackColor.r,
          g: active.fallbackColor.g,
          b: active.fallbackColor.b,
          brightness: active.fallbackBrightness,
          powerOn: active.fallbackBrightness > 0
        };
      }
      r += state.r;
      g += state.g;
      b += state.b;
      brightness += state.powerOn ? state.brightness : 0;
      power = power || state.powerOn;
    }
    const n = channels.length;
    frames.push({
      bulbId: bulb.id,
      r: Math.round(r / n),
      g: Math.round(g / n),
      b: Math.round(b / n),
      brightness: power ? Math.round(brightness / n) : 0,
      transitionMs
    });
  }
  return frames;
}

function activeEffect(
  track: LightFXTrack,
  channelId: string,
  timeMs: number,
  drag: readonly DragOverride[] | null
): EffectKeyframe | null {
  const resolved = applyOverrides(track, drag);
  let winner: EffectKeyframe | null = null;
  for (const effect of effectsForChannel(resolved, channelId)) {
    if (timeMs >= effect.timestampMs && timeMs < effect.timestampMs + effect.durationMs) {
      if (!winner || effect.timestampMs >= winner.timestampMs) winner = effect;
    }
  }
  return winner;
}

/** Fastest send interval that still respects the ~10 Hz cap and each bulb. */
export function previewIntervalMs(
  bulbs: readonly { id: string; capabilities: { minTransitionMs: number } }[],
  mapping: Readonly<Record<string, readonly string[]>>,
  baseMs = 100
): number {
  const used = new Set<string>();
  for (const ids of Object.values(mapping)) for (const id of ids) used.add(id);
  let interval = baseMs;
  for (const bulb of bulbs) {
    if (!used.has(bulb.id)) continue;
    interval = Math.max(interval, bulb.capabilities.minTransitionMs);
  }
  return interval;
}
