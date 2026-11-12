import type { Channel, EffectKeyframe, Keyframe, LightFXTrack, Marker, RGB } from '$lib/model/types';
import { cloneTrack, createId, plainClone } from '$lib/model/types';
import { clamp } from '$lib/engine/color';
import { contentEndMs } from '$lib/model/validate';

export interface Clipboard {
  keyframes: Keyframe[];
  effects: EffectKeyframe[];
  markers: Marker[];
  minMs: number;
}

function sortTrack(track: LightFXTrack): void {
  const order = new Map(track.channels.map((c, i) => [c.id, i]));
  const rank = (id: string) => order.get(id) ?? 9999;
  track.keyframes.sort(
    (a, b) =>
      a.timestampMs - b.timestampMs ||
      rank(a.channelId) - rank(b.channelId) ||
      a.id.localeCompare(b.id)
  );
  track.effectKeyframes.sort(
    (a, b) =>
      a.timestampMs - b.timestampMs ||
      rank(a.channelId) - rank(b.channelId) ||
      a.id.localeCompare(b.id)
  );
}

export function ensureDuration(track: LightFXTrack): void {
  const end = contentEndMs(track);
  if (track.metadata.durationMs < end) track.metadata.durationMs = end;
  if (track.metadata.durationMs <= 0) track.metadata.durationMs = 1000;
}

function clampKeyframe(kf: Keyframe): void {
  kf.timestampMs = Math.max(0, Math.round(kf.timestampMs));
  kf.brightness = clamp(Math.round(kf.brightness), 0, 100);
  kf.color = {
    r: clamp(Math.round(kf.color.r), 0, 255),
    g: clamp(Math.round(kf.color.g), 0, 255),
    b: clamp(Math.round(kf.color.b), 0, 255)
  };
  kf.colorTemperature = clamp(Math.round(kf.colorTemperature), 1000, 10000);
  kf.transitionMs = clamp(Math.round(kf.transitionMs), 0, kf.timestampMs);
}

function clampEffect(fx: EffectKeyframe): void {
  fx.timestampMs = Math.max(0, Math.round(fx.timestampMs));
  fx.durationMs = Math.max(50, Math.round(fx.durationMs));
  fx.intensity = clamp(Math.round(fx.intensity), 0, 100);
}

export interface ItemPlacement {
  kind: 'keyframe' | 'effect' | 'marker';
  id: string;
  channelId: string;
  timestampMs: number;
  durationMs: number;
  transitionMs: number;
}

/** Write absolute positions produced by a drag. Keeps the file parser-valid. */
export function placeItems(
  track: LightFXTrack,
  markers: Marker[],
  items: readonly ItemPlacement[]
): { track: LightFXTrack; markers: Marker[] } {
  const next = cloneTrack(track);
  const kf = new Map(items.filter((i) => i.kind === 'keyframe').map((i) => [i.id, i]));
  const fx = new Map(items.filter((i) => i.kind === 'effect').map((i) => [i.id, i]));
  const mk = new Map(items.filter((i) => i.kind === 'marker').map((i) => [i.id, i]));
  for (const k of next.keyframes) {
    const o = kf.get(k.id);
    if (!o) continue;
    k.channelId = o.channelId;
    k.timestampMs = o.timestampMs;
    k.transitionMs = o.transitionMs;
    clampKeyframe(k);
  }
  for (const e of next.effectKeyframes) {
    const o = fx.get(e.id);
    if (!o) continue;
    e.channelId = o.channelId;
    e.timestampMs = o.timestampMs;
    e.durationMs = o.durationMs;
    clampEffect(e);
  }
  const nextMarkers = markers.map((m) => {
    const o = mk.get(m.id);
    if (!o) return m;
    return { ...m, timestampMs: Math.max(0, Math.round(o.timestampMs)) };
  });
  sortTrack(next);
  ensureDuration(next);
  return { track: next, markers: nextMarkers.sort((a, b) => a.timestampMs - b.timestampMs) };
}

export function nudgeItems(
  track: LightFXTrack,
  markers: Marker[],
  keyframeIds: readonly string[],
  effectIds: readonly string[],
  markerIds: readonly string[],
  deltaMs: number
): { track: LightFXTrack; markers: Marker[] } {
  const items: ItemPlacement[] = [];
  const kfSet = new Set(keyframeIds);
  const fxSet = new Set(effectIds);
  const mkSet = new Set(markerIds);
  for (const k of track.keyframes) {
    if (!kfSet.has(k.id)) continue;
    items.push({
      kind: 'keyframe',
      id: k.id,
      channelId: k.channelId,
      timestampMs: k.timestampMs + deltaMs,
      durationMs: 0,
      transitionMs: k.transitionMs
    });
  }
  for (const e of track.effectKeyframes) {
    if (!fxSet.has(e.id)) continue;
    items.push({
      kind: 'effect',
      id: e.id,
      channelId: e.channelId,
      timestampMs: e.timestampMs + deltaMs,
      durationMs: e.durationMs,
      transitionMs: 0
    });
  }
  for (const m of markers) {
    if (!mkSet.has(m.id)) continue;
    items.push({
      kind: 'marker',
      id: m.id,
      channelId: '',
      timestampMs: m.timestampMs + deltaMs,
      durationMs: 0,
      transitionMs: 0
    });
  }
  return placeItems(track, markers, items);
}

export type KeyframePatch = Partial<
  Pick<
    Keyframe,
    | 'timestampMs'
    | 'colorMode'
    | 'color'
    | 'colorTemperature'
    | 'brightness'
    | 'transitionMs'
    | 'interpolation'
    | 'powerOn'
  >
>;

export function patchKeyframes(
  track: LightFXTrack,
  ids: readonly string[],
  patch: KeyframePatch
): LightFXTrack {
  const set = new Set(ids);
  const next = cloneTrack(track);
  for (const k of next.keyframes) {
    if (!set.has(k.id)) continue;
    if (patch.timestampMs !== undefined) k.timestampMs = patch.timestampMs;
    if (patch.colorMode !== undefined) k.colorMode = patch.colorMode;
    if (patch.color !== undefined) k.color = { ...patch.color };
    if (patch.colorTemperature !== undefined) k.colorTemperature = patch.colorTemperature;
    if (patch.brightness !== undefined) k.brightness = patch.brightness;
    if (patch.transitionMs !== undefined) k.transitionMs = patch.transitionMs;
    if (patch.interpolation !== undefined) k.interpolation = patch.interpolation;
    if (patch.powerOn !== undefined) k.powerOn = patch.powerOn;
    clampKeyframe(k);
  }
  sortTrack(next);
  ensureDuration(next);
  return next;
}

export type EffectPatch = Partial<
  Pick<
    EffectKeyframe,
    | 'timestampMs'
    | 'durationMs'
    | 'effectType'
    | 'intensity'
    | 'primaryColor'
    | 'secondaryColor'
    | 'effectParams'
    | 'requiredCapability'
    | 'fallbackColor'
    | 'fallbackBrightness'
  >
>;

export function patchEffects(
  track: LightFXTrack,
  ids: readonly string[],
  patch: EffectPatch
): LightFXTrack {
  const set = new Set(ids);
  const next = cloneTrack(track);
  for (const e of next.effectKeyframes) {
    if (!set.has(e.id)) continue;
    if (patch.timestampMs !== undefined) e.timestampMs = patch.timestampMs;
    if (patch.durationMs !== undefined) e.durationMs = patch.durationMs;
    if (patch.effectType !== undefined) e.effectType = patch.effectType;
    if (patch.intensity !== undefined) e.intensity = patch.intensity;
    if (patch.primaryColor !== undefined) e.primaryColor = { ...patch.primaryColor };
    if (patch.secondaryColor !== undefined) e.secondaryColor = { ...patch.secondaryColor };
    if (patch.effectParams !== undefined) e.effectParams = { ...patch.effectParams };
    if (patch.requiredCapability !== undefined) e.requiredCapability = patch.requiredCapability;
    if (patch.fallbackColor !== undefined) e.fallbackColor = { ...patch.fallbackColor };
    if (patch.fallbackBrightness !== undefined) e.fallbackBrightness = patch.fallbackBrightness;
    clampEffect(e);
  }
  sortTrack(next);
  ensureDuration(next);
  return next;
}

export function removeItems(
  track: LightFXTrack,
  markers: Marker[],
  keyframeIds: readonly string[],
  effectIds: readonly string[],
  markerIds: readonly string[]
): { track: LightFXTrack; markers: Marker[] } {
  const kf = new Set(keyframeIds);
  const fx = new Set(effectIds);
  const mk = new Set(markerIds);
  const next = cloneTrack(track);
  next.keyframes = next.keyframes.filter((k) => !kf.has(k.id));
  next.effectKeyframes = next.effectKeyframes.filter((e) => !fx.has(e.id));
  return { track: next, markers: markers.filter((m) => !mk.has(m.id)) };
}

export function addKeyframe(track: LightFXTrack, kf: Keyframe): LightFXTrack {
  const next = cloneTrack(track);
  const copy = plainClone(kf);
  clampKeyframe(copy);
  next.keyframes.push(copy);
  sortTrack(next);
  ensureDuration(next);
  return next;
}

export function addEffect(track: LightFXTrack, fx: EffectKeyframe): LightFXTrack {
  const next = cloneTrack(track);
  const copy = plainClone(fx);
  clampEffect(copy);
  next.effectKeyframes.push(copy);
  sortTrack(next);
  ensureDuration(next);
  return next;
}

export function addChannel(track: LightFXTrack, channel: Channel): LightFXTrack {
  const next = cloneTrack(track);
  if (next.channels.some((c) => c.id === channel.id)) {
    channel = { ...channel, id: `${channel.id}-${createId('ch').slice(-4)}` };
  }
  next.channels.push(plainClone(channel));
  return next;
}

export function patchChannel(
  track: LightFXTrack,
  id: string,
  patch: Partial<Omit<Channel, 'id'>> & { id?: string }
): LightFXTrack {
  const next = cloneTrack(track);
  const ch = next.channels.find((c) => c.id === id);
  if (!ch) return next;
  const nextId = patch.id?.trim();
  if (nextId && nextId !== id && next.channels.some((c) => c.id === nextId)) return next;
  if (patch.displayName !== undefined) ch.displayName = patch.displayName;
  if (patch.description !== undefined) ch.description = patch.description;
  if (patch.defaultColor !== undefined) ch.defaultColor = { ...patch.defaultColor };
  if (patch.defaultBrightness !== undefined) {
    ch.defaultBrightness = clamp(Math.round(patch.defaultBrightness), 0, 100);
  }
  if (patch.spatialHint !== undefined) ch.spatialHint = patch.spatialHint;
  if (patch.optional !== undefined) ch.optional = patch.optional;
  if (nextId && nextId !== id) {
    ch.id = nextId;
    for (const k of next.keyframes) if (k.channelId === id) k.channelId = nextId;
    for (const e of next.effectKeyframes) if (e.channelId === id) e.channelId = nextId;
  }
  return next;
}

export function removeChannel(
  track: LightFXTrack,
  markers: Marker[],
  channelId: string
): { track: LightFXTrack; markers: Marker[] } {
  if (track.channels.length <= 1) return { track, markers };
  const next = cloneTrack(track);
  next.channels = next.channels.filter((c) => c.id !== channelId);
  next.keyframes = next.keyframes.filter((k) => k.channelId !== channelId);
  next.effectKeyframes = next.effectKeyframes.filter((e) => e.channelId !== channelId);
  return { track: next, markers };
}

export function copySelection(
  track: LightFXTrack,
  markers: Marker[],
  keyframeIds: readonly string[],
  effectIds: readonly string[],
  markerIds: readonly string[]
): Clipboard | null {
  const kf = track.keyframes.filter((k) => keyframeIds.includes(k.id)).map((k) => plainClone(k));
  const fx = track.effectKeyframes
    .filter((e) => effectIds.includes(e.id))
    .map((e) => plainClone(e));
  const mk = markers.filter((m) => markerIds.includes(m.id)).map((m) => plainClone(m));
  if (kf.length + fx.length + mk.length === 0) return null;
  const times = [
    ...kf.map((k) => k.timestampMs),
    ...fx.map((e) => e.timestampMs),
    ...mk.map((m) => m.timestampMs)
  ];
  return { keyframes: kf, effects: fx, markers: mk, minMs: Math.min(...times) };
}

export function pasteClipboard(
  track: LightFXTrack,
  markers: Marker[],
  clip: Clipboard,
  playheadMs: number,
  targetChannelId: string | null
): { track: LightFXTrack; markers: Marker[]; keyframeIds: string[]; effectIds: string[]; markerIds: string[] } {
  const delta = playheadMs - clip.minMs;
  const singleChannel = new Set([
    ...clip.keyframes.map((k) => k.channelId),
    ...clip.effects.map((e) => e.channelId)
  ]);
  const retarget =
    targetChannelId &&
    singleChannel.size === 1 &&
    track.channels.some((c) => c.id === targetChannelId) &&
    !singleChannel.has(targetChannelId);

  const next = cloneTrack(track);
  const keyframeIds: string[] = [];
  const effectIds: string[] = [];
  const markerIds: string[] = [];
  let shift = delta;
  const earliest = clip.minMs + delta;
  if (earliest < 0) shift += -earliest;

  for (const k of clip.keyframes) {
    const id = createId('kf');
    const copy = plainClone(k);
    copy.id = id;
    copy.timestampMs = k.timestampMs + shift;
    if (retarget && targetChannelId) copy.channelId = targetChannelId;
    if (!next.channels.some((c) => c.id === copy.channelId)) continue;
    clampKeyframe(copy);
    next.keyframes.push(copy);
    keyframeIds.push(id);
  }
  for (const e of clip.effects) {
    const id = createId('fx');
    const copy = plainClone(e);
    copy.id = id;
    copy.timestampMs = e.timestampMs + shift;
    if (retarget && targetChannelId) copy.channelId = targetChannelId;
    if (!next.channels.some((c) => c.id === copy.channelId)) continue;
    clampEffect(copy);
    next.effectKeyframes.push(copy);
    effectIds.push(id);
  }
  const nextMarkers = markers.slice();
  for (const m of clip.markers) {
    const id = createId('mk');
    nextMarkers.push({ id, timestampMs: Math.max(0, Math.round(m.timestampMs + shift)), label: m.label });
    markerIds.push(id);
  }
  sortTrack(next);
  ensureDuration(next);
  nextMarkers.sort((a, b) => a.timestampMs - b.timestampMs);
  return { track: next, markers: nextMarkers, keyframeIds, effectIds, markerIds };
}

export function slugId(name: string, fallback: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || fallback;
}

export function recolor(color: RGB): RGB {
  return { r: color.r, g: color.g, b: color.b };
}
