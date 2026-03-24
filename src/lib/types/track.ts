// ============================================================
// Track types — mirrors the protobuf schema with TypeScript types
// These are the in-memory representations used throughout the app.
// ============================================================

export interface RGBColor {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export type ColorMode = 'RGB' | 'COLOR_TEMPERATURE';

export type InterpolationMode = 'STEP' | 'LINEAR';

export type BoundaryBehavior = 'BOUNDARY_UNSPECIFIED' | 'LEAVE' | 'OFF' | 'ON';

export type PreshowState =
  | 'PRESHOW_UNSPECIFIED'
  | 'PRESHOW_DIM'
  | 'PRESHOW_OFF'
  | 'PRESHOW_WARM';

export type CreditsBehavior =
  | 'CREDITS_UNSPECIFIED'
  | 'CREDITS_CONTINUE'
  | 'CREDITS_DIM_UP'
  | 'CREDITS_RAISE'
  | 'CREDITS_OFF';

export type IntensityRating =
  | 'INTENSITY_UNSPECIFIED'
  | 'SUBTLE'
  | 'MODERATE'
  | 'INTENSE'
  | 'EXTREME';

export type SpatialHint =
  | 'SPATIAL_UNSPECIFIED'
  | 'SPATIAL_LEFT'
  | 'SPATIAL_RIGHT'
  | 'SPATIAL_CENTER'
  | 'SPATIAL_SURROUND_LEFT'
  | 'SPATIAL_SURROUND_RIGHT'
  | 'SPATIAL_CEILING'
  | 'SPATIAL_FLOOR'
  | 'SPATIAL_BEHIND_SCREEN'
  | 'SPATIAL_AMBIENT';

export interface MovieReference {
  imdbId: string;
  title: string;
  year: number;
  runtimeMinutes: number;
}

export interface TrackMetadata {
  title: string;
  description: string;
  movieReference: MovieReference;
  author: string;
  tags: string[];
  durationMs: number;
  startBehavior: BoundaryBehavior;
  endBehavior: BoundaryBehavior;
  preshowDurationMs: number;
  preshowState: PreshowState;
  creditsStartMs: number;
  creditsBehavior: CreditsBehavior;
  trackVersion: string;
}

export interface Channel {
  id: string;
  displayName: string;
  description: string;
  defaultColor: RGBColor;
  defaultBrightness: number; // 0-100
  spatialHint: SpatialHint;
  optional: boolean;
}

export interface Keyframe {
  id: string;
  channelId: string;
  timestampMs: number;
  colorMode: ColorMode;
  color: RGBColor;
  colorTemperature: number; // Kelvin, 1000-10000
  brightness: number; // 0-100
  transitionMs: number;
  interpolation: InterpolationMode;
  powerOn: boolean;
}

export interface SafetyInfo {
  containsFlashing: boolean;
  containsStrobing: boolean;
  maxFlashFrequencyHz: number;
  maxBrightnessDelta: number; // 0-100
  warningText: string;
  intensityRating: IntensityRating;
}

export interface LightFXTrack {
  version: number;
  metadata: TrackMetadata;
  channels: Channel[];
  keyframes: Keyframe[];
  effectKeyframes: EffectKeyframe[];
  safetyInfo: SafetyInfo;
}

// ============================================================
// Effect types
// ============================================================

export type EffectType =
  | 'EFFECT_UNSPECIFIED'
  | 'LIGHTNING'
  | 'FLAME'
  | 'FLASHBANG'
  | 'EXPLOSION'
  | 'PULSE'
  | 'STROBE'
  | 'SIREN'
  | 'AURORA'
  | 'CANDLE'
  | 'GUNFIRE'
  | 'NEON'
  | 'BREATHING'
  | 'SPARK';

export interface EffectParams {
  params: Record<string, number>;
}

export type RequiredCapability =
  | 'CAPABILITY_ANY'
  | 'CAPABILITY_RGB'
  | 'CAPABILITY_FAST_TRANSITION'
  | 'CAPABILITY_FAST_RGB';

export interface EffectKeyframe {
  id: string;
  channelId: string;
  timestampMs: number;
  durationMs: number;
  effectType: EffectType;
  intensity: number; // 0-100
  primaryColor: RGBColor;
  secondaryColor: RGBColor;
  effectParams: EffectParams;
  requiredCapability: RequiredCapability;
  fallbackColor: RGBColor;
  fallbackBrightness: number; // 0-100
}

// ============================================================
// Defaults & constants
// ============================================================

export const DEFAULT_RGB_COLOR: RGBColor = { r: 0, g: 0, b: 0 };
export const DEFAULT_WHITE_COLOR: RGBColor = { r: 255, g: 255, b: 255 };
export const DEFAULT_BRIGHTNESS = 50;
export const DEFAULT_INTERPOLATION: InterpolationMode = 'STEP';
export const DEFAULT_COLOR_MODE: ColorMode = 'RGB';
export const TRACK_FORMAT_VERSION = 1;

export const MIN_KEYFRAME_INTERVAL_MS = 100;
export const MAX_KEYFRAME_INTERVAL_MS = 1000;
export const DEFAULT_KEYFRAME_INTERVAL_MS = 200;

export const MIN_COLOR_TEMPERATURE = 1000;
export const MAX_COLOR_TEMPERATURE = 10000;
export const COLOR_TEMPERATURE_STEP = 100;
