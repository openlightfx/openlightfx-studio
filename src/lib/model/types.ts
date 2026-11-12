/** Domain types for a LightFXTrack. Enum names match proto/lightfx.proto. */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export type BoundaryBehavior = 'BOUNDARY_UNSPECIFIED' | 'LEAVE' | 'OFF' | 'ON';
export type PreshowState = 'PRESHOW_UNSPECIFIED' | 'PRESHOW_DIM' | 'PRESHOW_OFF' | 'PRESHOW_WARM';
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
export type ColorMode = 'COLOR_MODE_UNSPECIFIED' | 'RGB' | 'COLOR_TEMPERATURE';
export type Interpolation = 'INTERPOLATION_UNSPECIFIED' | 'STEP' | 'LINEAR';

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
  defaultColor: RGB;
  defaultBrightness: number;
  spatialHint: string;
  optional: boolean;
}

export interface Keyframe {
  id: string;
  channelId: string;
  timestampMs: number;
  colorMode: ColorMode;
  color: RGB;
  colorTemperature: number;
  brightness: number;
  transitionMs: number;
  interpolation: Interpolation;
  powerOn: boolean;
}

export interface EffectKeyframe {
  id: string;
  channelId: string;
  timestampMs: number;
  durationMs: number;
  effectType: EffectType;
  intensity: number;
  primaryColor: RGB;
  secondaryColor: RGB;
  effectParams: Record<string, number>;
  requiredCapability: string;
  fallbackColor: RGB;
  fallbackBrightness: number;
}

export interface SafetyInfo {
  containsFlashing: boolean;
  containsStrobing: boolean;
  maxFlashFrequencyHz: number;
  maxBrightnessDelta: number;
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

/** Editor-only. Not part of the .lightfx protobuf. */
export interface Marker {
  id: string;
  timestampMs: number;
  label: string;
}

export const SPATIAL_HINTS = [
  'SPATIAL_UNSPECIFIED',
  'SPATIAL_LEFT',
  'SPATIAL_RIGHT',
  'SPATIAL_CENTER',
  'SPATIAL_SURROUND_LEFT',
  'SPATIAL_SURROUND_RIGHT',
  'SPATIAL_CEILING',
  'SPATIAL_FLOOR',
  'SPATIAL_BEHIND_SCREEN',
  'SPATIAL_AMBIENT'
] as const;

export const EFFECT_TYPES: EffectType[] = [
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
];

export const BOUNDARY_BEHAVIORS: BoundaryBehavior[] = ['BOUNDARY_UNSPECIFIED', 'LEAVE', 'OFF', 'ON'];
export const PRESHOW_STATES: PreshowState[] = [
  'PRESHOW_UNSPECIFIED',
  'PRESHOW_DIM',
  'PRESHOW_OFF',
  'PRESHOW_WARM'
];
export const CREDITS_BEHAVIORS: CreditsBehavior[] = [
  'CREDITS_UNSPECIFIED',
  'CREDITS_CONTINUE',
  'CREDITS_DIM_UP',
  'CREDITS_RAISE',
  'CREDITS_OFF'
];
export const INTENSITY_RATINGS: IntensityRating[] = [
  'INTENSITY_UNSPECIFIED',
  'SUBTLE',
  'MODERATE',
  'INTENSE',
  'EXTREME'
];

export function createId(prefix: string): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return `${prefix}_${c.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
}

export function rgb(r: number, g: number, b: number): RGB {
  return { r, g, b };
}

/** Deep copy that also unwraps Svelte state proxies. Domain data is JSON-safe. */
export function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneTrack(track: LightFXTrack): LightFXTrack {
  return plainClone(track);
}

export function emptyMetadata(): TrackMetadata {
  return {
    title: 'Untitled Track',
    description: '',
    movieReference: { imdbId: '', title: '', year: new Date().getFullYear(), runtimeMinutes: 0 },
    author: '',
    tags: [],
    durationMs: 90 * 60 * 1000,
    startBehavior: 'OFF',
    endBehavior: 'OFF',
    preshowDurationMs: 0,
    preshowState: 'PRESHOW_DIM',
    creditsStartMs: 0,
    creditsBehavior: 'CREDITS_CONTINUE',
    trackVersion: '1.0'
  };
}

export function emptySafety(): SafetyInfo {
  return {
    containsFlashing: false,
    containsStrobing: false,
    maxFlashFrequencyHz: 0,
    maxBrightnessDelta: 0,
    warningText: '',
    intensityRating: 'SUBTLE'
  };
}

export function makeChannel(
  id: string,
  displayName: string,
  spatialHint: string,
  color: RGB = rgb(0, 0, 0)
): Channel {
  return {
    id,
    displayName,
    description: '',
    defaultColor: color,
    defaultBrightness: 0,
    spatialHint,
    optional: false
  };
}

export function makeKeyframe(
  partial: Partial<Keyframe> & Pick<Keyframe, 'id' | 'channelId' | 'timestampMs'>
): Keyframe {
  return {
    colorMode: 'RGB',
    colorTemperature: 4000,
    brightness: 100,
    transitionMs: 0,
    interpolation: 'LINEAR',
    powerOn: true,
    ...partial,
    color: partial.color ? { ...partial.color } : rgb(255, 255, 255)
  };
}

export function makeEffect(
  partial: Partial<EffectKeyframe> & Pick<EffectKeyframe, 'id' | 'channelId' | 'timestampMs'>
): EffectKeyframe {
  return {
    durationMs: 2000,
    effectType: 'LIGHTNING',
    intensity: 80,
    requiredCapability: '',
    fallbackBrightness: 40,
    ...partial,
    primaryColor: partial.primaryColor ? { ...partial.primaryColor } : rgb(255, 255, 255),
    secondaryColor: partial.secondaryColor ? { ...partial.secondaryColor } : rgb(40, 70, 180),
    fallbackColor: partial.fallbackColor ? { ...partial.fallbackColor } : rgb(180, 180, 180),
    effectParams: { ...(partial.effectParams ?? {}) }
  };
}

export function emptyTrack(): LightFXTrack {
  return {
    version: 1,
    metadata: emptyMetadata(),
    channels: [makeChannel('main', 'Main', 'SPATIAL_CENTER', rgb(255, 244, 230))],
    keyframes: [],
    effectKeyframes: [],
    safetyInfo: emptySafety()
  };
}

export const CHANNEL_PRESETS: { name: string; channels: Channel[] }[] = [
  {
    name: 'Mono',
    channels: [makeChannel('main', 'Main', 'SPATIAL_CENTER', rgb(255, 244, 230))]
  },
  {
    name: 'Stereo',
    channels: [
      makeChannel('left', 'Left', 'SPATIAL_LEFT', rgb(80, 160, 255)),
      makeChannel('right', 'Right', 'SPATIAL_RIGHT', rgb(255, 140, 90))
    ]
  },
  {
    name: 'Stereo + ambient',
    channels: [
      makeChannel('left', 'Left', 'SPATIAL_LEFT', rgb(80, 160, 255)),
      makeChannel('right', 'Right', 'SPATIAL_RIGHT', rgb(255, 140, 90)),
      makeChannel('ambient', 'Ambient', 'SPATIAL_AMBIENT', rgb(120, 90, 255))
    ]
  },
  {
    name: 'Theater',
    channels: [
      makeChannel('left', 'Left', 'SPATIAL_LEFT', rgb(80, 160, 255)),
      makeChannel('center', 'Center', 'SPATIAL_CENTER', rgb(255, 220, 170)),
      makeChannel('right', 'Right', 'SPATIAL_RIGHT', rgb(255, 140, 90)),
      makeChannel('surround-left', 'Surround Left', 'SPATIAL_SURROUND_LEFT', rgb(150, 90, 255)),
      makeChannel('surround-right', 'Surround Right', 'SPATIAL_SURROUND_RIGHT', rgb(255, 90, 160)),
      makeChannel('ambient', 'Ambient', 'SPATIAL_AMBIENT', rgb(90, 200, 180))
    ]
  }
];
