export interface LibraryItem {
  itemId: string;
  name: string;
  year: number;
  runtimeMs: number;
  posterUrl?: string;
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
