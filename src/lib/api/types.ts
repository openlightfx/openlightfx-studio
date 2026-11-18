export interface LibraryItem {
  itemId: string;
  name: string;
  year: number;
  runtimeMs: number;
  posterUrl?: string;
  dateAdded?: string;
  trackCount?: number;
  hasActiveTrack?: boolean;
}

export interface ProxyInfo {
  state: 'missing' | 'building' | 'ready' | 'failed';
  reason?: string;
  encodedThroughMs: number;
  fps: number;
  keyframeIntervalMs: number;
  width: number;
  height: number;
  editUrl?: string;
}

export interface MediaInfo {
  runtimeMs: number;
  width: number;
  height: number;
  videoCodec: string;
  hdr: boolean;
  colorTransfer: string;
  audioCodec: string;
  proxy: ProxyInfo;
}

export interface TrackSummary {
  trackId: string;
  title: string;
  itemId: string;
  updatedAt: string;
  active?: boolean;
  author?: string;
  layout?: string;
}

export interface Bulb {
  id: string;
  name: string;
  protocol: string;
  capabilities: { rgb: boolean; minTransitionMs: number };
}

export interface StudioSettings {
  photosensitivityMode: boolean;
  mappingProfile: Record<string, string[]>;
}

export interface GenerationZone {
  channelId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GenerationOptions {
  sampleRateFps: number;
  centerExclusionPercent: number;
  zones: GenerationZone[];
  /** Ramp zone keyframes through fades. Lightning and siren are skipped when their channel lists are empty. */
  fades?: boolean;
  lightningChannels?: string[];
  sirenChannels?: string[];
}

export interface GeneratedEffect {
  id: string;
  channelId: string;
  timestampMs: number;
  durationMs: number;
  effectType: 'LIGHTNING' | 'SIREN';
  intensity: number;
  r: number;
  g: number;
  b: number;
  secondaryR: number;
  secondaryG: number;
  secondaryB: number;
  pulseRateHz: number;
  flashCount: number;
  decayMs: number;
}

export interface GeneratedKeyframe {
  id: string;
  channelId: string;
  timestampMs: number;
  r: number;
  g: number;
  b: number;
  transitionMs: number;
  powerOn: boolean;
  brightness?: number;
}

export interface GenerationJob {
  jobId: string;
  state: 'pending' | 'processing' | 'done' | 'failed';
  error: string;
  progress: number;
  throughMs: number;
  sequence: number;
  keyframes: GeneratedKeyframe[];
  /** Full set of prefilled lightning and siren effects so far. */
  effects?: GeneratedEffect[];
}

export type {
  SceneCuts,
  SceneCutDetector,
  SceneCutJob,
  SceneCutStatus,
} from '$lib/domain/scene-cuts';
