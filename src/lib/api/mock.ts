import type { IncomingMessage, ServerResponse } from 'node:http';
import { encodeTrack, newTrackFromMovie, type Track } from '../domain/index';
import type { Bulb, LibraryItem, MediaInfo, StudioSettings, TrackSummary } from './types';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

interface CatalogItem extends LibraryItem {
  tracks: TrackSummary[];
  info: MediaInfo | null;
  frameStatus: number;
  saveStatus: number;
}

function keyframe(
  id: string,
  channelId: string,
  timestampMs: number,
  color: { r: number; g: number; b: number },
  brightness: number
): Track['keyframes'][number] {
  return {
    id,
    channelId,
    timestampMs,
    colorMode: 'RGB',
    color,
    colorTemperature: 0,
    brightness,
    transitionMs: 0,
    interpolation: 'STEP',
    powerOn: false,
  };
}

function strip(track: Track & { itemId?: string }): Track {
  const { itemId: _item, ...rest } = track;
  return rest;
}

function proxyFixture(): Track {
  const created = strip(newTrackFromMovie('42', 'Proxy Fixture', 10000));
  created.keyframes = [
    keyframe('l0', 'left', 0, { r: 255, g: 0, b: 0 }, 0),
    keyframe('l1', 'left', 200, { r: 255, g: 0, b: 0 }, 100),
    keyframe('l2', 'left', 1250, { r: 255, g: 0, b: 0 }, 100),
    keyframe('r0', 'right', 500, { r: 0, g: 0, b: 255 }, 40),
    keyframe('r1', 'right', 2000, { r: 0, g: 0, b: 255 }, 80),
    keyframe('r2', 'right', 3000, { r: 0, g: 0, b: 255 }, 10),
  ];
  return created;
}

function readyProxy(url = '/media/clip-a-h264.mp4'): MediaInfo['proxy'] {
  return {
    state: 'ready',
    encodedThroughMs: 10000,
    fps: 24,
    keyframeIntervalMs: 500,
    width: 320,
    height: 240,
    editUrl: url,
  };
}

function infoFor(runtimeMs: number, proxy: MediaInfo['proxy']): MediaInfo {
  return {
    runtimeMs,
    width: 320,
    height: 240,
    videoCodec: 'h264',
    hdr: false,
    colorTransfer: 'bt709',
    audioCodec: 'aac',
    proxy,
  };
}

function stamp(trackId: string): string {
  return updatedAt.get(trackId) ?? new Date(0).toISOString().replace(/Z$/, '.0000000Z');
}

function summary(trackId: string, title: string, itemId: string): TrackSummary {
  return { trackId, title, itemId, updatedAt: stamp(trackId) };
}

const stored = new Map<string, Buffer>();
const updatedAt = new Map<string, string>();

function remember(trackId: string, track: Track, when = '2026-01-01T00:00:00.0000000Z'): void {
  stored.set(trackId, Buffer.from(encodeTrack(track)));
  updatedAt.set(trackId, when);
}

remember('proxy-fixture', proxyFixture());
remember('building-track', strip(newTrackFromMovie('building', 'Building Proxy', 10000)));
remember('broken-track', strip(newTrackFromMovie('broken', 'Broken Proxy', 10000)));
remember('nosample-track', strip(newTrackFromMovie('nosample', 'No Frame', 10000)));
remember('conflict', strip(newTrackFromMovie('conflict', 'Conflict', 10000)));
remember('alpha', strip(newTrackFromMovie('two', 'Alpha', 10000)));
remember('beta', strip(newTrackFromMovie('two', 'Beta', 10000)));

const CATALOG: CatalogItem[] = [
  {
    itemId: '42',
    name: 'Proxy Fixture',
    year: 2020,
    runtimeMs: 10000,
    tracks: [summary('proxy-fixture', 'Proxy Fixture', '42')],
    info: infoFor(10000, readyProxy()),
    frameStatus: 200,
    saveStatus: 200,
  },
  {
    itemId: 'two',
    name: 'Two Tracks',
    year: 2019,
    runtimeMs: 10000,
    tracks: [summary('alpha', 'Alpha', 'two'), summary('beta', 'Beta', 'two')],
    info: infoFor(10000, readyProxy()),
    frameStatus: 200,
    saveStatus: 200,
  },
  {
    itemId: 'building',
    name: 'Building Proxy',
    year: 2021,
    runtimeMs: 10000,
    tracks: [summary('building-track', 'Building Proxy', 'building')],
    info: infoFor(10000, {
      state: 'building',
      encodedThroughMs: 0,
      fps: 24,
      keyframeIntervalMs: 500,
      width: 320,
      height: 240,
    }),
    frameStatus: 200,
    saveStatus: 200,
  },
  {
    itemId: 'zero',
    name: 'Unknown Duration',
    year: 2022,
    runtimeMs: 0,
    tracks: [],
    info: null,
    frameStatus: 404,
    saveStatus: 200,
  },
  {
    itemId: 'broken',
    name: 'Broken Proxy',
    year: 2023,
    runtimeMs: 10000,
    tracks: [summary('broken-track', 'Broken Proxy', 'broken')],
    info: infoFor(10000, readyProxy('/media/proxy/broken')),
    frameStatus: 200,
    saveStatus: 200,
  },
  {
    itemId: 'nosample',
    name: 'No Frame',
    year: 2024,
    runtimeMs: 10000,
    tracks: [summary('nosample-track', 'No Frame', 'nosample')],
    info: infoFor(10000, readyProxy()),
    frameStatus: 503,
    saveStatus: 200,
  },
  {
    itemId: 'conflict',
    name: 'Conflict',
    year: 2018,
    runtimeMs: 10000,
    tracks: [summary('conflict', 'Conflict', 'conflict')],
    info: infoFor(10000, readyProxy()),
    frameStatus: 200,
    saveStatus: 400,
  },
];

const BULBS: Bulb[] = [];

const SETTINGS: StudioSettings = {
  photosensitivityMode: true,
  mappingProfile: {},
};

const projects = new Map<string, string>();

function tokenOf(url: URL, req: IncomingMessage): string {
  const header = req.headers['x-emby-token'];
  if (typeof header === 'string' && header) return header;
  return url.searchParams.get('api_key') ?? '';
}

function isAdmin(token: string): boolean {
  return token !== 'viewer' && token !== 'not-an-admin';
}

interface MockResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer | string;
}

function json(status: number, body: unknown): MockResult {
  return { status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

function text(status: number, body: string, headers: Record<string, string> = { 'content-type': 'text/plain' }): MockResult {
  return { status, headers, body };
}

export function handleMock(
  method: string,
  rawUrl: string,
  body: Buffer,
  token: string,
  ifMatch = ''
): MockResult | null {
  const url = new URL(rawUrl, 'http://studio.local');
  const path = url.pathname;
  if (path === '/media/proxy/broken') return text(500, 'proxy failed');
  if (!path.startsWith('/OpenLightFX/')) return null;

  const admin = isAdmin(token);
  const itemMatch = path.match(/^\/OpenLightFX\/Studio\/Items\/([^/]+)\/(MediaInfo|Frame|Proxy)$/);
  if (itemMatch && method === 'GET' && itemMatch[2] === 'MediaInfo') {
    const item = CATALOG.find((entry) => entry.itemId === decodeURIComponent(itemMatch[1]));
    if (!item?.info) return text(404, 'not found');
    return json(200, item.info);
  }
  if (itemMatch && method === 'GET' && itemMatch[2] === 'Frame') {
    const item = CATALOG.find((entry) => entry.itemId === decodeURIComponent(itemMatch[1]));
    if (!item) return text(404, 'not found');
    if (!admin) return text(403, 'Admin is required');
    if (item.frameStatus !== 200) return text(item.frameStatus, 'frame unavailable');
    const timeMs = url.searchParams.get('timeMs') ?? '0';
    return {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'X-OpenLightFX-Tone-Map': 'none',
        'X-OpenLightFX-Source-Time-Ms': timeMs,
      },
      body: PNG,
    };
  }
  if (itemMatch && method === 'POST' && itemMatch[2] === 'Proxy') {
    const item = CATALOG.find((entry) => entry.itemId === decodeURIComponent(itemMatch[1]));
    if (!item?.info) return text(404, 'not found');
    return json(200, { ...item.info.proxy, editUrl: item.info.proxy.editUrl ?? '/media/clip-a-h264.mp4' });
  }

  if (path === '/OpenLightFX/Studio/Items' && method === 'GET') {
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
    const items = CATALOG.filter((item) => !search || item.name.toLowerCase().includes(search))
      .slice(0, 200)
      .map(({ itemId, name, year, runtimeMs }) => ({ itemId, name, year, runtimeMs }));
    return json(200, items);
  }
  if (path === '/OpenLightFX/Studio/Bulbs' && method === 'GET') return json(200, BULBS);
  if (path === '/OpenLightFX/Settings' && method === 'GET') return json(200, SETTINGS);
  if (path === '/OpenLightFX/Studio/Tracks' && method === 'GET') {
    const item = CATALOG.find((entry) => entry.itemId === (url.searchParams.get('itemId') ?? ''));
    return json(200, item?.tracks ?? []);
  }
  if (path === '/OpenLightFX/Tracks/ByItem' && method === 'GET') {
    const itemId = url.searchParams.get('itemId') ?? '';
    const item = CATALOG.find((entry) => entry.itemId === itemId);
    const track = item?.tracks[0];
    return json(200, track ? { itemId, trackPath: `lightfx/${track.trackId}.lightfx` } : { itemId });
  }

  const trackMatch = path.match(/^\/OpenLightFX\/Studio\/Tracks\/([^/]+)$/);
  if (trackMatch && method === 'GET') {
    const trackId = decodeURIComponent(trackMatch[1]);
    const bytes = stored.get(trackId);
    if (!bytes) return text(404, 'not found');
    return { status: 200, headers: { 'content-type': 'application/octet-stream' }, body: bytes };
  }
  if (trackMatch && method === 'PUT') {
    if (!admin) return text(403, 'Admin is required');
    const trackId = decodeURIComponent(trackMatch[1]);
    const item = CATALOG.find((entry) => entry.itemId === (url.searchParams.get('itemId') ?? ''));
    if (item?.saveStatus === 400) return text(400, 'V-004: Duration must be > 0');
    const exists = stored.has(trackId);
    const presented = ifMatch.trim().replace(/^"|"$/g, '');
    const tokenNow = stamp(trackId);
    if (exists && presented !== tokenNow) {
      return text(409, `conflict: the server track was updated at ${tokenNow}. Send If-Match with that updatedAt.`);
    }
    stored.set(trackId, body);
    const next = new Date().toISOString().replace(/Z$/, '.0000000Z');
    updatedAt.set(trackId, next);
    if (item && !item.tracks.some((track) => track.trackId === trackId)) {
      item.tracks.push(summary(trackId, trackId, item.itemId));
    }
    return json(200, { trackId, title: trackId, itemId: item?.itemId ?? '', updatedAt: next });
  }

  const projectMatch = path.match(/^\/OpenLightFX\/Studio\/Projects\/([^/]+)$/);
  if (projectMatch && method === 'PUT') {
    if (!admin) return text(403, 'Admin is required');
    const key = `${url.searchParams.get('itemId') ?? ''}:${decodeURIComponent(projectMatch[1])}`;
    projects.set(key, body.toString('utf8'));
    return json(200, { ok: true });
  }
  if (projectMatch && method === 'GET') {
    const key = `${url.searchParams.get('itemId') ?? ''}:${decodeURIComponent(projectMatch[1])}`;
    const saved = projects.get(key);
    if (!saved) return text(404, 'not found');
    return text(200, saved, { 'content-type': 'application/json' });
  }
  if (path === '/OpenLightFX/Tracks/Select' && method === 'POST') {
    if (!admin) return text(403, 'Admin is required');
    return json(200, { ok: true });
  }
  if (path === '/OpenLightFX/Studio/Preview/Start' && method === 'POST') {
    if (!admin) return text(403, 'Admin is required');
    return text(409, 'playback_active');
  }
  if (path === '/OpenLightFX/Studio/Preview/Stop' && method === 'POST') return json(200, { ok: true });
  if (path === '/OpenLightFX/Studio/Preview/Frame' && method === 'POST') return json(200, { ok: true });
  return text(404, 'not found');
}

export function mockMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const raw = req.url ?? '';
  const path = raw.split('?')[0] ?? '';
  if (!path.startsWith('/OpenLightFX/') && path !== '/media/proxy/broken') {
    next();
    return;
  }
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    const header = req.headers['if-match'];
    const ifMatch = Array.isArray(header) ? header[0] ?? '' : header ?? '';
    const result = handleMock(
      req.method ?? 'GET',
      raw,
      Buffer.concat(chunks),
      tokenOf(new URL(raw, 'http://studio.local'), req),
      ifMatch
    );
    if (!result) {
      next();
      return;
    }
    res.statusCode = result.status;
    for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
    res.end(result.body);
  });
}
