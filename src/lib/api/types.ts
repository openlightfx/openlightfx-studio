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
  sceneCutThreshold: number;
  centerExclusionPercent: number;
  zones: GenerationZone[];
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
}

export interface GenerationJob {
  jobId: string;
  state: 'pending' | 'processing' | 'done' | 'failed';
  error: string;
  progress: number;
  throughMs: number;
  sequence: number;
  keyframes: GeneratedKeyframe[];
}

export type {
  SceneCuts,
  SceneCutDetector,
  SceneCutJob,
  SceneCutStatus,
} from '$lib/domain/scene-cuts';
