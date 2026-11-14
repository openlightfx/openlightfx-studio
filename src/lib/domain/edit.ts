import type { Channel, ChannelGroup, EffectType, Keyframe, Rgb, SceneMarker, Track } from './types';
import { BLACK, rgb } from './types';

export const CHANNEL_SLUG = /^[a-z0-9_-]{1,64}$/;
export const TRACK_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const SPACING_CHOICES = [100, 200, 1000] as const;

export interface TemplateChannel {
  id: string;
  displayName: string;
  spatialHint: string;
}

export const TEMPLATES: Record<string, TemplateChannel[]> = {
  Ambient: [{ id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' }],
  Stereo: [
    { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
    { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
  ],
  'Stereo + Ambient': [
    { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
    { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
    { id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' },
  ],
  Surround: [
    { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
    { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
    { id: 'surround-left', displayName: 'Surround Left', spatialHint: 'SPATIAL_SURROUND_LEFT' },
    { id: 'surround-right', displayName: 'Surround Right', spatialHint: 'SPATIAL_SURROUND_RIGHT' },
  ],
  '6-Channel Theater': [
    { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
    { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
    { id: 'surround-left', displayName: 'Surround Left', spatialHint: 'SPATIAL_SURROUND_LEFT' },
    { id: 'surround-right', displayName: 'Surround Right', spatialHint: 'SPATIAL_SURROUND_RIGHT' },
    { id: 'center', displayName: 'Center', spatialHint: 'SPATIAL_CENTER' },
    { id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' },
  ],
  '8-Channel Home Theater': [
    { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
    { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
    { id: 'surround-left', displayName: 'Surround Left', spatialHint: 'SPATIAL_SURROUND_LEFT' },
    { id: 'surround-right', displayName: 'Surround Right', spatialHint: 'SPATIAL_SURROUND_RIGHT' },
    { id: 'center', displayName: 'Center', spatialHint: 'SPATIAL_CENTER' },
    { id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' },
    { id: 'back-left', displayName: 'Back Left', spatialHint: 'SPATIAL_SURROUND_LEFT' },
    { id: 'back-right', displayName: 'Back Right', spatialHint: 'SPATIAL_SURROUND_RIGHT' },
  ],
};

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function blackKeyframe(channelId: string, id = nextId('kf')): Keyframe {
  return {
    id,
    channelId,
    timestampMs: 0,
    colorMode: 'RGB',
    color: { ...BLACK },
    colorTemperature: 0,
    brightness: 0,
    transitionMs: 0,
    interpolation: 'STEP',
    powerOn: false,
  };
}

export function channelFromTemplate(spec: TemplateChannel): Channel {
  return {
    id: spec.id,
    displayName: spec.displayName,
    spatialHint: spec.spatialHint,
    defaultColor: { ...BLACK },
    defaultBrightness: 0,
    optional: false,
  };
}

export function newKeyframe(
  channelKeyframes: Keyframe[],
  timestampMs: number,
  id = nextId('kf')
): Keyframe {
  const previous = [...channelKeyframes]
    .filter((kf) => kf.timestampMs <= timestampMs)
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .at(-1);
  if (!previous) return { ...blackKeyframe('', id), timestampMs };
  return {
    ...previous,
    id,
    timestampMs,
    interpolation: 'STEP',
    transitionMs: 0,
  };
}

export function clampKeyframeTime(timestampMs: number, durationMs: number): number {
  return Math.min(durationMs, Math.max(0, timestampMs));
}

export function clampTransition(transitionMs: number, timestampMs: number): number {
  return Math.min(Math.max(0, transitionMs), timestampMs);
}

export function canInsert(
  channelKeyframes: Keyframe[],
  timestampMs: number,
  minSpacingMs: number
): boolean {
  return channelKeyframes.every((kf) => Math.abs(kf.timestampMs - timestampMs) >= minSpacingMs);
}

export function acceptSpacing(value: number): boolean {
  return (SPACING_CHOICES as readonly number[]).includes(value);
}

export interface DrawMark {
  id: string;
  channelId: string;
  timestampMs: number;
  color: Rgb;
}

export function visibleMarks(keyframes: Keyframe[], startMs: number, endMs: number): DrawMark[] {
  return keyframes
    .filter((kf) => kf.timestampMs >= startMs && kf.timestampMs <= endMs)
    .map((kf) => ({
      id: kf.id,
      channelId: kf.channelId,
      timestampMs: kf.timestampMs,
      color: { ...kf.color },
    }));
}

export interface SnapInput {
  timeMs: number;
  fromMs: number;
  pxPerMs: number;
  thresholdPx?: number;
  playheadMs?: number;
  otherTimes?: number[];
  obstacles?: number[];
  minSpacingMs?: number;
  durationMs: number;
  frameSnap?: boolean;
  fps?: number;
}

export function snapTime(input: SnapInput): { timeMs: number; snapped: boolean } {
  const thresholdMs = (input.thresholdPx ?? 8) / input.pxPerMs;
  const targets: number[] = [];
  const span = Math.max(thresholdMs, 1000);
  const start = Math.floor((input.timeMs - span) / 1000) * 1000;
  for (let t = start; t <= input.timeMs + span; t += 1000) targets.push(t);
  if (input.playheadMs !== undefined) targets.push(input.playheadMs);
  for (const time of input.otherTimes ?? []) targets.push(time);
  if (input.frameSnap && input.fps) {
    const frame = Math.round(1000 / input.fps);
    const nearest = Math.round(input.timeMs / frame) * frame;
    targets.push(nearest);
  }
  let best = input.timeMs;
  let bestDistance = thresholdMs;
  let snapped = false;
  for (const target of targets) {
    const distance = Math.abs(target - input.timeMs);
    if (distance <= bestDistance) {
      best = target;
      bestDistance = distance;
      snapped =
        distance <= thresholdMs && target !== input.timeMs ? true : snapped || distance === 0;
      if (distance <= thresholdMs) snapped = true;
    }
  }
  let timeMs = clampKeyframeTime(snapped ? best : input.timeMs, input.durationMs);
  const spacing = input.minSpacingMs ?? 0;
  if (spacing > 0) {
    for (const obstacle of input.obstacles ?? []) {
      if (Math.abs(timeMs - obstacle) < spacing) {
        timeMs = input.fromMs < obstacle ? obstacle - spacing : obstacle + spacing;
        snapped = true;
      }
    }
    timeMs = clampKeyframeTime(timeMs, input.durationMs);
  }
  return { timeMs, snapped };
}

export function zoomIn(pxPerMs: number): number {
  return pxPerMs * 1.25;
}

export function zoomOut(pxPerMs: number): number {
  return pxPerMs / 1.25;
}

export function zoomToFit(durationMs: number, laneWidthPx: number): number {
  if (durationMs <= 0) return 0;
  return laneWidthPx / durationMs;
}

export function applyZoomChord(
  pxPerMs: number,
  key: string,
  modifier: boolean,
  durationMs: number,
  laneWidthPx: number
): number {
  if (modifier && ['+', '-', '=', '0'].includes(key)) return pxPerMs;
  if (key === ']') return zoomIn(pxPerMs);
  if (key === '[') return zoomOut(pxPerMs);
  if (key === '\\') return zoomToFit(durationMs, laneWidthPx);
  return pxPerMs;
}

export function parseHex(current: Rgb, hex: string): { color: Rgb; error: string | null } {
  if (!/^[0-9A-Fa-f]{6}$/.test(hex))
    return { color: current, error: 'Enter a six-digit hex color' };
  return {
    color: rgb(
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ),
    error: null,
  };
}

export function clampRgbChannel(value: number): number {
  return Math.min(255, Math.max(0, value));
}

export function setKelvin(value: number): { ok: true; kelvin: number } | { ok: false } {
  if (value < 1000 || value > 10000 || value % 100 !== 0) return { ok: false };
  return { ok: true, kelvin: value };
}

export interface UndoHistory<T> {
  current: T;
  canUndo: boolean;
  canRedo: boolean;
  edit: (next: T) => void;
  undo: () => T;
  redo: () => T;
}

export function createHistory<T>(initial: T, limit = 200): UndoHistory<T> {
  const past: T[] = [];
  const future: T[] = [];
  const history: UndoHistory<T> = {
    current: initial,
    canUndo: false,
    canRedo: false,
    edit(next: T) {
      past.push(history.current);
      if (past.length > limit) past.shift();
      history.current = next;
      future.length = 0;
      history.canUndo = past.length > 0;
      history.canRedo = false;
    },
    undo() {
      const previous = past.pop();
      if (previous === undefined) return history.current;
      future.push(history.current);
      history.current = previous;
      history.canUndo = past.length > 0;
      history.canRedo = future.length > 0;
      return history.current;
    },
    redo() {
      const next = future.pop();
      if (next === undefined) return history.current;
      past.push(history.current);
      history.current = next;
      history.canUndo = past.length > 0;
      history.canRedo = future.length > 0;
      return history.current;
    },
  };
  return history;
}

export function userAddedKeyframes(keyframes: Keyframe[]): boolean {
  return keyframes.some((kf) => kf.timestampMs !== 0);
}

export function applyTemplate(
  templateName: string,
  existing: Keyframe[]
): { channels: Channel[]; keyframes: Keyframe[]; needsConfirm: boolean } {
  const spec = TEMPLATES[templateName];
  if (!spec) throw new Error(`Unknown template ${templateName}`);
  if (userAddedKeyframes(existing)) {
    return { channels: [], keyframes: existing, needsConfirm: true };
  }
  const channels = spec.map(channelFromTemplate);
  const keyframes = channels.map((channel) => blackKeyframe(channel.id));
  return { channels, keyframes, needsConfirm: false };
}

export function addChannel(
  track: Track,
  id: string,
  displayName: string
): { track: Track; error: string | null } {
  if (!CHANNEL_SLUG.test(id)) return { track, error: 'Channel id must match [a-z0-9_-]{1,64}' };
  if (track.channels.some((channel) => channel.id === id))
    return { track, error: 'Channel id already exists' };
  const channel = channelFromTemplate({ id, displayName, spatialHint: '' });
  return {
    track: {
      ...track,
      channels: [...track.channels, channel],
      keyframes: [...track.keyframes, blackKeyframe(id)],
    },
    error: null,
  };
}

export function applyMirror(
  keyframes: Keyframe[],
  group: ChannelGroup,
  edited: Keyframe
): Keyframe[] {
  if (group.mode !== 'mirror') return keyframes;
  return keyframes
    .map((kf) => {
      if (
        group.channelIds.includes(kf.channelId) &&
        kf.timestampMs === edited.timestampMs &&
        kf.channelId !== edited.channelId
      ) {
        return {
          ...kf,
          color: { ...edited.color },
          brightness: edited.brightness,
          colorMode: edited.colorMode,
          colorTemperature: edited.colorTemperature,
        };
      }
      return kf;
    })
    .concat(
      group.channelIds
        .filter((id) => id !== edited.channelId)
        .filter(
          (id) =>
            !keyframes.some((kf) => kf.channelId === id && kf.timestampMs === edited.timestampMs)
        )
        .map((id) => ({ ...edited, id: nextId('kf'), channelId: id }))
    );
}

export function applySpread(group: ChannelGroup, source: Keyframe): Keyframe[] {
  return group.channelIds.map((id, index) => ({
    ...source,
    id: index === 0 ? source.id : nextId('kf'),
    channelId: id,
    timestampMs: source.timestampMs + index * group.spreadMs,
  }));
}

export function markerInSidecarOnly(markers: SceneMarker[]): {
  protobufHasMarkers: false;
  sidecar: SceneMarker[];
} {
  return { protobufHasMarkers: false, sidecar: markers };
}

export function l1ExposesAutomaticGeneration(): boolean {
  return false;
}

export function effectCatalog(): readonly EffectType[] {
  return [
    'LIGHTNING',
    'FLAME',
    'FLASHBANG',
    'EXPLOSION',
    'PULSE',
    'STROBE',
    'SIREN',
    'AURORA',
    'CANDLE',
    'GUNFIRE',
    'NEON',
    'BREATHING',
    'SPARK',
  ];
}

export function emptyMetadata(title: string, durationMs: number): Track['metadata'] {
  return {
    title,
    description: '',
    author: '',
    tags: [],
    imdbId: '',
    movieTitle: title,
    year: 0,
    durationMs,
  };
}

export const CHANNEL_LAYOUTS: Record<string, TemplateChannel[]> = {
  LAYOUT_AMBIENT: [{ id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' }],
  LAYOUT_2_0: [
    { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
    { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
  ],
  LAYOUT_3_0: [
    { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
    { id: 'center', displayName: 'Center', spatialHint: 'SPATIAL_CENTER' },
    { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
  ],
  LAYOUT_5_0: [
    { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' },
    { id: 'center', displayName: 'Center', spatialHint: 'SPATIAL_CENTER' },
    { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' },
    { id: 'surround-left', displayName: 'Surround Left', spatialHint: 'SPATIAL_SURROUND_LEFT' },
    { id: 'surround-right', displayName: 'Surround Right', spatialHint: 'SPATIAL_SURROUND_RIGHT' },
  ],
};

export function patchKeyframes(
  track: Track,
  keyframeIds: readonly string[],
  patch: Partial<Keyframe>
): Track {
  const ids = new Set(keyframeIds);
  return {
    ...track,
    keyframes: track.keyframes.map((keyframe) =>
      ids.has(keyframe.id) ? { ...keyframe, ...patch } : keyframe
    ),
  };
}

export interface LayoutChangePlan {
  track: Track;
  removedChannels: Channel[];
  removedKeyframeCount: number;
  removedEffectCount: number;
}

/** Prepare a fixed-layout change without deciding whether destructive removal is confirmed. */
export function changeTrackLayout(track: Track, layout: string): LayoutChangePlan {
  const templates = CHANNEL_LAYOUTS[layout];
  if (!templates) throw new Error(`Unknown channel layout ${layout}`);
  const ids = new Set(templates.map((channel) => channel.id));
  const removedChannels = track.channels.filter((channel) => !ids.has(channel.id));
  const removedIds = new Set(removedChannels.map((channel) => channel.id));
  const channels = templates.map(
    (template) =>
      track.channels.find((channel) => channel.id === template.id) ?? channelFromTemplate(template)
  );
  return {
    track: {
      ...track,
      metadata: { ...track.metadata, channelLayout: layout },
      channels,
      keyframes: track.keyframes.filter((keyframe) => ids.has(keyframe.channelId)),
      effects: track.effects.filter((effect) => ids.has(effect.channelId)),
    },
    removedChannels,
    removedKeyframeCount: track.keyframes.filter((keyframe) => removedIds.has(keyframe.channelId))
      .length,
    removedEffectCount: track.effects.filter((effect) => removedIds.has(effect.channelId)).length,
  };
}

export function inferChannelLayout(channels: Channel[]): string {
  const positions = new Set(
    channels
      .map((channel) => {
        const hint = channel.spatialHint.toUpperCase().replace(/_/g, ' ');
        const text = `${channel.id} ${channel.displayName}`.toLowerCase().replace(/[_-]/g, ' ');
        if (hint.includes('SURROUND LEFT') || text.includes('surround left'))
          return 'surround-left';
        if (hint.includes('SURROUND RIGHT') || text.includes('surround right'))
          return 'surround-right';
        if (
          hint.includes('CENTER') ||
          hint.includes('BEHIND SCREEN') ||
          /\b(center|centre)\b/.test(text)
        )
          return 'center';
        if (hint.includes('LEFT') || /\bleft\b/.test(text)) return 'left';
        if (hint.includes('RIGHT') || /\bright\b/.test(text)) return 'right';
        if (hint.includes('AMBIENT') || /\bambient\b/.test(text)) return 'ambient';
        return '';
      })
      .filter(Boolean)
  );
  if (positions.has('surround-left') || positions.has('surround-right')) return 'LAYOUT_5_0';
  if (positions.has('center')) return 'LAYOUT_3_0';
  if ([...positions].some((position) => position !== 'ambient')) return 'LAYOUT_2_0';
  return 'LAYOUT_AMBIENT';
}

function canonicalSpatialHint(hint: string): string {
  if (hint === 'SPATIAL_BEHIND_SCREEN') return 'SPATIAL_CENTER';
  if (hint === 'SPATIAL_CEILING' || hint === 'SPATIAL_FLOOR') return 'SPATIAL_AMBIENT';
  return hint;
}

export function upgradeLegacyTrackLayout(track: Track): Track {
  if (track.metadata.channelLayout) return track;
  const layout = inferChannelLayout(track.channels);
  const templates = CHANNEL_LAYOUTS[layout] ?? CHANNEL_LAYOUTS.LAYOUT_AMBIENT;
  const available = [...track.channels];
  const ordered = templates.map((template) => {
    const index = available.findIndex(
      (channel) => canonicalSpatialHint(channel.spatialHint) === template.spatialHint
    );
    if (index >= 0) return available.splice(index, 1)[0];
    return channelFromTemplate(template);
  });
  return {
    ...track,
    metadata: { ...track.metadata, channelLayout: layout },
    channels: [...ordered, ...available],
  };
}

export function newTrackFromMovie(
  itemId: string,
  title: string,
  durationMs: number,
  layout = 'LAYOUT_2_0'
): Track & { itemId: string } {
  const channels = (CHANNEL_LAYOUTS[layout] ?? CHANNEL_LAYOUTS.LAYOUT_2_0).map(channelFromTemplate);
  return {
    itemId,
    version: 1,
    metadata: { ...emptyMetadata(title, durationMs), channelLayout: layout },
    channels,
    keyframes: [],
    effects: [],
    safety: null,
  };
}
