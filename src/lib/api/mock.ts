import type {
  BulbFrameState,
  BulbInfo,
  LibraryItem,
  PreviewFrame,
  PreviewStart,
  StudioApi,
  TrackSummary
} from '$lib/api/types';
import { StudioApiError } from '$lib/api/types';
import { decodeTrack } from '$lib/proto/codec';

export const MOCK_BULBS: BulbInfo[] = [
  {
    id: 'wiz-left',
    name: 'WiZ Left Sconce',
    protocol: 'wiz',
    capabilities: { rgb: true, minTransitionMs: 40 }
  },
  {
    id: 'lifx-right',
    name: 'LIFX Right Sconce',
    protocol: 'lifx',
    capabilities: { rgb: true, minTransitionMs: 0 }
  },
  {
    id: 'hue-center',
    name: 'Hue Center',
    protocol: 'hue',
    capabilities: { rgb: true, minTransitionMs: 100 }
  },
  {
    id: 'govee-back',
    name: 'Govee Backlight',
    protocol: 'govee',
    capabilities: { rgb: true, minTransitionMs: 200 }
  },
  {
    id: 'rest-lamp',
    name: 'REST Floor Lamp',
    protocol: 'rest',
    capabilities: { rgb: false, minTransitionMs: 500 }
  }
];

const ITEMS: LibraryItem[] = [
  { itemId: 'item-glass-harbor', name: 'Glass Harbor', year: 2024, runtimeMs: 112 * 60 * 1000 },
  { itemId: 'item-night-shift', name: 'Night Shift', year: 2019, runtimeMs: 102 * 60 * 1000 },
  { itemId: 'item-low-tide', name: 'Low Tide', year: 2021, runtimeMs: 94 * 60 * 1000 }
];

export interface MockState {
  tracks: Map<string, { summary: TrackSummary; bytes: Uint8Array }>;
  mapping: Record<string, string[]> | null;
  frames: BulbFrameState[][];
  running: boolean;
}

export function createMockApi(seed?: { trackId: string; itemId: string; title: string; bytes: Uint8Array }): {
  api: StudioApi;
  state: MockState;
} {
  const state: MockState = { tracks: new Map(), mapping: null, frames: [], running: false };
  if (seed) {
    state.tracks.set(seed.trackId, {
      bytes: seed.bytes,
      summary: {
        trackId: seed.trackId,
        title: seed.title,
        itemId: seed.itemId,
        updatedAt: new Date('2024-11-02T18:00:00Z').toISOString()
      }
    });
  }

  const api: StudioApi = {
    async getBulbs() {
      return MOCK_BULBS.map((b) => ({ ...b, capabilities: { ...b.capabilities } }));
    },
    async searchItems(search) {
      const q = search.trim().toLowerCase();
      return ITEMS.filter((item) => !q || item.name.toLowerCase().includes(q)).map((item) => ({
        ...item
      }));
    },
    async getStreamUrl() {
      return { url: '' };
    },
    async listTracks(itemId) {
      return [...state.tracks.values()]
        .map((t) => t.summary)
        .filter((t) => !itemId || t.itemId === itemId)
        .map((t) => ({ ...t }));
    },
    async getTrack(trackId) {
      const found = state.tracks.get(trackId);
      if (!found) throw new StudioApiError('Track not found', 404);
      return found.bytes.slice();
    },
    async putTrack(trackId, itemId, bytes) {
      let title = 'Saved track';
      try {
        title = decodeTrack(bytes).metadata.title || title;
      } catch {
        /* keep fallback title */
      }
      state.tracks.set(trackId, {
        bytes: bytes.slice(),
        summary: {
          trackId,
          itemId,
          title,
          updatedAt: new Date().toISOString()
        }
      });
    },
    async previewStart(body: PreviewStart) {
      state.running = true;
      state.mapping = body.mapping;
      state.frames = [];
    },
    async previewFrame(body: PreviewFrame) {
      if (!state.running) throw new StudioApiError('Preview is not running', 409);
      state.frames.push(body.states.map((s) => ({ ...s })));
      if (state.frames.length > 8) state.frames.shift();
    },
    async previewStop() {
      state.running = false;
    }
  };
  return { api, state };
}
