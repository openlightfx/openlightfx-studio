import protobuf from 'protobufjs';
import type { LightFXTrack } from '$lib/types/index.js';

let root: protobuf.Root | null = null;

async function getRoot(): Promise<protobuf.Root> {
  if (root) return root;
  // Try Node.js fs first (for tests), then browser fetch
  try {
    const fs = await import('fs');
    const path = await import('path');
    const protoPath = path.resolve('src/proto/lightfx.proto');
    const protoText = fs.readFileSync(protoPath, 'utf-8');
    root = protobuf.parse(protoText).root;
  } catch {
    // Browser: try raw import or fetch
    const protoText = await fetch('/lightfx.proto').then((r) => r.text());
    root = protobuf.parse(protoText).root;
  }
  return root;
}

// Maps for enum conversion between our string types and proto numeric values
const BOUNDARY_MAP: Record<string, number> = { 'BOUNDARY_UNSPECIFIED': 0, 'LEAVE': 1, 'OFF': 2, 'ON': 3 };
const PRESHOW_MAP: Record<string, number> = { 'PRESHOW_UNSPECIFIED': 0, 'PRESHOW_DIM': 1, 'PRESHOW_OFF': 2, 'PRESHOW_WARM': 3 };
const CREDITS_MAP: Record<string, number> = { 'CREDITS_UNSPECIFIED': 0, 'CREDITS_CONTINUE': 1, 'CREDITS_DIM_UP': 2, 'CREDITS_RAISE': 3, 'CREDITS_OFF': 4 };
const INTENSITY_MAP: Record<string, number> = { 'INTENSITY_UNSPECIFIED': 0, 'SUBTLE': 1, 'MODERATE': 2, 'INTENSE': 3, 'EXTREME': 4 };
const COLOR_MODE_MAP: Record<string, number> = { 'COLOR_MODE_UNSPECIFIED': 0, 'RGB': 1, 'COLOR_TEMPERATURE': 2 };
const INTERPOLATION_MAP: Record<string, number> = { 'INTERPOLATION_UNSPECIFIED': 0, 'STEP': 1, 'LINEAR': 2 };
const EFFECT_TYPE_MAP: Record<string, number> = {
  'EFFECT_UNSPECIFIED': 0, 'LIGHTNING': 1, 'FLAME': 2, 'FLASHBANG': 3, 'EXPLOSION': 4,
  'PULSE': 5, 'STROBE': 6, 'SIREN': 7, 'AURORA': 8, 'CANDLE': 9, 'GUNFIRE': 10,
  'NEON': 11, 'BREATHING': 12, 'SPARK': 13,
};

function reverseMap(map: Record<string, number>): Record<number, string> {
  const result: Record<number, string> = {};
  for (const [k, v] of Object.entries(map)) result[v] = k;
  return result;
}
const REV_BOUNDARY = reverseMap(BOUNDARY_MAP);
const REV_PRESHOW = reverseMap(PRESHOW_MAP);
const REV_CREDITS = reverseMap(CREDITS_MAP);
const REV_INTENSITY = reverseMap(INTENSITY_MAP);
const REV_COLOR_MODE = reverseMap(COLOR_MODE_MAP);
const REV_INTERPOLATION = reverseMap(INTERPOLATION_MAP);
const REV_EFFECT_TYPE = reverseMap(EFFECT_TYPE_MAP);

export async function encodeLightFXTrack(track: LightFXTrack): Promise<Uint8Array> {
  const r = await getRoot();
  const LightFXTrackMsg = r.lookupType('openlightfx.LightFXTrack');

  const payload = {
    version: track.version,
    metadata: {
      title: track.metadata.title,
      description: track.metadata.description,
      movieReference: track.metadata.movieReference ? {
        imdbId: track.metadata.movieReference.imdbId,
        title: track.metadata.movieReference.title,
        year: track.metadata.movieReference.year,
        runtimeMinutes: track.metadata.movieReference.runtimeMinutes,
      } : undefined,
      author: track.metadata.author,
      tags: track.metadata.tags,
      durationMs: track.metadata.durationMs,
      startBehavior: BOUNDARY_MAP[track.metadata.startBehavior] ?? 0,
      endBehavior: BOUNDARY_MAP[track.metadata.endBehavior] ?? 0,
      preshowDurationMs: track.metadata.preshowDurationMs,
      preshowState: PRESHOW_MAP[track.metadata.preshowState] ?? 0,
      creditsStartMs: track.metadata.creditsStartMs,
      creditsBehavior: CREDITS_MAP[track.metadata.creditsBehavior] ?? 0,
      trackVersion: track.metadata.trackVersion,
    },
    channels: track.channels.map((ch) => ({
      id: ch.id,
      displayName: ch.displayName,
      description: ch.description,
      defaultColor: ch.defaultColor,
      defaultBrightness: ch.defaultBrightness,
      spatialHint: ch.spatialHint,
      optional: ch.optional,
    })),
    keyframes: track.keyframes.map((kf) => ({
      id: kf.id,
      channelId: kf.channelId,
      timestampMs: kf.timestampMs,
      colorMode: COLOR_MODE_MAP[kf.colorMode] ?? 0,
      color: kf.color,
      colorTemperature: kf.colorTemperature,
      brightness: kf.brightness,
      transitionMs: kf.transitionMs,
      interpolation: INTERPOLATION_MAP[kf.interpolation] ?? 0,
      powerOn: kf.powerOn,
    })),
    effectKeyframes: track.effectKeyframes.map((ef) => ({
      id: ef.id,
      channelId: ef.channelId,
      timestampMs: ef.timestampMs,
      durationMs: ef.durationMs,
      effectType: EFFECT_TYPE_MAP[ef.effectType] ?? 0,
      intensity: ef.intensity,
      primaryColor: ef.primaryColor,
      secondaryColor: ef.secondaryColor,
      effectParams: ef.effectParams.params ? { params: ef.effectParams.params } : undefined,
      requiredCapability: ef.requiredCapability,
      fallbackColor: ef.fallbackColor,
      fallbackBrightness: ef.fallbackBrightness,
    })),
    safetyInfo: {
      containsFlashing: track.safetyInfo.containsFlashing,
      containsStrobing: track.safetyInfo.containsStrobing,
      maxFlashFrequencyHz: track.safetyInfo.maxFlashFrequencyHz,
      maxBrightnessDelta: track.safetyInfo.maxBrightnessDelta,
      warningText: track.safetyInfo.warningText,
      intensityRating: INTENSITY_MAP[track.safetyInfo.intensityRating] ?? 0,
    },
  };

  const msg = LightFXTrackMsg.create(payload);
  const buf = LightFXTrackMsg.encode(msg).finish();
  // protobufjs returns a Buffer in Node.js; normalize to plain Uint8Array
  return buf instanceof Uint8Array && buf.constructor === Uint8Array ? buf : new Uint8Array(buf);
}

export async function decodeLightFXTrack(bytes: Uint8Array): Promise<LightFXTrack> {
  const r = await getRoot();
  const LightFXTrackMsg = r.lookupType('openlightfx.LightFXTrack');
  const msg = LightFXTrackMsg.decode(bytes) as any;

  const meta = msg.metadata || {};
  const movieRef = meta.movieReference || {};

  return {
    version: msg.version || 1,
    metadata: {
      title: meta.title || '',
      description: meta.description || '',
      author: meta.author || '',
      tags: meta.tags || [],
      durationMs: Number(meta.durationMs || 0),
      movieReference: {
        imdbId: movieRef.imdbId || '',
        title: movieRef.title || '',
        year: movieRef.year || 0,
        runtimeMinutes: movieRef.runtimeMinutes || 0,
      },
      startBehavior: (REV_BOUNDARY[meta.startBehavior] ?? 'BOUNDARY_UNSPECIFIED') as any,
      endBehavior: (REV_BOUNDARY[meta.endBehavior] ?? 'BOUNDARY_UNSPECIFIED') as any,
      preshowDurationMs: meta.preshowDurationMs || 0,
      preshowState: (REV_PRESHOW[meta.preshowState] ?? 'PRESHOW_UNSPECIFIED') as any,
      creditsStartMs: Number(meta.creditsStartMs || 0),
      creditsBehavior: (REV_CREDITS[meta.creditsBehavior] ?? 'CREDITS_UNSPECIFIED') as any,
      trackVersion: meta.trackVersion || '',
    },
    channels: (msg.channels || []).map((ch: any) => ({
      id: ch.id || '',
      displayName: ch.displayName || '',
      description: ch.description || '',
      defaultColor: ch.defaultColor || { r: 0, g: 0, b: 0 },
      defaultBrightness: ch.defaultBrightness || 0,
      spatialHint: ch.spatialHint || 'SPATIAL_UNSPECIFIED',
      optional: ch.optional || false,
    })),
    keyframes: (msg.keyframes || []).map((kf: any) => ({
      id: kf.id || '',
      channelId: kf.channelId || '',
      timestampMs: Number(kf.timestampMs || 0),
      colorMode: (REV_COLOR_MODE[kf.colorMode] ?? 'RGB') as any,
      color: kf.color || { r: 0, g: 0, b: 0 },
      colorTemperature: kf.colorTemperature || 0,
      brightness: kf.brightness || 0,
      transitionMs: kf.transitionMs || 0,
      interpolation: (REV_INTERPOLATION[kf.interpolation] ?? 'STEP') as any,
      powerOn: kf.powerOn || false,
    })),
    effectKeyframes: (msg.effectKeyframes || []).map((ef: any) => ({
      id: ef.id || '',
      channelId: ef.channelId || '',
      timestampMs: Number(ef.timestampMs || 0),
      durationMs: Number(ef.durationMs || 0),
      effectType: (REV_EFFECT_TYPE[ef.effectType] ?? 'EFFECT_UNSPECIFIED') as any,
      intensity: ef.intensity || 0,
      primaryColor: ef.primaryColor || { r: 0, g: 0, b: 0 },
      secondaryColor: ef.secondaryColor || { r: 0, g: 0, b: 0 },
      effectParams: { params: ef.effectParams?.params || {} },
      requiredCapability: ef.requiredCapability || 'CAPABILITY_ANY',
      fallbackColor: ef.fallbackColor || { r: 0, g: 0, b: 0 },
      fallbackBrightness: ef.fallbackBrightness || 0,
    })),
    safetyInfo: {
      containsFlashing: msg.safetyInfo?.containsFlashing || false,
      containsStrobing: msg.safetyInfo?.containsStrobing || false,
      maxFlashFrequencyHz: msg.safetyInfo?.maxFlashFrequencyHz || 0,
      maxBrightnessDelta: msg.safetyInfo?.maxBrightnessDelta || 0,
      warningText: msg.safetyInfo?.warningText || '',
      intensityRating: (REV_INTENSITY[msg.safetyInfo?.intensityRating] ?? 'SUBTLE') as any,
    },
  };
}
