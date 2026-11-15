import { expect, type Page } from '@playwright/test';
import {
  blackKeyframe,
  decodeTrack,
  encodeTrack,
  newTrackFromMovie,
  type Track,
} from '../../src/lib/domain';

/** Stateful plugin contract fixture. Video is the generated H.264 edit proxy, never a file-picker path. */
export async function installBackend(
  page: Page,
  options: {
    empty?: boolean;
    durationMs?: number;
    layout?: string;
    rooms?: any[];
    admin?: boolean;
    newTrack?: boolean;
    keyframeCount?: number;
  } = {}
) {
  const duration = options.durationMs ?? 10000;
  const track = newTrackFromMovie('42', 'Proxy Fixture', duration, options.layout);
  if (!options.empty)
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
      timestampMs:
        (Math.floor(index / track.channels.length) * duration) /
        Math.ceil(count / track.channels.length),
      color: { r: index % 256, g: (index * 3) % 256, b: (index * 7) % 256 },
      brightness: 100,
    }));
  }
  const state = {
    track: track as Track,
    items: [
      { itemId: '42', name: 'Proxy Fixture', year: 2020, runtimeMs: duration, posterUrl: '' },
    ],
    media: {
      runtimeMs: duration,
      width: 320,
      height: 180,
      videoCodec: 'h264',
      hdr: false,
      colorTransfer: 'bt709',
      audioCodec: 'aac',
      proxy: {
        state: 'ready',
        encodedThroughMs: duration,
        fps: 24,
        keyframeIntervalMs: 500,
        width: 320,
        height: 180,
        editUrl: '/media/clip-a-h264.mp4',
        reason: '',
      },
    },
    rooms: options.rooms ?? [],
    admin: options.admin ?? true,
    updatedAt: '2020-01-01T00:00:00Z',
    writes: [] as Track[],
    projects: [] as any[],
    saveError: null as { status: number; message: string } | null,
    frameError: false,
    previewFrames: [] as any[],
    previewStarts: [] as any[],
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
  await page.route('**/OpenLightFX/Studio/Bulbs', (route) =>
    route.fulfill({
      json: [
        { id: 'lamp-left', name: 'Desk lamp', position: 'left' },
        { id: 'lamp-right', name: 'Floor lamp', position: 'right' },
      ],
    })
  );
  await page.route('**/OpenLightFX/Studio/Rooms/*/Routing', (route) =>
    route.fulfill({
      json: {
        channels: [
          { channelId: 'left', position: 'left', bulbIds: ['lamp-left'], foldedInto: [] },
          { channelId: 'right', position: 'right', bulbIds: ['lamp-right'], foldedInto: [] },
        ],
        bulbs: [],
      },
    })
  );
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
  await page.route('**/OpenLightFX/Studio/Tracks?*', (route) =>
    route.fulfill({
      json: options.newTrack
        ? []
        : [
            {
              trackId: 'proxy-fixture',
              itemId: '42',
              title: state.track.metadata.title,
              updatedAt: state.updatedAt,
              channelCount: state.track.channels.length,
              keyframeCount: state.track.keyframes.length,
              path: 'lightfx/proxy-fixture.lightfx',
            },
          ],
    })
  );
  await page.route('**/OpenLightFX/Studio/Tracks/*', (route) => {
    if (route.request().method() === 'PUT') {
      if (state.saveError)
        return route.fulfill({
          status: state.saveError.status,
          json: { message: state.saveError.message },
        });
      if (!state.admin)
        return route.fulfill({
          status: 403,
          json: { message: 'Only an Emby administrator can save' },
        });
      state.track = decodeTrack(route.request().postDataBuffer()!);
      state.writes.push(structuredClone(state.track));
      state.updatedAt = new Date(Date.now() + state.writes.length).toISOString();
      return route.fulfill({ json: { trackId: 'proxy-fixture', updatedAt: state.updatedAt } });
    }
    return route.fulfill({
      contentType: 'application/octet-stream',
      body: Buffer.from(encodeTrack(state.track)),
    });
  });
  await page.route('**/OpenLightFX/Studio/Projects/*', (route) => {
    if (route.request().method() === 'PUT') state.projects.push(route.request().postDataJSON());
    return route.fulfill({ json: {} });
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

export async function openFixtureEditor(
  page: Page,
  options: Parameters<typeof installBackend>[1] = {}
) {
  const backend = await installBackend(page, options);
  await page.goto(
    `/emby/OpenLightFX/studio/?api_key=browser-test#/edit/42/${options.newTrack ? 'new' : 'proxy-fixture'}`
  );
  await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
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
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  await expect
    .poll(async () =>
      Math.abs(Number(await ruler.getAttribute('aria-valuenow')) - fraction * 10000)
    )
    .toBeLessThanOrEqual(42);
}
export async function reloadWithUnsaved(page: Page) {
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
}
