import { libraryItemFromApi } from './items';
import { parseProjectSidecar } from '$lib/domain/save';
import {
  emptySceneCuts,
  parseSceneCutJob,
  parseSceneCuts,
  type SceneCutJob,
  type SceneCuts,
} from '$lib/domain/scene-cuts';
import type { ProjectSidecar } from '$lib/domain/types';
import type {
  Bulb,
  LibraryItem,
  MediaInfo,
  ProxyInfo,
  StudioSettings,
  TrackSummary,
  GenerationOptions,
  GenerationJob,
} from './types';

export type {
  Bulb,
  LibraryItem,
  MediaInfo,
  StudioSettings,
  TrackSummary,
  GenerationOptions,
  GenerationJob,
  SceneCuts,
  SceneCutJob,
};

/**
 * Scene-cut routes from openlightfx-emby#15.
 * GET document is any signed-in user. POST start and GET job are Admin.
 */
export const SCENE_CUT_ROUTES = {
  document: (itemId: string) => `/OpenLightFX/Studio/Items/${encodeURIComponent(itemId)}/SceneCuts`,
  start: (itemId: string) => `/OpenLightFX/Studio/Items/${encodeURIComponent(itemId)}/SceneCuts`,
  job: (jobId: string) => `/OpenLightFX/Studio/SceneCuts/${encodeURIComponent(jobId)}`,
} as const;

export class SceneCutForbiddenError extends Error {
  readonly status = 403;
  constructor() {
    super('Admin is required to detect scenes');
    this.name = 'SceneCutForbiddenError';
  }
}

export class SceneCutAlreadyRunningError extends Error {
  readonly status = 409;
  constructor() {
    super('Scene detection is already running');
    this.name = 'SceneCutAlreadyRunningError';
  }
}

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
  Id?: string;
  ServerId?: string;
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

export class ProjectSidecarLoadError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly invalid = false
  ) {
    super(message);
    this.name = 'ProjectSidecarLoadError';
  }
}

export async function fetchProjectSidecar(
  itemId: string,
  trackId: string,
  signal?: AbortSignal
): Promise<ProjectSidecar> {
  const query = new URLSearchParams({ itemId });
  const response = await send(
    `/OpenLightFX/Studio/Projects/${encodeURIComponent(trackId)}?${query}`,
    { signal }
  );
  if (response.status === 404)
    return {
      version: 1,
      itemId,
      trackId,
      sceneMarkers: [],
      channelGroups: [],
    };
  if (!response.ok)
    throw new ProjectSidecarLoadError(
      `Project sidecar could not be loaded (${response.status})`,
      response.status
    );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ProjectSidecarLoadError(
      'Project sidecar response is not valid JSON',
      response.status,
      true
    );
  }
  try {
    return parseProjectSidecar(body, { itemId, trackId });
  } catch (error) {
    throw new ProjectSidecarLoadError(
      (error as Error).message || 'Project sidecar is invalid',
      response.status,
      true
    );
  }
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: { ...(await studioAuthHeaders()), ...(init.headers ?? {}) },
  });
}

function embyUserIdFromSession(): string | null {
  if (typeof window === 'undefined') return null;
  const apiClient = window as Window & {
    ApiClient?: { getCurrentUserId?: () => string };
  };
  const currentUserId = apiClient.ApiClient?.getCurrentUserId?.();
  if (currentUserId) return currentUserId;

  try {
    const token = authHeaders()['X-Emby-Token'];
    if (!token) return null;
    const credentials = JSON.parse(
      window.localStorage.getItem('servercredentials3') ?? '{}'
    ) as EmbyStoredCredentials;
    for (const server of credentials.Servers ?? []) {
      const user = server.Users?.find((candidate) => candidate.AccessToken === token);
      if (user?.UserId) return user.UserId;
    }
  } catch {
    // The item endpoint without an explicit user ID remains available as a fallback.
  }
  return null;
}

export async function fetchItem(itemId: string): Promise<LibraryItem | null> {
  const query = new URLSearchParams({ Fields: 'DateCreated,MediaSources,ProviderIds' });
  const userId = embyUserIdFromSession();
  const paths = [
    ...(userId
      ? [`/emby/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}?${query}`]
      : []),
    `/emby/Items/${encodeURIComponent(itemId)}?${query}`,
  ];
  let lastError: Error | null = null;
  for (const path of paths) {
    const response = await send(path);
    if (response.status === 404) continue;
    if (!response.ok) {
      lastError = new Error(`Item ${response.status}`);
      continue;
    }
    const item = libraryItemFromApi(await response.json());
    if (item.itemId === itemId) return item;
    lastError = new Error('Emby returned details for a different movie');
  }
  if (lastError) throw lastError;
  return null;
}

export async function fetchItems(search = '', signal?: AbortSignal): Promise<LibraryItem[]> {
  const pageSize = 200;
  const items: LibraryItem[] = [];
  const seen = new Set<string>();
  for (let startIndex = 0; ; startIndex += pageSize) {
    const query = new URLSearchParams({
      search,
      startIndex: String(startIndex),
      limit: String(pageSize),
    });
    const response = await send(`/OpenLightFX/Studio/Items?${query}`, { signal });
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

export async function setActiveTrack(
  itemId: string,
  trackId: string
): Promise<{ trackId: string; embyUrl: string }> {
  const apiClient = (
    window as Window & {
      ApiClient?: { serverId?: () => string; getServerId?: () => string };
    }
  ).ApiClient;
  let serverId = apiClient?.serverId?.() ?? apiClient?.getServerId?.() ?? '';
  if (!serverId) {
    try {
      const stored = JSON.parse(localStorage.getItem('servercredentials3') ?? '{}') as {
        Servers?: EmbyStoredServer[];
      };
      const origin = new URL(location.href).origin;
      const server = stored.Servers?.find((candidate) =>
        [candidate.ManualAddress, candidate.LocalAddress, candidate.RemoteAddress].some(
          (address) => {
            if (!address) return false;
            try {
              return new URL(address).origin === origin;
            } catch {
              return false;
            }
          }
        )
      );
      serverId = server?.ServerId ?? server?.Id ?? '';
    } catch {
      // A server id is optional when Studio runs on the Emby origin.
    }
  }
  const response = await send(
    `/OpenLightFX/Studio/Items/${encodeURIComponent(itemId)}/ActiveTrack`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trackId, ...(serverId ? { serverId } : {}) }),
    }
  );
  if (!response.ok) throw new Error((await response.text()) || `Active track ${response.status}`);
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

export function fetchFrame(
  itemId: string,
  timeMs: number,
  signal?: AbortSignal
): Promise<Response> {
  return send(
    `/OpenLightFX/Studio/Items/${encodeURIComponent(itemId)}/Frame?timeMs=${Math.round(timeMs)}`,
    { signal }
  );
}

export async function startKeyframeGeneration(
  itemId: string,
  options: GenerationOptions
): Promise<GenerationJob> {
  const response = await postJson(
    `/OpenLightFX/Studio/Items/${encodeURIComponent(itemId)}/Generate`,
    options
  );
  if (!response.ok) throw new Error(await responseMessage(response, 'Could not start generation'));
  return response.json();
}

export async function fetchSceneCuts(itemId: string, signal?: AbortSignal): Promise<SceneCuts> {
  const response = await send(SCENE_CUT_ROUTES.document(itemId), { signal });
  if (response.status === 404) return emptySceneCuts(itemId);
  if (!response.ok)
    throw new Error(await responseMessage(response, `Scene cuts ${response.status}`));
  const parsed = parseSceneCuts(await response.json());
  if (!parsed || parsed.itemId !== itemId)
    throw new Error('Scene cuts response did not match this movie');
  return parsed;
}

export async function startSceneCutDetection(
  itemId: string,
  sceneCutThreshold?: number
): Promise<SceneCutJob> {
  const body =
    sceneCutThreshold == null
      ? {}
      : { sceneCutThreshold: Math.max(0.01, Math.min(1, sceneCutThreshold)) };
  const response = await postJson(SCENE_CUT_ROUTES.start(itemId), body);
  if (response.status === 403) throw new SceneCutForbiddenError();
  if (response.status === 409) throw new SceneCutAlreadyRunningError();
  if (!response.ok)
    throw new Error(await responseMessage(response, 'Could not start scene detection'));
  const job = parseSceneCutJob(await response.json());
  if (!job) throw new Error('Scene detection did not return a job');
  return job;
}

export async function fetchSceneCutJob(
  jobId: string,
  signal?: AbortSignal
): Promise<SceneCutJob | null> {
  const response = await send(SCENE_CUT_ROUTES.job(jobId), { signal });
  if (response.status === 404) return null;
  if (response.status === 403) throw new SceneCutForbiddenError();
  if (!response.ok)
    throw new Error(await responseMessage(response, 'Could not read scene detection progress'));
  const job = parseSceneCutJob(await response.json());
  if (!job) throw new Error('Scene detection progress was not a job');
  return job;
}

export async function fetchKeyframeGeneration(
  jobId: string,
  afterSequence: number
): Promise<GenerationJob> {
  const query = new URLSearchParams({ afterSequence: String(afterSequence) });
  const response = await send(
    `/OpenLightFX/Studio/Generation/${encodeURIComponent(jobId)}?${query}`
  );
  if (!response.ok)
    throw new Error(await responseMessage(response, 'Could not read generation progress'));
  return response.json();
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.message === 'string') return body.message;
    if (typeof body?.Message === 'string') return body.Message;
    if (typeof body?.error === 'string') return body.error;
    return fallback;
  } catch {
    return fallback;
  }
}
