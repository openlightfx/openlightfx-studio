import protobuf from 'protobufjs';
import protoText from '../../../proto/lightfx.proto?raw';
import { cloneTrack } from '$lib/model/types';
import type {
  BoundaryBehavior,
  Channel,
  ColorMode,
  CreditsBehavior,
  EffectKeyframe,
  EffectType,
  IntensityRating,
  Interpolation,
  Keyframe,
  LightFXTrack,
  PreshowState,
  RGB,
  SafetyInfo,
  TrackMetadata
} from '$lib/model/types';

/**
 * Encode and decode .lightfx bytes from proto/lightfx.proto.
 * Wire format is protobuf binary, which is what
 * OpenLightFX.Emby TrackParser reads with Google.Protobuf.
 * Enum numeric values are the proto declarations; names round-trip.
 */

const LightFXTrackType: protobuf.Type = protobuf.parse(protoText).root.lookupType(
  'openlightfx.LightFXTrack'
);

const TO_OBJECT: protobuf.IConversionOptions = {
  longs: Number,
  enums: String,
  defaults: true,
  arrays: true,
  objects: true,
  oneofs: true
};

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (value && typeof value === 'object' && 'toNumber' in value) {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function bool(value: unknown): boolean {
  return value === true;
}

function enumName<T extends string>(value: unknown, names: readonly T[], fallback: T): T {
  if (typeof value === 'string' && (names as readonly string[]).includes(value)) return value as T;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < names.length) {
    return names[value];
  }
  return fallback;
}

const BOUNDARY = ['BOUNDARY_UNSPECIFIED', 'LEAVE', 'OFF', 'ON'] as const;
const PRESHOW = ['PRESHOW_UNSPECIFIED', 'PRESHOW_DIM', 'PRESHOW_OFF', 'PRESHOW_WARM'] as const;
const CREDITS = [
  'CREDITS_UNSPECIFIED',
  'CREDITS_CONTINUE',
  'CREDITS_DIM_UP',
  'CREDITS_RAISE',
  'CREDITS_OFF'
] as const;
const INTENSITY = ['INTENSITY_UNSPECIFIED', 'SUBTLE', 'MODERATE', 'INTENSE', 'EXTREME'] as const;
const COLOR_MODE = ['COLOR_MODE_UNSPECIFIED', 'RGB', 'COLOR_TEMPERATURE'] as const;
const INTERP = ['INTERPOLATION_UNSPECIFIED', 'STEP', 'LINEAR'] as const;
const EFFECT = [
  'EFFECT_UNSPECIFIED',
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
  'SPARK'
] as const;

function rgbOf(value: unknown): RGB {
  const o = (value ?? {}) as Record<string, unknown>;
  return {
    r: Math.min(255, Math.max(0, Math.round(num(o.r)))),
    g: Math.min(255, Math.max(0, Math.round(num(o.g)))),
    b: Math.min(255, Math.max(0, Math.round(num(o.b))))
  };
}

function paramsOf(value: unknown): Record<string, number> {
  const outer = (value ?? {}) as Record<string, unknown>;
  const raw = (outer.params ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of Object.keys(raw).sort()) {
    const n = num(raw[key], Number.NaN);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

function metadataFrom(value: unknown): TrackMetadata {
  const o = (value ?? {}) as Record<string, unknown>;
  const movie = (o.movieReference ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [];
  return {
    title: str(o.title),
    description: str(o.description),
    movieReference: {
      imdbId: str(movie.imdbId),
      title: str(movie.title),
      year: num(movie.year),
      runtimeMinutes: num(movie.runtimeMinutes)
    },
    author: str(o.author),
    tags,
    durationMs: num(o.durationMs),
    startBehavior: enumName<BoundaryBehavior>(o.startBehavior, BOUNDARY, 'BOUNDARY_UNSPECIFIED'),
    endBehavior: enumName<BoundaryBehavior>(o.endBehavior, BOUNDARY, 'BOUNDARY_UNSPECIFIED'),
    preshowDurationMs: num(o.preshowDurationMs),
    preshowState: enumName<PreshowState>(o.preshowState, PRESHOW, 'PRESHOW_UNSPECIFIED'),
    creditsStartMs: num(o.creditsStartMs),
    creditsBehavior: enumName<CreditsBehavior>(o.creditsBehavior, CREDITS, 'CREDITS_UNSPECIFIED'),
    trackVersion: str(o.trackVersion)
  };
}

function channelFrom(value: unknown): Channel {
  const o = (value ?? {}) as Record<string, unknown>;
  return {
    id: str(o.id),
    displayName: str(o.displayName),
    description: str(o.description),
    defaultColor: rgbOf(o.defaultColor),
    defaultBrightness: num(o.defaultBrightness),
    spatialHint: str(o.spatialHint),
    optional: bool(o.optional)
  };
}

function keyframeFrom(value: unknown): Keyframe {
  const o = (value ?? {}) as Record<string, unknown>;
  return {
    id: str(o.id),
    channelId: str(o.channelId),
    timestampMs: num(o.timestampMs),
    colorMode: enumName<ColorMode>(o.colorMode, COLOR_MODE, 'COLOR_MODE_UNSPECIFIED'),
    color: rgbOf(o.color),
    colorTemperature: num(o.colorTemperature),
    brightness: num(o.brightness),
    transitionMs: num(o.transitionMs),
    interpolation: enumName<Interpolation>(o.interpolation, INTERP, 'INTERPOLATION_UNSPECIFIED'),
    powerOn: bool(o.powerOn)
  };
}

function effectFrom(value: unknown): EffectKeyframe {
  const o = (value ?? {}) as Record<string, unknown>;
  return {
    id: str(o.id),
    channelId: str(o.channelId),
    timestampMs: num(o.timestampMs),
    durationMs: num(o.durationMs),
    effectType: enumName<EffectType>(o.effectType, EFFECT, 'EFFECT_UNSPECIFIED'),
    intensity: num(o.intensity),
    primaryColor: rgbOf(o.primaryColor),
    secondaryColor: rgbOf(o.secondaryColor),
    effectParams: paramsOf(o.effectParams),
    requiredCapability: str(o.requiredCapability),
    fallbackColor: rgbOf(o.fallbackColor),
    fallbackBrightness: num(o.fallbackBrightness)
  };
}

function safetyFrom(value: unknown): SafetyInfo {
  const o = (value ?? {}) as Record<string, unknown>;
  return {
    containsFlashing: bool(o.containsFlashing),
    containsStrobing: bool(o.containsStrobing),
    maxFlashFrequencyHz: num(o.maxFlashFrequencyHz),
    maxBrightnessDelta: num(o.maxBrightnessDelta),
    warningText: str(o.warningText),
    intensityRating: enumName<IntensityRating>(o.intensityRating, INTENSITY, 'INTENSITY_UNSPECIFIED')
  };
}

function trackFromObject(value: Record<string, unknown>): LightFXTrack {
  const channels = Array.isArray(value.channels) ? value.channels.map(channelFrom) : [];
  const keyframes = Array.isArray(value.keyframes) ? value.keyframes.map(keyframeFrom) : [];
  const effectKeyframes = Array.isArray(value.effectKeyframes)
    ? value.effectKeyframes.map(effectFrom)
    : [];
  return {
    version: num(value.version),
    metadata: metadataFrom(value.metadata),
    channels,
    keyframes,
    effectKeyframes,
    safetyInfo: safetyFrom(value.safetyInfo)
  };
}

function rgbToProto(c: RGB): { r: number; g: number; b: number } {
  return {
    r: Math.round(c.r) || 0,
    g: Math.round(c.g) || 0,
    b: Math.round(c.b) || 0
  };
}

/** protobufjs verify() accepts enum numbers, not names. Indexes match the proto values. */
function enumNumber(names: readonly string[], value: string): number {
  const index = names.indexOf(value);
  return index < 0 ? 0 : index;
}

function sortedParams(params: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(params).sort()) out[key] = params[key];
  return out;
}

/** Plain object in protobufjs camelCase JSON mapping. */
export function trackToProto(track: LightFXTrack): Record<string, unknown> {
  return {
    version: track.version,
    metadata: {
      title: track.metadata.title,
      description: track.metadata.description,
      movieReference: {
        imdbId: track.metadata.movieReference.imdbId,
        title: track.metadata.movieReference.title,
        year: track.metadata.movieReference.year,
        runtimeMinutes: track.metadata.movieReference.runtimeMinutes
      },
      author: track.metadata.author,
      tags: track.metadata.tags.slice(),
      durationMs: track.metadata.durationMs,
      startBehavior: enumNumber(BOUNDARY, track.metadata.startBehavior),
      endBehavior: enumNumber(BOUNDARY, track.metadata.endBehavior),
      preshowDurationMs: track.metadata.preshowDurationMs,
      preshowState: enumNumber(PRESHOW, track.metadata.preshowState),
      creditsStartMs: track.metadata.creditsStartMs,
      creditsBehavior: enumNumber(CREDITS, track.metadata.creditsBehavior),
      trackVersion: track.metadata.trackVersion
    },
    channels: track.channels.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      description: c.description,
      defaultColor: rgbToProto(c.defaultColor),
      defaultBrightness: c.defaultBrightness,
      spatialHint: c.spatialHint,
      optional: c.optional
    })),
    keyframes: track.keyframes.map((k) => ({
      id: k.id,
      channelId: k.channelId,
      timestampMs: k.timestampMs,
      colorMode: enumNumber(COLOR_MODE, k.colorMode),
      color: rgbToProto(k.color),
      colorTemperature: k.colorTemperature,
      brightness: k.brightness,
      transitionMs: k.transitionMs,
      interpolation: enumNumber(INTERP, k.interpolation),
      powerOn: k.powerOn
    })),
    effectKeyframes: track.effectKeyframes.map((e) => ({
      id: e.id,
      channelId: e.channelId,
      timestampMs: e.timestampMs,
      durationMs: e.durationMs,
      effectType: enumNumber(EFFECT, e.effectType),
      intensity: e.intensity,
      primaryColor: rgbToProto(e.primaryColor),
      secondaryColor: rgbToProto(e.secondaryColor),
      effectParams: { params: sortedParams(e.effectParams) },
      requiredCapability: e.requiredCapability,
      fallbackColor: rgbToProto(e.fallbackColor),
      fallbackBrightness: e.fallbackBrightness
    })),
    safetyInfo: {
      containsFlashing: track.safetyInfo.containsFlashing,
      containsStrobing: track.safetyInfo.containsStrobing,
      maxFlashFrequencyHz: track.safetyInfo.maxFlashFrequencyHz,
      maxBrightnessDelta: track.safetyInfo.maxBrightnessDelta,
      warningText: track.safetyInfo.warningText,
      intensityRating: enumNumber(INTENSITY, track.safetyInfo.intensityRating)
    }
  };
}

/** Global timestamp order keeps each channel's subsequence sorted for TrackParser. */
export function orderTrack(track: LightFXTrack): LightFXTrack {
  const next = cloneTrack(track);
  const rank = new Map(next.channels.map((c, i) => [c.id, i]));
  const byChannel = (a: string, b: string) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
  next.keyframes.sort(
    (a, b) => a.timestampMs - b.timestampMs || byChannel(a.channelId, b.channelId) || a.id.localeCompare(b.id)
  );
  next.effectKeyframes.sort(
    (a, b) => a.timestampMs - b.timestampMs || byChannel(a.channelId, b.channelId) || a.id.localeCompare(b.id)
  );
  return next;
}

export function encodeTrack(track: LightFXTrack): Uint8Array {
  const payload = trackToProto(orderTrack(track));
  const err = LightFXTrackType.verify(payload);
  if (err) throw new Error(`Cannot encode .lightfx: ${err}`);
  return LightFXTrackType.encode(LightFXTrackType.create(payload)).finish();
}

export function decodeTrack(bytes: Uint8Array): LightFXTrack {
  const decoded = LightFXTrackType.decode(bytes);
  const obj = LightFXTrackType.toObject(decoded, TO_OBJECT) as Record<string, unknown>;
  return trackFromObject(obj);
}

export function fileNameFor(track: LightFXTrack): string {
  const base = track.metadata.title.trim() || 'track';
  const safe = base.replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-');
  return `${safe || 'track'}.lightfx`;
}
