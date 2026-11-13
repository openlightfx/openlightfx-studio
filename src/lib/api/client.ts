import { libraryItemFromApi } from './items';
import type {
  Bulb,
  LibraryItem,
  MediaInfo,
  ProxyInfo,
  StudioSettings,
  TrackSummary,
} from './types';

export type { Bulb, LibraryItem, MediaInfo, StudioSettings, TrackSummary };

/** A copy whose buffer is a plain ArrayBuffer, which fetch and Blob accept. */
export function bytesAsBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function authHeaders(): Record<string, string> {
  const key = new URLSearchParams(location.search).get('api_key');
  return key ? { 'X-Emby-Token': key } : {};
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });
}

export async function fetchItems(search = ''): Promise<LibraryItem[]> {
  const pageSize = 200;
  const items: LibraryItem[] = [];
  const seen = new Set<string>();
  for (let startIndex = 0; ; startIndex += pageSize) {
    const query = new URLSearchParams({
      search,
      startIndex: String(startIndex),
      limit: String(pageSize),
    });
    const response = await send(`/OpenLightFX/Studio/Items?${query}`);
    if (!response.ok) throw new Error(`Items ${response.status}`);
    const body = await response.json();
    const rows = Array.isArray(body) ? body : (body?.Items ?? []);
    const page: LibraryItem[] = rows.map((row: Record<string, unknown>) => libraryItemFromApi(row));
    const unseen = page.filter((item) => item.itemId && !seen.has(item.itemId));
    for (const item of unseen) seen.add(item.itemId);
    items.push(...unseen);
    if (page.length < pageSize || unseen.length === 0) return items;
  }
}

export async function restartProxy(itemId: string): Promise<ProxyInfo> {
  const response = await send(`/OpenLightFX/Studio/Items/${encodeURIComponent(itemId)}/Proxy`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error(`Proxy ${response.status}`);
  return response.json();
}

export async function fetchMediaInfo(itemId: string): Promise<MediaInfo> {
  const response = await send(`/OpenLightFX/Studio/Items/${encodeURIComponent(itemId)}/MediaInfo`);
  if (!response.ok) throw new Error(`MediaInfo ${response.status}`);
  return response.json();
}

export async function fetchTracks(itemId: string): Promise<TrackSummary[]> {
  const response = await send(`/OpenLightFX/Studio/Tracks?itemId=${encodeURIComponent(itemId)}`);
  if (!response.ok) throw new Error(`Tracks ${response.status}`);
  return response.json();
}

export async function fetchTrackBytes(trackId: string, itemId: string): Promise<Uint8Array> {
  const response = await send(
    `/OpenLightFX/Studio/Tracks/${encodeURIComponent(trackId)}?itemId=${encodeURIComponent(itemId)}`
  );
  if (!response.ok) throw new Error(`Track ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function fetchBulbs(): Promise<Bulb[]> {
  const response = await send('/OpenLightFX/Studio/Bulbs');
  if (!response.ok) throw new Error(`Bulbs ${response.status}`);
  return response.json();
}

export async function fetchSettings(): Promise<StudioSettings> {
  const response = await send('/OpenLightFX/Settings');
  if (!response.ok) throw new Error(`Settings ${response.status}`);
  return response.json();
}

export async function putBytes(
  path: string,
  bytes: Uint8Array,
  extra: Record<string, string> = {}
): Promise<Response> {
  return send(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', ...extra },
    body: bytesAsBuffer(bytes),
  });
}

export async function putJson(path: string, body: unknown): Promise<Response> {
  return send(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function postJson(path: string, body: unknown): Promise<Response> {
  return send(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function frameUrl(itemId: string, timeMs: number): string {
  return `/OpenLightFX/Studio/Items/${encodeURIComponent(itemId)}/Frame?timeMs=${Math.round(timeMs)}`;
}
