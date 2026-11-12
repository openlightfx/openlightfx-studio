import {
  StudioApiError,
  type BulbInfo,
  type LibraryItem,
  type PreviewFrame,
  type PreviewStart,
  type StreamUrl,
  type StudioApi,
  type TrackSummary
} from '$lib/api/types';
import { joinServer } from '$lib/api/urls';

export interface HttpApiOptions {
  serverRoot: string;
  token: string | null;
  fetchImpl?: typeof fetch;
}

async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 240) || res.statusText;
  } catch {
    return res.statusText;
  }
}

function bytesToBlob(bytes: Uint8Array): Blob {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: 'application/octet-stream' });
}

export function createHttpApi(options: HttpApiOptions): StudioApi {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = (extra?: Record<string, string>): Headers => {
    const h = new Headers(extra);
    if (options.token) h.set('X-Emby-Token', options.token);
    return h;
  };
  const url = (path: string) => joinServer(options.serverRoot, path);

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const body = init?.body;
    const isJsonBody = typeof body === 'string';
    const res = await fetchImpl(url(path), {
      ...init,
      headers: headers(
        isJsonBody
          ? { Accept: 'application/json', 'Content-Type': 'application/json' }
          : { Accept: 'application/json' }
      )
    });
    if (!res.ok) throw new StudioApiError(await readError(res), res.status);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  return {
    getBulbs: () => json<BulbInfo[]>('/OpenLightFX/Studio/Bulbs'),
    searchItems: (search) =>
      json<LibraryItem[]>(`/OpenLightFX/Studio/Items?search=${encodeURIComponent(search)}`),
    getStreamUrl: (itemId) =>
      json<StreamUrl>(`/OpenLightFX/Studio/Items/${encodeURIComponent(itemId)}/StreamUrl`),
    listTracks: (itemId) =>
      json<TrackSummary[]>(
        `/OpenLightFX/Studio/Tracks${itemId ? `?itemId=${encodeURIComponent(itemId)}` : ''}`
      ),
    async getTrack(trackId) {
      const res = await fetchImpl(url(`/OpenLightFX/Studio/Tracks/${encodeURIComponent(trackId)}`), {
        headers: headers({ Accept: 'application/octet-stream' })
      });
      if (!res.ok) throw new StudioApiError(await readError(res), res.status);
      return new Uint8Array(await res.arrayBuffer());
    },
    async putTrack(trackId, itemId, bytes) {
      const res = await fetchImpl(
        url(
          `/OpenLightFX/Studio/Tracks/${encodeURIComponent(trackId)}?itemId=${encodeURIComponent(itemId)}`
        ),
        {
          method: 'PUT',
          headers: headers({ 'Content-Type': 'application/octet-stream' }),
          body: bytesToBlob(bytes)
        }
      );
      if (!res.ok) throw new StudioApiError(await readError(res), res.status);
    },
    async previewStart(body: PreviewStart) {
      await json('/OpenLightFX/Studio/Preview/Start', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    },
    async previewFrame(body: PreviewFrame) {
      await json('/OpenLightFX/Studio/Preview/Frame', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    },
    async previewStop() {
      await json('/OpenLightFX/Studio/Preview/Stop', { method: 'POST', body: '{}' });
    }
  };
}
