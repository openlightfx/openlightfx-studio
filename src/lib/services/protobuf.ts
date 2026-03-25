// ============================================================
// Protobuf Service — encode/decode .lightfx files
// ============================================================

import * as protobuf from 'protobufjs';
import protoContent from '../../proto/lightfx.proto?raw';
import type {
  LightFXTrack,
  TrackMetadata,
  MovieReference,
  Channel,
  Keyframe,
  EffectKeyframe,
  EffectParams,
  SafetyInfo,
  RGBColor,
  BoundaryBehavior,
  PreshowState,
  CreditsBehavior,
  IntensityRating,
  ColorMode,
  InterpolationMode,
  EffectType,
} from '$lib/types/index.js';

// ---- Proto schema loading ----

let root: protobuf.Root | null = null;

function getRoot(): protobuf.Root {
  if (!root) {
    root = protobuf.parse(protoContent).root;
  }
  return root;
}

function getMessageType(name: string): protobuf.Type {
  return getRoot().lookupType(`openlightfx.${name}`);
}

// ---- Enum mappings: TypeScript string <-> proto integer ----

const BOUNDARY_BEHAVIOR_MAP: Record<BoundaryBehavior, number> = {
  BOUNDARY_UNSPECIFIED: 0,
  LEAVE: 1,
  OFF: 2,
  ON: 3,
};

const BOUNDARY_BEHAVIOR_REVERSE = invertMap(BOUNDARY_BEHAVIOR_MAP) as Record<
  number,
  BoundaryBehavior
>;

const PRESHOW_STATE_MAP: Record<PreshowState, number> = {
  PRESHOW_UNSPECIFIED: 0,
  PRESHOW_DIM: 1,
  PRESHOW_OFF: 2,
  PRESHOW_WARM: 3,
};

const PRESHOW_STATE_REVERSE = invertMap(PRESHOW_STATE_MAP) as Record<
  number,
  PreshowState
>;

const CREDITS_BEHAVIOR_MAP: Record<CreditsBehavior, number> = {
  CREDITS_UNSPECIFIED: 0,
  CREDITS_CONTINUE: 1,
  CREDITS_DIM_UP: 2,
  CREDITS_RAISE: 3,
  CREDITS_OFF: 4,
};

const CREDITS_BEHAVIOR_REVERSE = invertMap(CREDITS_BEHAVIOR_MAP) as Record<
  number,
  CreditsBehavior
>;

const INTENSITY_RATING_MAP: Record<IntensityRating, number> = {
  INTENSITY_UNSPECIFIED: 0,
  SUBTLE: 1,
  MODERATE: 2,
  INTENSE: 3,
  EXTREME: 4,
};

const INTENSITY_RATING_REVERSE = invertMap(INTENSITY_RATING_MAP) as Record<
  number,
  IntensityRating
>;

const COLOR_MODE_MAP: Record<ColorMode, number> = {
  RGB: 1,
  COLOR_TEMPERATURE: 2,
};

const COLOR_MODE_REVERSE: Record<number, ColorMode> = {
  0: 'RGB',
  1: 'RGB',
  2: 'COLOR_TEMPERATURE',
};

const INTERPOLATION_MODE_MAP: Record<InterpolationMode, number> = {
  STEP: 1,
  LINEAR: 2,
};

const INTERPOLATION_MODE_REVERSE: Record<number, InterpolationMode> = {
  0: 'STEP',
  1: 'STEP',
  2: 'LINEAR',
};

const EFFECT_TYPE_MAP: Record<EffectType, number> = {
  EFFECT_UNSPECIFIED: 0,
  LIGHTNING: 1,
  FLAME: 2,
  FLASHBANG: 3,
  EXPLOSION: 4,
  PULSE: 5,
  STROBE: 6,
  SIREN: 7,
  AURORA: 8,
  CANDLE: 9,
  GUNFIRE: 10,
  NEON: 11,
  BREATHING: 12,
  SPARK: 13,
};

const EFFECT_TYPE_REVERSE = invertMap(EFFECT_TYPE_MAP) as Record<
  number,
  EffectType
>;

function invertMap<K extends string | number, V extends string | number>(
  map: Record<K, V>,
): Record<V, K> {
  const result: Record<string | number, K> = {};
  for (const [k, v] of Object.entries(map)) {
    result[v as string | number] = k as K;
  }
  return result as Record<V, K>;
}

// ---- Encode ----

/**
 * Serialize a LightFXTrack to binary protobuf (Uint8Array).
 */
export function encodeLightFXTrack(track: LightFXTrack): Uint8Array {
  const TrackType = getMessageType('LightFXTrack');
  const protoObj = trackToProto(track);
  const errMsg = TrackType.verify(protoObj);
  if (errMsg) {
    throw new Error(`Protobuf verification failed: ${errMsg}`);
  }
  const message = TrackType.create(protoObj);
  return TrackType.encode(message).finish();
}

/**
 * Deserialize binary protobuf to a LightFXTrack.
 */
export function decodeLightFXTrack(data: Uint8Array): LightFXTrack {
  const TrackType = getMessageType('LightFXTrack');
  const message = TrackType.decode(data);
  const obj = TrackType.toObject(message, {
    longs: Number,
    enums: Number,
    defaults: true,
  });
  return protoToTrack(obj);
}

// ---- TypeScript → Proto object ----

function trackToProto(track: LightFXTrack): Record<string, unknown> {
  return {
    version: track.version,
    metadata: metadataToProto(track.metadata),
    channels: (track.channels ?? []).map(channelToProto),
    keyframes: (track.keyframes ?? []).map(keyframeToProto),
    effectKeyframes: (track.effectKeyframes ?? []).map(effectKeyframeToProto),
    safetyInfo: safetyInfoToProto(track.safetyInfo),
  };
}

function metadataToProto(
  m: TrackMetadata,
): Record<string, unknown> {
  return {
    title: m.title,
    description: m.description,
    movieReference: movieReferenceToProto(m.movieReference),
    author: m.author,
    tags: m.tags,
    durationMs: Math.round(m.durationMs),
    startBehavior: BOUNDARY_BEHAVIOR_MAP[m.startBehavior] ?? 0,
    endBehavior: BOUNDARY_BEHAVIOR_MAP[m.endBehavior] ?? 0,
    preshowDurationMs: Math.round(m.preshowDurationMs),
    preshowState: PRESHOW_STATE_MAP[m.preshowState] ?? 0,
    creditsStartMs: Math.round(m.creditsStartMs),
    creditsBehavior: CREDITS_BEHAVIOR_MAP[m.creditsBehavior] ?? 0,
    trackVersion: m.trackVersion,
  };
}

function movieReferenceToProto(
  mr: MovieReference,
): Record<string, unknown> {
  return {
    imdbId: mr.imdbId,
    title: mr.title,
    year: mr.year,
    runtimeMinutes: mr.runtimeMinutes,
  };
}

function channelToProto(ch: Channel): Record<string, unknown> {
  return {
    id: ch.id,
    displayName: ch.displayName,
    description: ch.description,
    defaultColor: rgbToProto(ch.defaultColor),
    defaultBrightness: ch.defaultBrightness,
    spatialHint: ch.spatialHint,
    optional: ch.optional,
  };
}

function keyframeToProto(kf: Keyframe): Record<string, unknown> {
  return {
    id: kf.id,
    channelId: kf.channelId,
    timestampMs: Math.round(kf.timestampMs),
    colorMode: COLOR_MODE_MAP[kf.colorMode] ?? 0,
    color: rgbToProto(kf.color),
    colorTemperature: Math.round(kf.colorTemperature),
    brightness: Math.round(kf.brightness),
    transitionMs: Math.round(kf.transitionMs),
    interpolation: INTERPOLATION_MODE_MAP[kf.interpolation] ?? 0,
    powerOn: kf.powerOn,
  };
}

function effectKeyframeToProto(ek: EffectKeyframe): Record<string, unknown> {
  return {
    id: ek.id,
    channelId: ek.channelId,
    timestampMs: Math.round(ek.timestampMs),
    durationMs: Math.round(ek.durationMs),
    effectType: EFFECT_TYPE_MAP[ek.effectType] ?? 0,
    intensity: ek.intensity,
    primaryColor: rgbToProto(ek.primaryColor),
    secondaryColor: rgbToProto(ek.secondaryColor),
    effectParams: effectParamsToProto(ek.effectParams),
    requiredCapability: ek.requiredCapability ?? '',
    fallbackColor: rgbToProto(ek.fallbackColor),
    fallbackBrightness: ek.fallbackBrightness,
  };
}

function effectParamsToProto(ep: EffectParams | null | undefined): Record<string, unknown> | null {
  if (!ep || !ep.params) return null;
  return { params: { ...ep.params } };
}

function safetyInfoToProto(si: SafetyInfo): Record<string, unknown> {
  return {
    containsFlashing: si.containsFlashing,
    containsStrobing: si.containsStrobing,
    maxFlashFrequencyHz: si.maxFlashFrequencyHz,
    maxBrightnessDelta: si.maxBrightnessDelta,
    warningText: si.warningText,
    intensityRating: INTENSITY_RATING_MAP[si.intensityRating] ?? 0,
  };
}

function rgbToProto(color: RGBColor | null | undefined): Record<string, number> | null {
  if (!color) return null;
  return { r: color.r, g: color.g, b: color.b };
}

// ---- Proto object → TypeScript ----

/* eslint-disable @typescript-eslint/no-explicit-any */

function protoToTrack(obj: any): LightFXTrack {
  return {
    version: obj.version ?? 1,
    metadata: protoToMetadata(obj.metadata ?? {}),
    channels: (obj.channels ?? []).map(protoToChannel),
    keyframes: (obj.keyframes ?? []).map(protoToKeyframe),
    effectKeyframes: (obj.effectKeyframes ?? []).map(protoToEffectKeyframe),
    safetyInfo: protoToSafetyInfo(obj.safetyInfo ?? {}),
  };
}

function protoToMetadata(obj: any): TrackMetadata {
  return {
    title: obj.title ?? '',
    description: obj.description ?? '',
    movieReference: protoToMovieReference(obj.movieReference ?? {}),
    author: obj.author ?? '',
    tags: obj.tags ?? [],
    durationMs: Number(obj.durationMs ?? 0),
    startBehavior: BOUNDARY_BEHAVIOR_REVERSE[obj.startBehavior] ?? 'BOUNDARY_UNSPECIFIED',
    endBehavior: BOUNDARY_BEHAVIOR_REVERSE[obj.endBehavior] ?? 'BOUNDARY_UNSPECIFIED',
    preshowDurationMs: obj.preshowDurationMs ?? 0,
    preshowState: PRESHOW_STATE_REVERSE[obj.preshowState] ?? 'PRESHOW_UNSPECIFIED',
    creditsStartMs: Number(obj.creditsStartMs ?? 0),
    creditsBehavior: CREDITS_BEHAVIOR_REVERSE[obj.creditsBehavior] ?? 'CREDITS_UNSPECIFIED',
    trackVersion: obj.trackVersion ?? '',
  };
}

function protoToMovieReference(obj: any): MovieReference {
  return {
    imdbId: obj.imdbId ?? '',
    title: obj.title ?? '',
    year: obj.year ?? 0,
    runtimeMinutes: obj.runtimeMinutes ?? 0,
  };
}

function protoToChannel(obj: any): Channel {
  return {
    id: obj.id ?? '',
    displayName: obj.displayName ?? '',
    description: obj.description ?? '',
    defaultColor: protoToRgb(obj.defaultColor),
    defaultBrightness: obj.defaultBrightness ?? 0,
    spatialHint: obj.spatialHint ?? 'SPATIAL_UNSPECIFIED',
    optional: obj.optional ?? false,
  };
}

function protoToKeyframe(obj: any): Keyframe {
  return {
    id: obj.id ?? '',
    channelId: obj.channelId ?? '',
    timestampMs: Number(obj.timestampMs ?? 0),
    colorMode: COLOR_MODE_REVERSE[obj.colorMode] ?? 'RGB',
    color: protoToRgb(obj.color),
    colorTemperature: obj.colorTemperature ?? 0,
    brightness: obj.brightness ?? 0,
    transitionMs: obj.transitionMs ?? 0,
    interpolation: INTERPOLATION_MODE_REVERSE[obj.interpolation] ?? 'STEP',
    powerOn: obj.powerOn ?? false,
  };
}

function protoToEffectKeyframe(obj: any): EffectKeyframe {
  return {
    id: obj.id ?? '',
    channelId: obj.channelId ?? '',
    timestampMs: Number(obj.timestampMs ?? 0),
    durationMs: Number(obj.durationMs ?? 0),
    effectType: EFFECT_TYPE_REVERSE[obj.effectType] ?? 'EFFECT_UNSPECIFIED',
    intensity: obj.intensity ?? 0,
    primaryColor: protoToRgb(obj.primaryColor),
    secondaryColor: protoToRgb(obj.secondaryColor),
    effectParams: protoToEffectParams(obj.effectParams),
    requiredCapability: (obj.requiredCapability as any) || 'CAPABILITY_ANY',
    fallbackColor: protoToRgb(obj.fallbackColor),
    fallbackBrightness: obj.fallbackBrightness ?? 0,
  };
}

function protoToEffectParams(obj: any): EffectParams {
  if (!obj || !obj.params) {
    return { params: {} };
  }
  const params: Record<string, number> = {};
  for (const [key, value] of Object.entries(obj.params)) {
    params[key] = Number(value);
  }
  return { params };
}

function protoToSafetyInfo(obj: any): SafetyInfo {
  return {
    containsFlashing: obj.containsFlashing ?? false,
    containsStrobing: obj.containsStrobing ?? false,
    maxFlashFrequencyHz: obj.maxFlashFrequencyHz ?? 0,
    maxBrightnessDelta: obj.maxBrightnessDelta ?? 0,
    warningText: obj.warningText ?? '',
    intensityRating: INTENSITY_RATING_REVERSE[obj.intensityRating] ?? 'INTENSITY_UNSPECIFIED',
  };
}

function protoToRgb(obj: any): RGBColor {
  if (!obj) return { r: 0, g: 0, b: 0 };
  return {
    r: obj.r ?? 0,
    g: obj.g ?? 0,
    b: obj.b ?? 0,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
