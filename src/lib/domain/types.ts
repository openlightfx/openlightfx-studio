export const EFFECT_TYPES = [
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
] as const;

export type EffectType = (typeof EFFECT_TYPES)[number];

export type ColorMode = 'RGB' | 'COLOR_TEMPERATURE';
export type Interpolation = 'STEP' | 'LINEAR' | 'UNSPECIFIED';
export type IntensityRating = 'SUBTLE' | 'MODERATE' | 'INTENSE' | 'EXTREME';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Keyframe {
  id: string;
  channelId: string;
  timestampMs: number;
  colorMode: ColorMode;
  color: Rgb;
  colorTemperature: number;
  brightness: number;
  transitionMs: number;
  interpolation: Interpolation;
  powerOn: boolean;
}

export interface Channel {
  id: string;
  displayName: string;
  spatialHint: string;
  defaultColor: Rgb;
  defaultBrightness: number;
  optional: boolean;
}

export interface EffectKeyframe {
  id: string;
  channelId: string;
  timestampMs: number;
  durationMs: number;
  effectType: EffectType;
  intensity: number;
  primaryColor: Rgb | null;
  secondaryColor: Rgb | null;
  params: Record<string, number>;
  requiredCapability: string;
  fallbackColor: Rgb | null;
  fallbackBrightness: number;
}

export interface TrackMetadata {
  title: string;
  description: string;
  author: string;
  tags: string[];
  imdbId: string;
  movieTitle: string;
  year: number;
  durationMs: number;
  channelLayout?: string;
}

export interface SafetyInfo {
  containsFlashing: boolean;
  containsStrobing: boolean;
  maxFlashFrequencyHz: number;
  maxBrightnessDelta: number;
  warningText: string;
  intensityRating: IntensityRating;
}

export interface Track {
  version: number;
  metadata: TrackMetadata;
  channels: Channel[];
  keyframes: Keyframe[];
  effects: EffectKeyframe[];
  safety: SafetyInfo | null;
}

export interface SceneMarker {
  id: string;
  timeMs: number;
  label: string;
  kind: 'manual' | 'chapter' | 'detected';
}

export interface ChannelGroup {
  id: string;
  name: string;
  mode: 'mirror' | 'spread' | 'alternate';
  channelIds: string[];
  spreadMs: number;
}

export interface ProjectSidecar {
  version: 1;
  itemId: string;
  trackId: string;
  sceneMarkers: SceneMarker[];
  channelGroups: ChannelGroup[];
}

export interface Sample {
  r: number;
  g: number;
  b: number;
  brightness: number;
  kelvin: number;
  mode: ColorMode;
  powerOn: boolean;
}

export const BLACK: Rgb = { r: 0, g: 0, b: 0 };

export function rgb(r: number, g: number, b: number): Rgb {
  return { r, g, b };
}
