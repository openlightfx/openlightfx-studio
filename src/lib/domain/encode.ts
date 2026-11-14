import protobuf from 'protobufjs';
import type { EffectKeyframe, Keyframe, SafetyInfo, Track } from './types';
import { LIGHTFX_PROTO } from './lightfx-proto';
import { validateTrack } from './validate';

function trackType(): protobuf.Type {
  const root = protobuf.parse(LIGHTFX_PROTO).root;
  const type = root.lookupType('openlightfx.LightFXTrack');
  if (!type) throw new Error('openlightfx.LightFXTrack is missing from proto/lightfx.proto');
  return type;
}

function interpolationName(value: Keyframe['interpolation']): string {
  if (value === 'STEP') return 'STEP';
  if (value === 'LINEAR') return 'LINEAR';
  return 'INTERPOLATION_UNSPECIFIED';
}

function colorModeName(value: Keyframe['colorMode']): string {
  return value === 'COLOR_TEMPERATURE' ? 'COLOR_TEMPERATURE' : 'RGB';
}

/** Sort each channel by time and clamp transitions so TrackParser accepts the file. */
export function normalizeForEncode(track: Track): Track {
  const order = new Map(track.channels.map((channel, index) => [channel.id, index]));
  const duration = track.metadata?.durationMs ?? 0;
  const keyframes = track.keyframes.map((kf) => {
    const timestampMs = duration > 0 ? Math.min(kf.timestampMs, duration) : kf.timestampMs;
    const time = Math.max(0, timestampMs);
    return { ...kf, timestampMs: time, transitionMs: Math.min(kf.transitionMs, time) };
  });
  keyframes.sort((a, b) => {
    const channel = (order.get(a.channelId) ?? 999) - (order.get(b.channelId) ?? 999);
    if (channel !== 0) return channel;
    return a.timestampMs - b.timestampMs;
  });
  return { ...track, version: track.version || 1, keyframes };
}

function keyframeMessage(kf: Keyframe): Record<string, unknown> {
  return {
    id: kf.id,
    channelId: kf.channelId,
    timestampMs: kf.timestampMs,
    colorMode: colorModeName(kf.colorMode),
    color: kf.color,
    colorTemperature: kf.colorTemperature,
    brightness: kf.brightness,
    transitionMs: kf.transitionMs,
    interpolation: interpolationName(kf.interpolation),
    powerOn: kf.powerOn,
  };
}

function effectMessage(effect: EffectKeyframe): Record<string, unknown> {
  return {
    id: effect.id,
    channelId: effect.channelId,
    timestampMs: effect.timestampMs,
    durationMs: effect.durationMs,
    effectType: effect.effectType,
    intensity: effect.intensity,
    primaryColor: effect.primaryColor ?? undefined,
    secondaryColor: effect.secondaryColor ?? undefined,
    effectParams: { params: effect.params },
    requiredCapability: effect.requiredCapability,
    fallbackColor: effect.fallbackColor ?? undefined,
    fallbackBrightness: effect.fallbackBrightness,
  };
}

function safetyMessage(safety: SafetyInfo): Record<string, unknown> {
  return {
    containsFlashing: safety.containsFlashing,
    containsStrobing: safety.containsStrobing,
    maxFlashFrequencyHz: safety.maxFlashFrequencyHz,
    maxBrightnessDelta: safety.maxBrightnessDelta,
    warningText: safety.warningText,
    intensityRating: safety.intensityRating,
  };
}

export function trackToPayload(track: Track): Record<string, unknown> {
  const normalized = normalizeForEncode(track);
  return {
    version: normalized.version,
    metadata: {
      title: normalized.metadata.title,
      description: normalized.metadata.description,
      author: normalized.metadata.author,
      tags: normalized.metadata.tags,
      durationMs: normalized.metadata.durationMs,
      movieReference: {
        imdbId: normalized.metadata.imdbId,
        title: normalized.metadata.movieTitle,
        year: normalized.metadata.year,
      },
      channelLayout: normalized.metadata.channelLayout || undefined,
      ...(normalized.metadata.startBehavior &&
      normalized.metadata.startBehavior !== 'BOUNDARY_UNSPECIFIED'
        ? { startBehavior: normalized.metadata.startBehavior }
        : {}),
      ...(normalized.metadata.endBehavior &&
      normalized.metadata.endBehavior !== 'BOUNDARY_UNSPECIFIED'
        ? { endBehavior: normalized.metadata.endBehavior }
        : {}),
      ...(normalized.metadata.preshowDurationMs
        ? { preshowDurationMs: normalized.metadata.preshowDurationMs }
        : {}),
      ...(normalized.metadata.preshowState &&
      normalized.metadata.preshowState !== 'PRESHOW_UNSPECIFIED'
        ? { preshowState: normalized.metadata.preshowState }
        : {}),
      ...(normalized.metadata.creditsStartMs
        ? { creditsStartMs: normalized.metadata.creditsStartMs }
        : {}),
      ...(normalized.metadata.creditsBehavior &&
      normalized.metadata.creditsBehavior !== 'CREDITS_UNSPECIFIED'
        ? { creditsBehavior: normalized.metadata.creditsBehavior }
        : {}),
    },
    channels: normalized.channels.map((channel) => ({
      id: channel.id,
      displayName: channel.displayName,
      defaultColor: channel.defaultColor,
      defaultBrightness: channel.defaultBrightness,
      spatialHint: channel.spatialHint,
      optional: channel.optional,
    })),
    keyframes: normalized.keyframes.map(keyframeMessage),
    effectKeyframes: normalized.effects.map(effectMessage),
    safetyInfo: normalized.safety ? safetyMessage(normalized.safety) : undefined,
  };
}

export function encodeTrack(track: Track): Uint8Array {
  const type = trackType();
  const payload = trackToPayload(track);
  const message = type.fromObject(payload);
  return type.encode(message).finish();
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value ?? 0);
}

function asRgb(value: unknown): { r: number; g: number; b: number } {
  const color = (value ?? {}) as { r?: number; g?: number; b?: number };
  return { r: asNumber(color.r), g: asNumber(color.g), b: asNumber(color.b) };
}

function asInterpolation(value: unknown): Keyframe['interpolation'] {
  const name = String(value ?? '');
  if (name === 'STEP' || name === '1') return 'STEP';
  if (name === 'LINEAR' || name === '2') return 'LINEAR';
  return 'UNSPECIFIED';
}

function asColorMode(value: unknown): Keyframe['colorMode'] {
  const name = String(value ?? '');
  if (name === 'COLOR_TEMPERATURE' || name === '2') return 'COLOR_TEMPERATURE';
  return 'RGB';
}

export function decodeTrack(bytes: Uint8Array): Track {
  const type = trackType();
  const object = type.toObject(type.decode(bytes), {
    enums: String,
    longs: Number,
    defaults: true,
  }) as Record<string, unknown>;
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  const movie = (metadata.movieReference ?? {}) as Record<string, unknown>;
  const keyframes = ((object.keyframes as Record<string, unknown>[]) ?? []).map((kf) => ({
    id: String(kf.id ?? ''),
    channelId: String(kf.channelId ?? ''),
    timestampMs: asNumber(kf.timestampMs),
    colorMode: asColorMode(kf.colorMode),
    color: asRgb(kf.color),
    colorTemperature: asNumber(kf.colorTemperature),
    brightness: asNumber(kf.brightness),
    transitionMs: asNumber(kf.transitionMs),
    interpolation: asInterpolation(kf.interpolation),
    powerOn: Boolean(kf.powerOn),
  }));
  const effects = ((object.effectKeyframes as Record<string, unknown>[]) ?? []).map((effect) => {
    const params = ((effect.effectParams as { params?: Record<string, number> } | undefined)
      ?.params ?? {}) as Record<string, number>;
    return {
      id: String(effect.id ?? ''),
      channelId: String(effect.channelId ?? ''),
      timestampMs: asNumber(effect.timestampMs),
      durationMs: asNumber(effect.durationMs),
      effectType: String(effect.effectType ?? 'EFFECT_UNSPECIFIED') as EffectKeyframe['effectType'],
      intensity: asNumber(effect.intensity),
      primaryColor: effect.primaryColor ? asRgb(effect.primaryColor) : null,
      secondaryColor: effect.secondaryColor ? asRgb(effect.secondaryColor) : null,
      params,
      requiredCapability: String(effect.requiredCapability ?? ''),
      fallbackColor: effect.fallbackColor ? asRgb(effect.fallbackColor) : null,
      fallbackBrightness: asNumber(effect.fallbackBrightness),
    };
  });
  const safetyRaw = object.safetyInfo as Record<string, unknown> | undefined;
  const safety =
    safetyRaw &&
    (safetyRaw.warningText ||
      safetyRaw.intensityRating ||
      safetyRaw.containsFlashing ||
      safetyRaw.containsStrobing)
      ? {
          containsFlashing: Boolean(safetyRaw.containsFlashing),
          containsStrobing: Boolean(safetyRaw.containsStrobing),
          maxFlashFrequencyHz: asNumber(safetyRaw.maxFlashFrequencyHz),
          maxBrightnessDelta: asNumber(safetyRaw.maxBrightnessDelta),
          warningText: String(safetyRaw.warningText ?? ''),
          intensityRating: String(
            safetyRaw.intensityRating ?? 'INTENSITY_UNSPECIFIED'
          ) as SafetyInfo['intensityRating'],
        }
      : null;
  return {
    version: asNumber(object.version),
    metadata: {
      title: String(metadata.title ?? ''),
      description: String(metadata.description ?? ''),
      author: String(metadata.author ?? ''),
      tags: ((metadata.tags as string[]) ?? []).map(String),
      imdbId: String(movie.imdbId ?? ''),
      movieTitle: String(movie.title ?? ''),
      year: asNumber(movie.year),
      durationMs: asNumber(metadata.durationMs),
      channelLayout: String(metadata.channelLayout ?? ''),
      startBehavior: String(
        metadata.startBehavior ?? 'BOUNDARY_UNSPECIFIED'
      ) as Track['metadata']['startBehavior'],
      endBehavior: String(
        metadata.endBehavior ?? 'BOUNDARY_UNSPECIFIED'
      ) as Track['metadata']['endBehavior'],
      preshowDurationMs: asNumber(metadata.preshowDurationMs),
      preshowState: String(
        metadata.preshowState ?? 'PRESHOW_UNSPECIFIED'
      ) as Track['metadata']['preshowState'],
      creditsStartMs: asNumber(metadata.creditsStartMs),
      creditsBehavior: String(
        metadata.creditsBehavior ?? 'CREDITS_UNSPECIFIED'
      ) as Track['metadata']['creditsBehavior'],
    },
    channels: ((object.channels as Record<string, unknown>[]) ?? []).map((channel) => ({
      id: String(channel.id ?? ''),
      displayName: String(channel.displayName ?? ''),
      spatialHint: String(channel.spatialHint ?? ''),
      defaultColor: asRgb(channel.defaultColor),
      defaultBrightness: asNumber(channel.defaultBrightness),
      optional: Boolean(channel.optional),
    })),
    keyframes,
    effects,
    safety,
  };
}

export function roundTrip(track: Track): { bytes: Uint8Array; track: Track; errors: string[] } {
  const bytes = encodeTrack(track);
  const decoded = decodeTrack(bytes);
  return { bytes, track: decoded, errors: validateTrack(decoded) };
}

export const MAX_TRACK_BYTES = 32 * 1024 * 1024;

export function importTrack(
  current: Track,
  bytes: Uint8Array,
  itemId: string
): { track: Track; itemId: string; errors: string[] } {
  let decoded: Track;
  try {
    decoded = decodeTrack(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unreadable';
    return { track: current, itemId, errors: [`V-001: ${message}`] };
  }
  const errors = validateTrack(decoded);
  if (errors.length > 0) return { track: current, itemId, errors };
  return { track: decoded, itemId, errors: [] };
}
