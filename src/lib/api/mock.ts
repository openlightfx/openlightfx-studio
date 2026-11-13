import fs from 'node:fs';
import path from 'node:path';
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

const GROWING_FILE = path.join(process.cwd(), 'static/media/growing-proxy.mp4');
let growingStarted = 0;
let growingBoxes: number[] | null = null;

function growingBoxEnds(): number[] {
  if (growingBoxes) return growingBoxes;
  if (!fs.existsSync(GROWING_FILE)) return [];
  const data = fs.readFileSync(GROWING_FILE);
  const ends: number[] = [];
  let offset = 0;
  while (offset + 8 <= data.length) {
    const box = data.readUInt32BE(offset);
    if (box < 8 || offset + box > data.length) break;
    offset += box;
    ends.push(offset);
  }
  growingBoxes = ends;
  return ends;
}

function growingProgress(): { revealed: number; size: number; throughMs: number; ready: boolean } {
  const ends = growingBoxEnds();
  const size = ends.length > 0 ? ends[ends.length - 1] : 0;
  // Whole boxes only. Two fragments immediately, then a short burst so the
  // video element starts, then one box every 4s. Chromium and Firefox share
  // this process and the later browser must still see state building.
  const head = Math.min(5, Math.max(0, ends.length - 1));
  const burst = Math.min(ends.length - 1, 14);
  if (!growingStarted) growingStarted = Date.now();
  const elapsed = Date.now() - growingStarted;
  const burstMs = Math.max(0, burst - head) * 150;
  let index = head;
  if (elapsed < burstMs) index = Math.min(burst, head + Math.floor(elapsed / 150));
  else index = Math.min(ends.length - 1, burst + Math.floor((elapsed - burstMs) / 4000));
  const revealed = ends.length > 0 ? ends[Math.max(0, index)] : 0;
  const ready = size > 0 && revealed >= size;
  return { revealed, size, throughMs: ready ? 10_000 : Math.floor((revealed / Math.max(size, 1)) * 10_000), ready };
}

function growingProxy(): MediaInfo['proxy'] {
  const progress = growingProgress();
  return {
    state: progress.ready ? 'ready' : 'building',
    encodedThroughMs: progress.throughMs,
    fps: 24,
    keyframeIntervalMs: 500,
    width: 320,
    height: 240,
    editUrl: '/media/proxy/growing',
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
remember('building-track', strip(newTrackFromMovie('44', 'Building Proxy', 10000)));
remember('broken-track', strip(newTrackFromMovie('46', 'Broken Proxy', 10000)));
remember('failed-track', strip(newTrackFromMovie('49', 'Failed Proxy', 10000)));
remember('nosample-track', strip(newTrackFromMovie('47', 'No Frame', 10000)));
remember('conflict', strip(newTrackFromMovie('48', 'Conflict', 10000)));
remember('alpha', strip(newTrackFromMovie('43', 'Alpha', 10000)));
remember('beta', strip(newTrackFromMovie('43', 'Beta', 10000)));

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
    itemId: '43',
    name: 'Two Tracks',
    year: 2019,
    runtimeMs: 10000,
    tracks: [summary('alpha', 'Alpha', '43'), summary('beta', 'Beta', '43')],
    info: infoFor(10000, readyProxy()),
    frameStatus: 200,
    saveStatus: 200,
  },
  {
    itemId: '44',
    name: 'Building Proxy',
    year: 2021,
    runtimeMs: 10000,
    tracks: [summary('building-track', 'Building Proxy', '44')],
    info: infoFor(10000, {
      state: 'building',
      encodedThroughMs: 0,
      fps: 24,
      keyframeIntervalMs: 500,
      width: 320,
      height: 240,
      editUrl: '/media/proxy/growing',
    }),
    frameStatus: 200,
    saveStatus: 200,
  },
  {
    itemId: '45',
    name: 'Unknown Duration',
    year: 2022,
    runtimeMs: 0,
    tracks: [],
    info: null,
    frameStatus: 404,
    saveStatus: 200,
  },
  {
    itemId: '46',
    name: 'Broken Proxy',
    year: 2023,
    runtimeMs: 10000,
    tracks: [summary('broken-track', 'Broken Proxy', '46')],
    info: infoFor(10000, readyProxy('/media/proxy/broken')),
    frameStatus: 200,
    saveStatus: 200,
  },
  {
    itemId: '47',
    name: 'No Frame',
    year: 2024,
    runtimeMs: 10000,
    tracks: [summary('nosample-track', 'No Frame', '47')],
    info: infoFor(10000, readyProxy()),
    frameStatus: 503,
    saveStatus: 200,
  },
  {
    itemId: '48',
    name: 'Conflict',
    year: 2018,
    runtimeMs: 10000,
    tracks: [summary('conflict', 'Conflict', '48')],
    info: infoFor(10000, readyProxy()),
    frameStatus: 200,
    saveStatus: 400,
  },
  {
    itemId: '49',
    name: 'Failed Proxy',
    year: 2017,
    runtimeMs: 10000,
    tracks: [summary('failed-track', 'Failed Proxy', '49')],
    info: infoFor(10000, {
      state: 'failed',
      reason: 'ffmpeg exited with code 1',
      encodedThroughMs: 0,
      fps: 24,
      keyframeIntervalMs: 500,
      width: 320,
      height: 240,
    }),
    frameStatus: 200,
    saveStatus: 200,
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

/** Emby internal ids are decimal. GUIDs are accepted. Titles are not item ids. */
const ITEM_ID = /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function rejectTitleId(raw: string | null): MockResult | null {
  if (raw == null || raw === '') return null;
  if (!ITEM_ID.test(decodeURIComponent(raw))) return text(404, 'not found');
  return null;
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

  const titled = rejectTitleId(url.searchParams.get('itemId'));
  if (titled) return titled;

  const admin = isAdmin(token);
  const itemMatch = path.match(/^\/OpenLightFX\/Studio\/Items\/([^/]+)\/(MediaInfo|Frame|Proxy)$/);
  if (itemMatch) {
    const titledItem = rejectTitleId(itemMatch[1]);
    if (titledItem) return titledItem;
  }
  if (itemMatch && method === 'GET' && itemMatch[2] === 'MediaInfo') {
    const item = CATALOG.find((entry) => entry.itemId === decodeURIComponent(itemMatch[1]));
    if (!item?.info) return text(404, 'not found');
    if (item.itemId === '44') return json(200, { ...item.info, proxy: growingProxy() });
    return json(200, item.info);
  }
  if (itemMatch && method === 'POST' && itemMatch[2] === 'Proxy') {
    const item = CATALOG.find((entry) => entry.itemId === decodeURIComponent(itemMatch[1]));
    if (!item?.info) return text(404, 'not found');
    if (!admin) return text(403, 'Admin is required');
    if (item.itemId === '49' && item.info.proxy.state === 'failed') {
      // The catalog stays failed so a parallel browser still sees the error.
      // The response is what this Studio applies immediately.
      return json(200, readyProxy());
    }
    if (item.itemId === '44') return json(200, growingProxy());
    return json(200, item.info.proxy);
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

export function serveGrowingProxy(req: IncomingMessage, res: ServerResponse): void {
  if (!fs.existsSync(GROWING_FILE)) {
    res.statusCode = 404;
    res.end('missing growing proxy');
    return;
  }
  const progress = growingProgress();
  const range = typeof req.headers.range === 'string' ? req.headers.range : '';
  const explicit = /bytes=(\d+)-(\d+)/.exec(range);
  if (explicit && progress.revealed > Number(explicit[2])) {
    const start = Number(explicit[1]);
    const end = Number(explicit[2]);
    const count = end - start + 1;
    const buf = Buffer.alloc(count);
    const fd = fs.openSync(GROWING_FILE, 'r');
    fs.readSync(fd, buf, 0, count, start);
    fs.closeSync(fd);
    res.writeHead(206, {
      'content-type': 'video/mp4',
      'content-range': `bytes ${start}-${end}/${progress.revealed}`,
      'content-length': String(count),
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    });
    res.end(buf);
    return;
  }
  // Open-ended: stay open and append. A finished Content-Length makes the
  // video element treat the current byte as the end of the movie.
  res.writeHead(200, {
    'content-type': 'video/mp4',
    'cache-control': 'no-store',
  });
  const fd = fs.openSync(GROWING_FILE, 'r');
  let sent = 0;
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    try { fs.closeSync(fd); } catch { /* already closed */ }
  };
  const pump = () => {
    if (closed || res.writableEnded) return;
    const now = growingProgress();
    if (now.revealed > sent) {
      const buf = Buffer.alloc(now.revealed - sent);
      const n = fs.readSync(fd, buf, 0, buf.length, sent);
      if (n > 0) {
        res.write(buf.subarray(0, n));
        sent += n;
      }
    }
    if (sent >= now.size && now.ready) {
      finish();
      res.end();
      return;
    }
    setTimeout(pump, 80);
  };
  res.on('close', finish);
  pump();
}

export function mockMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const raw = req.url ?? '';
  const urlPath = raw.split('?')[0] ?? '';
  if (urlPath === '/media/proxy/growing') {
    serveGrowingProxy(req, res);
    return;
  }
  if (!urlPath.startsWith('/OpenLightFX/') && urlPath !== '/media/proxy/broken') {
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
