import { createHttpApi } from '$lib/api/http';
import { createMockApi, MOCK_BULBS } from '$lib/api/mock';
import type { BulbInfo, StudioApi } from '$lib/api/types';
import { detectServerRoot, readEmbyToken } from '$lib/api/urls';
import { createSampleTrack } from '$lib/model/sample';
import { encodeTrack } from '$lib/proto/codec';

export type BackendMode = 'mock' | 'live' | 'offline';

export interface StudioSession {
  mode: BackendMode;
  api: StudioApi;
  bulbs: BulbInfo[];
  serverRoot: string;
  token: string | null;
  message: string;
}

function offlineApi(): StudioApi {
  const noop = async () => {};
  return {
    getBulbs: async () => [],
    searchItems: async () => [],
    getStreamUrl: async () => ({ url: '' }),
    listTracks: async () => [],
    getTrack: async () => {
      throw new Error('Emby backend is not available');
    },
    putTrack: async () => {
      throw new Error('Emby backend is not available');
    },
    previewStart: noop,
    previewFrame: noop,
    previewStop: noop
  };
}

export function requestedBackend(loc: Location, dev: boolean): 'mock' | 'live' | 'auto' {
  const q = new URLSearchParams(loc.search).get('backend');
  if (q === 'mock' || q === 'live') return q;
  return dev ? 'mock' : 'auto';
}

export async function connectStudio(dev: boolean): Promise<StudioSession> {
  const loc = window.location;
  const mode = requestedBackend(loc, dev);
  const serverParam = new URLSearchParams(loc.search).get('server');
  const serverRoot = serverParam || detectServerRoot(loc);
  const token = readEmbyToken(window);

  if (mode === 'mock') {
    const sample = createSampleTrack();
    const { api } = createMockApi({
      trackId: 'track-glass-harbor',
      itemId: 'item-glass-harbor',
      title: sample.metadata.title,
      bytes: encodeTrack(sample)
    });
    return {
      mode: 'mock',
      api,
      bulbs: await api.getBulbs(),
      serverRoot,
      token: null,
      message: 'Mock backend — local library, no bulb network'
    };
  }

  const api = createHttpApi({ serverRoot, token });
  try {
    const bulbs = await withTimeout(api.getBulbs(), 2500);
    return {
      mode: 'live',
      api,
      bulbs,
      serverRoot,
      token,
      message: token ? 'Connected to Emby' : 'Connected to Emby (no access token found)'
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unreachable';
    return {
      mode: 'offline',
      api: offlineApi(),
      bulbs: mode === 'live' ? [] : MOCK_BULBS,
      serverRoot,
      token,
      message: `Emby backend unavailable (${reason}). Editing locally.`
    };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}
