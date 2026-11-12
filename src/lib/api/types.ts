/**
 * Studio backend contract. Paths are relative to the Emby server root.
 * The Emby plugin (openlightfx-emby) serves these routes. Auth, when the
 * SPA is hosted in an Emby session, is the X-Emby-Token header.
 *
 * GET  /OpenLightFX/Studio/Bulbs
 * GET  /OpenLightFX/Studio/Items?search=
 * GET  /OpenLightFX/Studio/Items/{itemId}/StreamUrl
 * GET  /OpenLightFX/Studio/Tracks?itemId=
 * GET  /OpenLightFX/Studio/Tracks/{trackId}
 * PUT  /OpenLightFX/Studio/Tracks/{trackId}?itemId=   body: raw .lightfx
 * POST /OpenLightFX/Studio/Preview/Start
 * POST /OpenLightFX/Studio/Preview/Frame
 * POST /OpenLightFX/Studio/Preview/Stop
 */

export interface BulbCapabilities {
  rgb: boolean;
  minTransitionMs: number;
}

export interface BulbInfo {
  id: string;
  name: string;
  protocol: string;
  capabilities: BulbCapabilities;
}

export interface LibraryItem {
  itemId: string;
  name: string;
  year: number;
  runtimeMs: number;
}

export interface StreamUrl {
  url: string;
}

export interface TrackSummary {
  trackId: string;
  title: string;
  itemId: string;
  updatedAt: string;
}

export interface PreviewStart {
  mapping: Record<string, string[]>;
}

export interface BulbFrameState {
  bulbId: string;
  r: number;
  g: number;
  b: number;
  brightness: number;
  transitionMs: number;
}

export interface PreviewFrame {
  states: BulbFrameState[];
}

export interface StudioApi {
  getBulbs(): Promise<BulbInfo[]>;
  searchItems(search: string): Promise<LibraryItem[]>;
  getStreamUrl(itemId: string): Promise<StreamUrl>;
  listTracks(itemId?: string): Promise<TrackSummary[]>;
  getTrack(trackId: string): Promise<Uint8Array>;
  putTrack(trackId: string, itemId: string, bytes: Uint8Array): Promise<void>;
  previewStart(body: PreviewStart): Promise<void>;
  previewFrame(body: PreviewFrame): Promise<void>;
  previewStop(): Promise<void>;
}

export class StudioApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'StudioApiError';
  }
}
