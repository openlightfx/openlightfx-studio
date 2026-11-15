import type { Keyframe, Track } from './types';

export interface ClipboardKeyframe {
  readonly sourceChannelId: string;
  readonly offsetMs: number;
  readonly value: Omit<Keyframe, 'id' | 'channelId' | 'timestampMs'>;
}

export interface KeyframeClipboard {
  readonly kind: 'openlightfx-keyframes';
  readonly version: 1;
  readonly sourceChannels: readonly { readonly id: string; readonly position: string }[];
  readonly anchorMs: number;
  readonly keyframes: readonly ClipboardKeyframe[];
}

export type PasteRejection =
  | 'invalid-payload'
  | 'invalid-anchor'
  | 'missing-active-channel'
  | 'missing-position'
  | 'out-of-bounds'
  | 'fade-before-start'
  | 'spacing-collision';

export type PastePlan =
  | { readonly accepted: true; readonly keyframes: readonly Omit<Keyframe, 'id'>[] }
  | { readonly accepted: false; readonly reason: PasteRejection };

const POSITION = /^(SPATIAL_[A-Z_]+)$/;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  }
  return value;
}

/** Snapshot selected authored keys into a detached, immutable positional payload. */
export function copyKeyframes(track: Track, ids: readonly string[]): KeyframeClipboard | null {
  const selected = track.keyframes.filter((keyframe) => ids.includes(keyframe.id));
  if (!selected.length || selected.length !== new Set(ids).size || ids.length !== selected.length)
    return null;
  const channels = new Map(track.channels.map((channel) => [channel.id, channel]));
  if (selected.some((keyframe) => !channels.has(keyframe.channelId))) return null;
  const anchorMs = Math.min(...selected.map((keyframe) => keyframe.timestampMs));
  const payload: KeyframeClipboard = {
    kind: 'openlightfx-keyframes',
    version: 1,
    sourceChannels: [...new Set(selected.map((keyframe) => keyframe.channelId))].map((id) => ({
      id,
      position: channels.get(id)!.spatialHint,
    })),
    anchorMs,
    keyframes: selected.map((keyframe) => {
      const { id: _id, channelId, timestampMs, ...value } = keyframe;
      return { sourceChannelId: channelId, offsetMs: timestampMs - anchorMs, value: clone(value) };
    }),
  };
  return deepFreeze(payload);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function payloadValid(payload: KeyframeClipboard): boolean {
  if (
    !payload ||
    payload.kind !== 'openlightfx-keyframes' ||
    payload.version !== 1 ||
    !finite(payload.anchorMs) ||
    !Number.isInteger(payload.anchorMs) ||
    !Array.isArray(payload.sourceChannels) ||
    !Array.isArray(payload.keyframes) ||
    !payload.keyframes.length
  )
    return false;
  const positions = new Set<string>();
  if (
    payload.sourceChannels.some(
      (channel) => !channel || typeof channel.id !== 'string' || !channel.id
    )
  )
    return false;
  const channelIds = new Set(payload.sourceChannels.map((channel) => channel.id));
  if (channelIds.size !== payload.sourceChannels.length || !channelIds.size) return false;
  for (const channel of payload.sourceChannels) {
    if (
      !channel ||
      typeof channel.id !== 'string' ||
      typeof channel.position !== 'string' ||
      !POSITION.test(channel.position) ||
      positions.has(channel.position)
    )
      return false;
    positions.add(channel.position);
  }
  for (const frame of payload.keyframes) {
    if (
      !frame ||
      !channelIds.has(frame.sourceChannelId) ||
      !finite(frame.offsetMs) ||
      !Number.isInteger(frame.offsetMs) ||
      frame.offsetMs < 0 ||
      !frame.value
    )
      return false;
    const k = frame.value;
    if (
      !finite(k.transitionMs) ||
      !finite(k.brightness) ||
      !finite(k.colorTemperature) ||
      !k.color ||
      !finite(k.color.r) ||
      !finite(k.color.g) ||
      !finite(k.color.b) ||
      typeof k.powerOn !== 'boolean' ||
      !['RGB', 'COLOR_TEMPERATURE'].includes(k.colorMode) ||
      !['STEP', 'LINEAR', 'UNSPECIFIED'].includes(k.interpolation) ||
      k.transitionMs < 0 ||
      k.brightness < 0 ||
      k.brightness > 100 ||
      k.color.r < 0 ||
      k.color.r > 255 ||
      !Number.isInteger(k.color.r) ||
      k.color.g < 0 ||
      k.color.g > 255 ||
      !Number.isInteger(k.color.g) ||
      k.color.b < 0 ||
      k.color.b > 255 ||
      !Number.isInteger(k.color.b) ||
      (k.colorMode === 'COLOR_TEMPERATURE' &&
        (k.colorTemperature < 1000 || k.colorTemperature > 10000))
    )
      return false;
  }
  return true;
}

/** Validate all placement constraints without allocating IDs or mutating the document. */
export function planKeyframePaste(
  track: Track,
  payload: KeyframeClipboard,
  requestedAnchorMs: number,
  activeChannelId: string | null,
  spacingMs: number
): PastePlan {
  if (!payloadValid(payload)) return { accepted: false, reason: 'invalid-payload' };
  if (!finite(requestedAnchorMs) || !Number.isInteger(requestedAnchorMs) || requestedAnchorMs < 0)
    return { accepted: false, reason: 'invalid-anchor' };
  const sourceLanes = new Set(payload.keyframes.map((frame) => frame.sourceChannelId));
  const lanes = new Map<string, string>();
  if (sourceLanes.size === 1) {
    if (!activeChannelId || !track.channels.some((channel) => channel.id === activeChannelId))
      return { accepted: false, reason: 'missing-active-channel' };
    lanes.set([...sourceLanes][0], activeChannelId);
  } else {
    for (const source of payload.sourceChannels) {
      if (!sourceLanes.has(source.id)) continue;
      const destination = track.channels.find((channel) => channel.spatialHint === source.position);
      if (!destination) return { accepted: false, reason: 'missing-position' };
      lanes.set(source.id, destination.id);
    }
  }
  const proposed: Omit<Keyframe, 'id'>[] = [];
  for (const item of payload.keyframes) {
    const timestampMs = requestedAnchorMs + item.offsetMs;
    if (!Number.isSafeInteger(timestampMs) || timestampMs > track.metadata.durationMs)
      return { accepted: false, reason: 'out-of-bounds' };
    if (item.value.transitionMs > timestampMs)
      return { accepted: false, reason: 'fade-before-start' };
    const channelId = lanes.get(item.sourceChannelId);
    if (!channelId) return { accepted: false, reason: 'missing-position' };
    const threshold = Math.max(1, Number.isFinite(spacingMs) ? spacingMs : 0);
    if (
      track.keyframes.some(
        (frame) =>
          frame.channelId === channelId && Math.abs(frame.timestampMs - timestampMs) < threshold
      ) ||
      proposed.some(
        (frame) =>
          frame.channelId === channelId && Math.abs(frame.timestampMs - timestampMs) < threshold
      )
    )
      return { accepted: false, reason: 'spacing-collision' };
    proposed.push({ ...clone(item.value), channelId, timestampMs });
  }
  return { accepted: true, keyframes: proposed };
}

/** Allocate only after a successful pure plan; allocator reservations are committed as one accepted action. */
export function materializeKeyframePaste(
  plan: PastePlan,
  allocateId: (prefix: string) => string
): Keyframe[] | null {
  if (!plan.accepted) return null;
  return plan.keyframes.map((keyframe) => ({ ...clone(keyframe), id: allocateId('kf') }));
}
