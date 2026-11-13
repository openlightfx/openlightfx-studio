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

interface EmbyStoredUser {
  UserId?: string;
  AccessToken?: string;
}

interface EmbyStoredServer {
  UserId?: string;
  ManualAddress?: string;
  LocalAddress?: string;
  RemoteAddress?: string;
  Users?: EmbyStoredUser[];
}

interface EmbyStoredCredentials {
  Servers?: EmbyStoredServer[];
}

function embyTokenFromSession(): string | null {
  if (typeof window === 'undefined') return null;

  // When Studio is opened from Emby, use its active API client if the Web app exposes it.
  const apiClient = (window as Window & { ApiClient?: { accessToken?: () => string } }).ApiClient;
  const activeToken = apiClient?.accessToken?.();
  if (activeToken) return activeToken;

  // Emby Web 4.9 stores signed-in server credentials under this key. Studio shares the
  // server origin, so it can select only the credential for the Emby instance serving it.
  try {
    const stored = window.localStorage.getItem('servercredentials3');
    if (!stored) return null;
    const credentials = JSON.parse(stored) as EmbyStoredCredentials;
    const currentUrl = new URL(window.location.href);
    const server = (credentials.Servers ?? [])
      .map((candidate) => {
        const matchingAddress = [
          candidate.ManualAddress,
          candidate.LocalAddress,
          candidate.RemoteAddress,
        ]
          .filter((address): address is string => !!address)
          .map((address) => {
            try {
              const url = new URL(address);
              const pathBase = url.pathname.replace(/\/$/, '');
              const pathMatches =
                !pathBase ||
                currentUrl.pathname === pathBase ||
                currentUrl.pathname.startsWith(`${pathBase}/`);
              return url.origin === currentUrl.origin && pathMatches ? pathBase.length : -1;
            } catch {
              return -1;
            }
          })
          .reduce((longest, length) => Math.max(longest, length), -1);
        return { candidate, matchingAddress };
      })
      .filter(({ matchingAddress }) => matchingAddress >= 0)
      .sort((a, b) => b.matchingAddress - a.matchingAddress)[0]?.candidate;
    if (!server?.UserId) return null;
    return server.Users?.find((user) => user.UserId === server.UserId)?.AccessToken ?? null;
  } catch {
    // Storage can be unavailable in private browsing; normal Emby URL-token auth still works.
    return null;
  }
}

export function authHeaders(): Record<string, string> {
  const key = new URLSearchParams(location.search).get('api_key') ?? embyTokenFromSession();
  return key ? { 'X-Emby-Token': key } : {};
}

let studioToken: string | null | undefined;
let studioTokenRequest: Promise<string | null> | null = null;

async function resolveStudioToken(): Promise<string | null> {
  if (studioToken !== undefined) return studioToken;
  if (studioTokenRequest) return studioTokenRequest;

  studioTokenRequest = (async () => {
    const explicitHeaders = authHeaders();
    const requestSession = (headers: Record<string, string>) =>
      fetch('/OpenLightFX/Studio/Session', {
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
      });

    try {
      let response = await requestSession(explicitHeaders);
      if (!response.ok && Object.keys(explicitHeaders).length > 0) {
        // If Emby rotated its login token, the page's HttpOnly ticket may still be valid.
        response = await requestSession({});
      }
      if (response.ok) {
        const body = (await response.json()) as { accessToken?: string };
        if (body.accessToken) return body.accessToken;
      }
    } catch {
      // Older plugin builds may not provide the session exchange route.
    }

    return explicitHeaders['X-Emby-Token'] ?? null;
  })();
  studioToken = await studioTokenRequest;
  studioTokenRequest = null;
  return studioToken;
}

export async function studioAuthHeaders(): Promise<Record<string, string>> {
  const key = await resolveStudioToken();
  return key ? { 'X-Emby-Token': key } : {};
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: { ...(await studioAuthHeaders()), ...(init.headers ?? {}) },
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

export async function fetchActiveTrackPath(itemId: string): Promise<string | null> {
  const query = new URLSearchParams({ ItemId: itemId });
  const response = await send(`/OpenLightFX/Tracks/ByItem?${query}`);
  if (!response.ok) throw new Error(`Track selection ${response.status}`);
  const body = (await response.json()) as { globalSelectedTrack?: string | null };
  return body.globalSelectedTrack ?? null;
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

export function fetchFrame(itemId: string, timeMs: number): Promise<Response> {
  return send(
    `/OpenLightFX/Studio/Items/${encodeURIComponent(itemId)}/Frame?timeMs=${Math.round(timeMs)}`
  );
}
