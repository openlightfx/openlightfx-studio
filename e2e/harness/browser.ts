import { expect, type Page, type Route } from '@playwright/test';
import {
  blackKeyframe,
  decodeTrack,
  encodeTrack,
  newTrackFromMovie,
  type ProjectSidecar,
  type Track,
} from '../../src/lib/domain';
import type { LibraryItem, MediaInfo } from '../../src/lib/api/types';
import type { Position, RoomRouting } from '../../src/lib/api/rooms';
import { SHORT_PLAYABLE_MEDIA } from '../fixtures/editor';

export type FixtureWriteResource = 'track' | 'project';
export interface FixtureWriteError {
  status: number;
  message: string;
}
export interface FixtureWriteAttempt {
  resource: FixtureWriteResource;
  trackId?: string;
  ifMatch?: string;
  snapshot: Track | ProjectSidecar;
  outcome: 'received' | 'gated' | 'written' | 'failed' | 'stale' | 'forbidden';
  status?: number;
}
export interface BrowserBackendOptions {
  empty?: boolean;
  durationMs?: number;
  itemRuntimeMs?: number;
  fps?: number;
  layout?: string;
  track?: Track;
  sidecar?: ProjectSidecar;
  sidecarsByTrack?: Record<string, ProjectSidecar>;
  projectReadErrors?: { trackId?: string; status: number; message: string }[];
  media?: MediaInfo;
  routing?: RoomRouting;
  rooms?: any[];
  admin?: boolean;
  newTrack?: boolean;
  keyframeCount?: number;
  additionalTracks?: Record<string, Track>;
}

/** Stateful plugin contract fixture. Video is generated H.264 media, never a fake timer. */
export async function installBackend(page: Page, options: BrowserBackendOptions = {}) {
  const duration = options.durationMs ?? options.track?.metadata.durationMs ?? 10000;
  const track = options.track
    ? structuredClone(options.track)
    : newTrackFromMovie('42', 'Proxy Fixture', duration, options.layout);
  if (!options.track && !options.empty)
    track.keyframes = [
      {
        ...blackKeyframe('left'),
        id: 'left-red',
        timestampMs: 1000,
        color: { r: 255, g: 0, b: 0 },
        brightness: 100,
      },
      {
        ...blackKeyframe('right'),
        id: 'right-blue',
        timestampMs: 2000,
        color: { r: 0, g: 0, b: 255 },
        brightness: 40,
      },
      {
        ...blackKeyframe('left'),
        id: 'left-green',
        timestampMs: 6000,
        color: { r: 0, g: 255, b: 0 },
        brightness: 70,
      },
      {
        ...blackKeyframe('right'),
        id: 'right-white',
        timestampMs: 8000,
        color: { r: 255, g: 255, b: 255 },
        brightness: 20,
      },
    ];
  if (options.keyframeCount) {
    const count = options.keyframeCount;
    track.keyframes = Array.from({ length: count }, (_, index) => ({
      ...blackKeyframe(track.channels[index % track.channels.length].id),
      id: `large-${index}`,
      timestampMs: Math.round(
        (Math.floor(index / track.channels.length) * duration) /
          Math.ceil(count / track.channels.length)
      ),
      color: { r: index % 256, g: (index * 3) % 256, b: (index * 7) % 256 },
      brightness: 100,
    }));
  }
  const media = structuredClone(
    options.media ?? {
      ...SHORT_PLAYABLE_MEDIA,
      runtimeMs: duration,
      proxy: {
        ...SHORT_PLAYABLE_MEDIA.proxy,
        encodedThroughMs: duration,
      },
    }
  );
  if (options.fps !== undefined) media.proxy.fps = options.fps;
  const defaultBulbs = [
    { id: 'lamp-left', name: 'Desk lamp', position: 'left' },
    { id: 'lamp-right', name: 'Floor lamp', position: 'right' },
  ];
  const queues: Record<FixtureWriteResource, { promise: Promise<void>; release: () => void }[]> = {
    track: [],
    project: [],
  };
  const errors: Record<FixtureWriteResource, FixtureWriteError[]> = { track: [], project: [] };
  const state = {
    track: track as Track,
    items: [
      {
        itemId: '42',
        name: 'Proxy Fixture',
        year: 2020,
        runtimeMs: options.itemRuntimeMs ?? options.durationMs ?? media.runtimeMs,
        posterUrl: '',
      } satisfies LibraryItem,
    ],
    media,
    rooms: options.rooms ?? [],
    bulbs: defaultBulbs,
    routing: options.routing ? structuredClone(options.routing) : null,
    admin: options.admin ?? true,
    updatedAt: '2020-01-01T00:00:00Z',
    writes: [] as Track[],
    additionalTracks: Object.fromEntries(
      Object.entries(options.additionalTracks ?? {}).map(([trackId, track]) => [
        trackId,
        { track: structuredClone(track), updatedAt: '2020-01-02T00:00:00Z' },
      ])
    ) as Record<string, { track: Track; updatedAt: string }>,
    projects: [] as ProjectSidecar[],
    sidecar: options.sidecar ? structuredClone(options.sidecar) : null,
    sidecarsByTrack: structuredClone(options.sidecarsByTrack ?? {}),
    projectReadErrors: structuredClone(options.projectReadErrors ?? []),
    projectReadAttempts: [] as { itemId: string; trackId: string }[],
    projectReadGates: [] as { trackId?: string; promise: Promise<void>; release: () => void }[],
    gateProjectRead(trackId?: string) {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      state.projectReadGates.push({ trackId, promise, release });
      return release;
    },
    writeAttempts: [] as FixtureWriteAttempt[],
    saveError: null as FixtureWriteError | null,
    projectError: null as FixtureWriteError | null,
    frameError: false,
    previewFrames: [] as any[],
    previewStarts: [] as any[],
    gateNextWrite(resource: FixtureWriteResource) {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      queues[resource].push({ promise, release });
      return release;
    },
    failNextWrite(resource: FixtureWriteResource, error: FixtureWriteError) {
      errors[resource].push(structuredClone(error));
    },
  };

  const completeWrite = async (
    resource: FixtureWriteResource,
    snapshot: Track | ProjectSidecar,
    ifMatch: string | undefined,
    route: Route,
    trackId?: string
  ) => {
    const attempt: FixtureWriteAttempt = {
      resource,
      trackId,
      ifMatch,
      snapshot: structuredClone(snapshot),
      outcome: 'received',
    };
    state.writeAttempts.push(attempt);
    const gate = queues[resource].shift();
    if (gate) {
      attempt.outcome = 'gated';
      await gate.promise;
    }

    const currentTrackToken = trackId
      ? (state.additionalTracks[trackId]?.updatedAt ?? state.updatedAt)
      : state.updatedAt;
    if (resource === 'track' && ifMatch && ifMatch !== currentTrackToken) {
      attempt.outcome = 'stale';
      attempt.status = 409;
      return route.fulfill({ status: 409, json: { message: 'The track changed on the server.' } });
    }

    const configuredError = errors[resource].shift();
    const persistentError = resource === 'track' ? state.saveError : state.projectError;
    const error = configuredError ?? persistentError;
    if (error) {
      attempt.outcome = 'failed';
      attempt.status = error.status;
      return route.fulfill({ status: error.status, json: { message: error.message } });
    }
    if (resource === 'track' && !state.admin) {
      attempt.outcome = 'forbidden';
      attempt.status = 403;
      return route.fulfill({
        status: 403,
        json: { message: 'Only an Emby administrator can save' },
      });
    }

    attempt.outcome = 'written';
    attempt.status = 200;
    if (resource === 'track') {
      const saved = structuredClone(snapshot as Track);
      if (!trackId || trackId === 'proxy-fixture') {
        state.track = saved;
        state.writes.push(saved);
        state.updatedAt = new Date(
          Date.parse('2020-01-01T00:00:00Z') + state.writes.length
        ).toISOString();
        return route.fulfill({ json: { trackId: 'proxy-fixture', updatedAt: state.updatedAt } });
      }
      const updatedAt = new Date(
        Date.parse('2020-01-02T00:00:00Z') + Object.keys(state.additionalTracks).length
      ).toISOString();
      state.additionalTracks[trackId] = { track: saved, updatedAt };
      return route.fulfill({ json: { trackId, updatedAt } });
    }
    attempt.status = 204;
    const sidecar = structuredClone(snapshot as ProjectSidecar);
    state.sidecar = sidecar;
    state.sidecarsByTrack[trackId ?? sidecar.trackId] = sidecar;
    state.projects.push(structuredClone(sidecar));
    return route.fulfill({ status: 204, body: '' });
  };

  await page.route('**/OpenLightFX/Studio/Session', (route) =>
    route.fulfill({ json: { accessToken: 'browser-test' } })
  );
  await page.route('**/OpenLightFX/Settings', (route) =>
    route.fulfill({ json: { photosensitivityMode: false } })
  );
  await page.route('**/OpenLightFX/Studio/Setup', (route) =>
    route.fulfill({
      json: { roomCount: state.rooms.length, isAdmin: state.admin, serverName: 'Browser fixture' },
    })
  );
  await page.route('**/OpenLightFX/Studio/CanManageRooms', (route) =>
    route.fulfill({ status: state.admin ? 200 : 403, json: { canManageRooms: state.admin } })
  );
  await page.route('**/OpenLightFX/Studio/Rooms', (route) => route.fulfill({ json: state.rooms }));
  await page.route('**/OpenLightFX/Studio/Bulbs', (route) => route.fulfill({ json: state.bulbs }));
  await page.route('**/OpenLightFX/Studio/Rooms/*/Routing', (route) => {
    if (state.routing) return route.fulfill({ json: structuredClone(state.routing) });
    const requested = (route.request().postDataJSON().channels ?? []) as {
      id: string;
      spatialHint: string;
    }[];
    return route.fulfill({
      json: {
        channels: requested.map((channel) => {
          const position = channel.spatialHint
            .replace('SPATIAL_', '')
            .toLowerCase()
            .replaceAll('_', '-') as Position;
          return {
            channelId: channel.id,
            position,
            bulbIds: state.bulbs
              .filter((bulb) => bulb.position === position)
              .map((bulb) => bulb.id),
            foldedInto: [],
          };
        }),
        bulbs: [],
      },
    });
  });
  await page.route('**/OpenLightFX/Studio/Items?*', (route) => {
    const search = new URL(route.request().url()).searchParams.get('search')?.toLowerCase() ?? '';
    return route.fulfill({
      json: state.items.filter((item) => item.name.toLowerCase().includes(search)),
    });
  });
  await page.route('**/OpenLightFX/Studio/Items/42/MediaInfo', (route) =>
    route.fulfill({ json: state.media })
  );
  await page.route('**/OpenLightFX/Studio/Items/42/Proxy', (route) => {
    state.media.proxy.state = 'ready';
    state.media.proxy.reason = '';
    return route.fulfill({ json: state.media.proxy });
  });
  await page.route('**/OpenLightFX/Studio/Items/42/Frame?*', (route) =>
    state.frameError
      ? route.fulfill({ status: 500, json: { message: 'The frame could not be sampled' } })
      : route.fulfill({ status: 404, body: 'Frame fixture not configured' })
  );
  await page.route('**/OpenLightFX/Studio/Tracks?*', (route) => {
    const summaries = Object.entries(state.additionalTracks).map(([trackId, value]) => ({
      trackId,
      itemId: '42',
      title: value.track.metadata.title,
      updatedAt: value.updatedAt,
      channelCount: value.track.channels.length,
      keyframeCount: value.track.keyframes.length,
      path: `lightfx/${trackId}.lightfx`,
    }));
    if (!options.newTrack)
      summaries.unshift({
        trackId: 'proxy-fixture',
        itemId: '42',
        title: state.track.metadata.title,
        updatedAt: state.updatedAt,
        channelCount: state.track.channels.length,
        keyframeCount: state.track.keyframes.length,
        path: 'lightfx/proxy-fixture.lightfx',
      });
    return route.fulfill({ json: summaries });
  });
  await page.route('**/OpenLightFX/Studio/Tracks/*', async (route) => {
    if (route.request().method() === 'PUT') {
      const submitted = decodeTrack(route.request().postDataBuffer()!);
      const trackId = new URL(route.request().url()).pathname.split('/').at(-1);
      return completeWrite(
        'track',
        submitted,
        route.request().headers()['if-match'],
        route,
        trackId
      );
    }
    const trackId = new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
    const saved = state.additionalTracks[trackId]?.track ?? state.track;
    return route.fulfill({
      contentType: 'application/octet-stream',
      body: Buffer.from(encodeTrack(saved)),
    });
  });
  await page.route('**/OpenLightFX/Studio/Projects/*', async (route) => {
    if (route.request().method() === 'PUT') {
      const submitted = route.request().postDataJSON() as ProjectSidecar;
      const trackId = new URL(route.request().url()).pathname.split('/').at(-1);
      return completeWrite('project', submitted, undefined, route, trackId);
    }
    const url = new URL(route.request().url());
    const trackId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
    const itemId = url.searchParams.get('itemId') ?? '';
    state.projectReadAttempts.push({ itemId, trackId });
    const gateIndex = state.projectReadGates.findIndex(
      (gate) => !gate.trackId || gate.trackId === trackId
    );
    if (gateIndex >= 0) {
      const [gate] = state.projectReadGates.splice(gateIndex, 1);
      await gate.promise;
    }
    const errorIndex = state.projectReadErrors.findIndex(
      (error) => !error.trackId || error.trackId === trackId
    );
    if (errorIndex >= 0) {
      const [error] = state.projectReadErrors.splice(errorIndex, 1);
      return route.fulfill({ status: error.status, body: error.message });
    }
    const stored =
      state.sidecarsByTrack[trackId] ??
      (state.sidecar?.trackId === trackId && state.sidecar.itemId === itemId
        ? state.sidecar
        : null);
    if (!stored) return route.fulfill({ status: 404, body: 'Project sidecar not found' });
    return route.fulfill({ json: structuredClone(stored) });
  });
  await page.route('**/OpenLightFX/Studio/Preview/Start', (route) => {
    state.previewStarts.push(route.request().postDataJSON());
    return route.fulfill({ json: { active: true } });
  });
  await page.route('**/OpenLightFX/Studio/Preview/Frame', (route) => {
    state.previewFrames.push(route.request().postDataJSON());
    return route.fulfill({ json: { active: true } });
  });
  await page.route('**/OpenLightFX/Studio/Preview/Stop', (route) => route.fulfill({ json: {} }));
  return state;
}

export async function openFixtureEditor(page: Page, options: BrowserBackendOptions = {}) {
  const backend = await installBackend(page, options);
  await page.goto(
    `/emby/OpenLightFX/studio/?api_key=browser-test#/edit/42/${options.newTrack ? 'new' : 'proxy-fixture'}`
  );
  await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
  const playButton = page.getByRole('button', { name: 'Play', exact: true });
  if (backend.media.proxy.state === 'failed') await expect(playButton).toBeDisabled();
  else await expect(playButton).toBeEnabled();
  return backend;
}
export async function menu(page: Page, group: string, item: string) {
  await page.getByRole('button', { name: group, exact: true }).click();
  await page.getByRole('menuitem', { name: new RegExp(item) }).click();
}
export async function lanePoint(
  page: Page,
  channel: string,
  fraction: number,
  button: 'left' | 'right' = 'left'
) {
  const box = (await page
    .locator('.lane-row')
    .filter({ hasText: channel })
    .locator('.lane')
    .boundingBox())!;
  await page.mouse.click(box.x + box.width * fraction, box.y + 19, { button });
}
export async function seekFraction(page: Page, fraction: number) {
  const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
  const box = (await ruler.boundingBox())!;
  const duration = Number(await ruler.getAttribute('aria-valuemax'));
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  await expect
    .poll(async () =>
      Math.abs(Number(await ruler.getAttribute('aria-valuenow')) - fraction * duration)
    )
    .toBeLessThanOrEqual(42);
}
export async function reloadWithUnsaved(page: Page) {
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
}
