import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { requirement } = await import(pathToFileURL(`${root}/e2e/harness/requirement.ts`).href);
const { decodeTrack, encodeTrack } = await import(
  pathToFileURL(`${root}/src/lib/domain/index.ts`).href
);
const { waitForObservation } = await import(
  pathToFileURL(`${root}/scripts/fullstack/observations.mjs`).href
);
const browser = process.env.OLFX_LAB_BROWSER ?? 'chromium';
if (!['chromium', 'firefox'].includes(browser)) throw new Error('Invalid browser');
test.use({ browserName: browser });
test.describe.configure({ mode: 'serial' });
const base = process.env.OLFX_EMBY_URL!;
const control = process.env.OLFX_SIMULATOR_CONTROL_URL!;
const headers = { 'X-Emby-Token': process.env.OLFX_API_KEY! };
let movie: any, room: any;
let screenToken = '';
const off = Object.fromEntries(
  ['left-bulb', 'center-bulb', 'right-bulb'].map((id) => [id, { power: false }])
);
async function get(request: APIRequestContext, path: string) {
  const response = await request.get(`${base}/OpenLightFX/Studio/${path}`, { headers });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function login(page: Page) {
  await page.goto(`${base}/web/index.html`);
  await page.getByText('admin', { exact: true }).click();
  await page.locator('input[type=password]').fill('openlightfx-test');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/#!\/home/, { timeout: 15000 });
}
async function create(page: Page, title: string, layout = '2.0') {
  await page.goto(`${base}/emby/OpenLightFX/studio/#/movie/${movie.itemId}`);
  await expect(page.getByRole('heading', { name: movie.name, exact: true })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: new RegExp(`^${layout.replace('.', '\\.')}`) }).click();
  await page.getByRole('button', { name: 'Create track', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
  await expect(page).not.toHaveURL(/api_key/);
}
async function fileMenu(page: Page, name: string) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
}
async function save(page: Page, request: APIRequestContext) {
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().includes('/Studio/Tracks/')
  );
  await fileMenu(page, '^Save');
  const saved = await response;
  expect(saved.ok()).toBeTruthy();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const info = await saved.json();
  const bytes = await request.get(
    `${base}/OpenLightFX/Studio/Tracks/${info.trackId}?itemId=${movie.itemId}`,
    { headers }
  );
  expect(bytes.ok()).toBeTruthy();
  return { ...info, bytes: await bytes.body(), track: decodeTrack(await bytes.body()) };
}
async function add(page: Page, name: string, fraction: number, hex: string, brightness: string) {
  const lane = page
    .locator('.lane-row')
    .filter({ has: page.locator('.lane-name', { hasText: new RegExp(`^${name}(?: —|$)`) }) })
    .locator('.lane');
  const box = (await lane.boundingBox())!;
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  await page.getByLabel('Hex', { exact: true }).fill(hex);
  await page.getByLabel('Brightness value').fill(brightness);
}
async function seek(page: Page, fraction: number) {
  const box = (await page.getByRole('slider', { name: 'Timeline ruler' }).boundingBox())!;
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
}
async function cursor(request: APIRequestContext) {
  const response = await request.get(`${control}/state`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).event_id;
}
function receipts() {
  return fs
    .readFileSync(process.env.OLFX_NDJSON!, 'utf8')
    .split('\n')
    .flatMap((line) => {
      try {
        const event = JSON.parse(line);
        return event.event === 'command_received' ? [event] : [];
      } catch {
        return [];
      }
    });
}

test.beforeAll(async ({ request }) => {
  if (process.env.OLFX_LAB !== '1' || !process.env.OLFX_MEDIA_DIR?.includes('/.emby-stack/labs/'))
    throw new Error('Isolated lab required');
  movie = (await get(request, 'Items')).find((item: any) => item.name === 'clip-a');
  expect(movie.runtimeMs).toBe(10000);
  for (const device of ['step4-screen', 'step4-second']) {
    const response = await request.post(`${base}/emby/Users/AuthenticateByName`, {
      headers: {
        'X-Emby-Authorization': `MediaBrowser Client="Step4", Device="Editor TV", DeviceId="${device}", Version="1.0"`,
      },
      data: { Username: 'admin', Pw: 'openlightfx-test' },
    });
    expect(response.ok()).toBeTruthy();
    if (device === 'step4-screen') screenToken = (await response.json()).AccessToken;
  }
});
test.beforeEach(async ({ page, request }) => {
  await request.post(`${base}/OpenLightFX/Studio/Preview/Stop`, { headers, data: {} });
  await request.post(`${control}/reset`);
  for (const current of await get(request, 'Rooms'))
    expect(
      (await request.delete(`${base}/OpenLightFX/Studio/Rooms/${current.id}`, { headers })).ok()
    ).toBeTruthy();
  const response = await request.post(`${base}/OpenLightFX/Studio/Rooms`, {
    headers,
    data: {
      name: 'Living Room',
      screenDeviceId: 'step4-screen',
      bulbs: [
        { id: 'left-bulb', position: 'left', follows: null },
        { id: 'center-bulb', position: 'center', follows: null },
        { id: 'right-bulb', position: 'right', follows: null },
      ],
    },
  });
  expect(response.ok()).toBeTruthy();
  room = await response.json();
  await login(page);
});
test.afterEach(async ({ request }) => {
  await request.post(`${base}/OpenLightFX/Studio/Preview/Stop`, { headers, data: {} });
  await waitForObservation(control, { after: await cursor(request), bulbs: off });
});

requirement(
  'MEDIA-016 @fullstack a fresh building proxy plays its first frames and a past-horizon seek waits then renders the requested frame',
  async ({ page }) => {
    await create(page, 'Step 4 building proxy');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled({
      timeout: 60000,
    });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const video = page.locator('video');
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0.1);
    const info = await page.request.get(
      `${base}/OpenLightFX/Studio/Items/${movie.itemId}/MediaInfo`,
      { headers }
    );
    expect((await info.json()).proxy.state).toBe('building');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await seek(page, 0.9);
    await expect(page.getByText(/Still encoding to/)).toBeVisible();
    await expect
      .poll(() => video.evaluate((node) => Math.abs((node as HTMLVideoElement).currentTime - 9)), {
        timeout: 60000,
      })
      .toBeLessThanOrEqual(0.042);
    expect(await video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true);
  }
);

requirement(
  'EDIT-001 @fullstack EDIT-002 EDIT-007 the real proxy renders intermediate scrub frames and transport steps skips plays and pauses',
  async ({ page }) => {
    await create(page, 'Step 4 transport');
    // Pointer-seek acceptance is measured in an encoded region, not past a building horizon.
    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `${base}/OpenLightFX/Studio/Items/${movie.itemId}/MediaInfo`,
            { headers }
          );
          expect(response.ok()).toBeTruthy();
          return (await response.json()).proxy.state;
        },
        { timeout: 60000 }
      )
      .toBe('ready');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled({
      timeout: 60000,
    });
    const video = page.locator('video');
    await video.evaluate((node) => {
      const video = node as HTMLVideoElement;
      const record = (_: number, metadata: VideoFrameCallbackMetadata) => {
        video.dataset.renderedTime = String(metadata.mediaTime);
        video.requestVideoFrameCallback(record);
      };
      video.requestVideoFrameCallback(record);
    });
    expect(await page.locator('video[controls]').count()).toBe(0);
    expect(await page.locator('[role=slider][aria-label="Timeline ruler"]').count()).toBe(1);
    await seek(page, 0.25);
    await expect
      .poll(() => video.evaluate((node) => Math.abs((node as HTMLVideoElement).currentTime - 2.5)))
      .toBeLessThanOrEqual(0.042);
    const box = (await page.getByRole('slider', { name: 'Timeline ruler' }).boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
    await page.mouse.down();
    for (const fraction of [0.15, 0.2]) {
      await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
      await expect
        .poll(() =>
          video
            .getAttribute('data-rendered-time')
            .then((value) => Math.abs(Number(value) - fraction * 10))
        )
        .toBeLessThan(0.1);
    }
    await page.mouse.up();
    await page.getByRole('button', { name: 'Skip forward 5 seconds' }).click();
    await expect
      .poll(() => video.evaluate((node) => Math.abs((node as HTMLVideoElement).currentTime - 7)))
      .toBeLessThan(0.1);
    await page.getByRole('button', { name: 'Previous frame' }).click();
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeLessThan(7);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).click();
    expect(await video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true);
  }
);

requirement(
  'PROP-004 @fullstack picking immediately before a cut matches the actually paused movie frame',
  async ({ page, request }) => {
    await create(page, 'Frame identity before a cut');
    await add(page, 'Left', 0.1, 'ffffff', '100');
    await expect
      .poll(async () => (await get(request, `Items/${movie.itemId}/MediaInfo`)).proxy.state, {
        timeout: 60000,
      })
      .toBe('ready');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled({
      timeout: 60000,
    });
    await seek(page, 0.199);
    const video = page.locator('video');
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).seeking))
      .toBe(false);
    expect(await video.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true);
    await expect
      .poll(() =>
        video.evaluate((node) => {
          const v = node as HTMLVideoElement,
            c = document.createElement('canvas');
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          const context = c.getContext('2d')!;
          context.drawImage(v, 0, 0);
          return [...context.getImageData(c.width / 2, c.height / 2, 1, 1).data].slice(0, 3);
        })
      )
      .toEqual([0, 0, 0]);
    await page.getByRole('button', { name: 'Pick color from movie' }).click();
    await expect(page.getByAltText('Source frame')).toBeVisible();
    await page.getByRole('button', { name: 'Source frame — click to sample color' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Hex', { exact: true })).toHaveValue('000000');
  }
);

requirement(
  'PROP-004 @fullstack source PNG identity matches paused proxy frames before at and after cuts and at the movie end',
  async ({ page, request }) => {
    await create(page, 'Exact frame identity');
    await add(page, 'Left', 0.1, 'ffffff', '100');
    await expect
      .poll(async () => (await get(request, `Items/${movie.itemId}/MediaInfo`)).proxy.state, {
        timeout: 60000,
      })
      .toBe('ready');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled({
      timeout: 60000,
    });
    // Initial pointer seek follows the reported workflow. Native API seeks below
    // independently exercise exact boundaries that pointer pixel rounding cannot.
    await seek(page, 0.199);
    const video = page.locator('video');
    const cases = [
      [1.99, '000000', 1958],
      [2, 'fd0000', 2000],
      [2.01, 'fd0000', 2000],
      [3.99, 'fd0000', 3958],
      [4, '007f00', 4000],
      [4.01, '007f00', 4000],
      [5.99, '007f00', 5958],
      [6, '0000fe', 6000],
      [6.01, '0000fe', 6000],
      [7.99, '0000fe', 7958],
      [8, 'ffffff', 8000],
      [8.01, 'ffffff', 8000],
      [9.99, 'ffffff', 9958],
      [10, 'ffffff', 9958],
    ] as const;
    for (const [time, hex, sourceMs] of cases) {
      await video.evaluate((node, seconds) => {
        (node as HTMLVideoElement).currentTime = seconds;
      }, time);
      await expect
        .poll(() => video.evaluate((node) => (node as HTMLVideoElement).seeking))
        .toBe(false);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
      const rgb = await video.evaluate((node) => {
        const v = node as HTMLVideoElement,
          c = document.createElement('canvas');
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const context = c.getContext('2d')!;
        context.drawImage(v, 0, 0);
        return [...context.getImageData(c.width / 2, c.height / 2, 1, 1).data].slice(0, 3);
      });
      if (hex === '000000') expect(rgb).toEqual([0, 0, 0]);
      else if (hex === 'ffffff') expect(rgb).toEqual([255, 255, 255]);
      else {
        const dominant = hex === 'fd0000' ? 0 : hex === '007f00' ? 1 : 2;
        for (let i = 0; i < 3; i++)
          if (i !== dominant) expect(rgb[dominant] - rgb[i]).toBeGreaterThan(64);
      }
      const frame = page.waitForResponse((response) => response.url().includes('/Frame?'));
      await page.getByRole('button', { name: 'Pick color from movie' }).click();
      const response = await frame;
      expect(response.ok()).toBeTruthy();
      expect(response.headers()['x-openlightfx-source-time-ms']).toBe(String(sourceMs));
      if (time === 10)
        await expect(page.getByText('Source frame: 00:00:09.958', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Source frame — click to sample color' })
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Source frame — click to sample color' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByLabel('Hex', { exact: true })).toHaveValue(hex);
    }
    const saved = await save(page, request);
    expect(saved.track.keyframes[0].color).toEqual({ r: 255, g: 255, b: 255 });
  }
);

requirement(
  'PROP-004 @fullstack the real plugin PNG supplies the original center pixel to the inspector and saved protobuf',
  async ({ page, request }) => {
    await create(page, 'Step 4 eyedropper');
    await add(page, 'Left', 0.3, '000000', '100');
    await seek(page, 0.3);
    // A cold proxy may still be encoding; extraction must not race a queued seek.
    await expect(page.getByRole('button', { name: 'Pick color from movie' })).toBeEnabled({
      timeout: 60000,
    });
    const response = page.waitForResponse((response) => response.url().includes('/Frame?'));
    await page.getByRole('button', { name: 'Pick color from movie' }).click();
    expect((await response).ok()).toBeTruthy();
    await expect(page.getByAltText('Source frame')).toBeVisible();
    await page.getByRole('button', { name: 'Source frame — click to sample color' }).focus();
    await page.keyboard.press('Enter');
    const pixel = JSON.parse(
      fs.readFileSync(`${process.env.OLFX_MEDIA_DIR}/clip-a-center-pixels.json`, 'utf8')
    ).pixels.find((pixel: any) => pixel.name === 'red');
    const hex = [pixel.r, pixel.g, pixel.b]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    await expect(page.getByLabel('Hex', { exact: true })).toHaveValue(hex);
    const saved = await save(page, request);
    expect(saved.track.keyframes[0].color).toEqual({ r: pixel.r, g: pixel.g, b: pixel.b });
  }
);

requirement(
  'PROP-004 @fullstack forward scrub PNGs match the actual movie position and the independently expected rendered proxy scene',
  async ({ page, request }) => {
    await create(page, 'Forward frame picker');
    await add(page, 'Left', 0.1, '000000', '100');
    await expect
      .poll(async () => (await get(request, `Items/${movie.itemId}/MediaInfo`)).proxy.state, {
        timeout: 60000,
      })
      .toBe('ready');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled({
      timeout: 60000,
    });
    const pixels = JSON.parse(
      fs.readFileSync(`${process.env.OLFX_MEDIA_DIR}/clip-a-center-pixels.json`, 'utf8')
    ).pixels;
    for (const [fraction, name] of [
      [0.3, 'red'],
      [0.5, 'green'],
      [0.7, 'blue'],
    ] as const) {
      const pixel = pixels.find((entry: any) => entry.name === name);
      await seek(page, fraction);
      await expect(page.getByAltText('Source frame')).toHaveCount(0);
      await expect
        .poll(() =>
          page
            .locator('video')
            .evaluate((node) => {
              const video = node as HTMLVideoElement;
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const context = canvas.getContext('2d')!;
              context.drawImage(video, 0, 0);
              return [
                ...context.getImageData(
                  Math.floor(canvas.width / 2),
                  Math.floor(canvas.height / 2),
                  1,
                  1
                ).data,
              ].slice(0, 3);
            })
            .then((rgb) => {
              // Video color management differs from PNG RGB-byte decoding:
              // the half-green BT.709 frame is brighter in browser sRGB.
              // Check the independent scene here; exact PNG/protobuf bytes below.
              const dominant = { red: 0, green: 1, blue: 2 }[name];
              return (
                rgb[dominant] - Math.max(...rgb.filter((_, index) => index !== dominant)) >= 64
              );
            })
        )
        .toBe(true);
      const response = page.waitForResponse((response) => response.url().includes('/Frame?'));
      await page.getByRole('button', { name: 'Pick color from movie' }).click();
      const frame = await response;
      expect(frame.ok()).toBeTruthy();
      const requested = new URL(frame.url()).searchParams.get('timeMs');
      const nativeTime = await page
        .locator('video')
        .evaluate((node) => (node as HTMLVideoElement).currentTime * 1000);
      expect(Math.abs(Number(requested) - nativeTime)).toBeLessThanOrEqual(1);
      expect(Math.abs(Number(requested) - fraction * 10000)).toBeLessThanOrEqual(42);
      await expect(page.getByAltText('Source frame')).toBeVisible();
      await page.getByRole('button', { name: 'Source frame — click to sample color' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByLabel('Hex', { exact: true })).toHaveValue(
        [pixel.r, pixel.g, pixel.b].map((value) => value.toString(16).padStart(2, '0')).join('')
      );
    }
    const saved = await save(page, request);
    const blue = pixels.find((entry: any) => entry.name === 'blue');
    expect(saved.track.keyframes[0].color).toEqual({ r: blue.r, g: blue.g, b: blue.b });
  }
);

requirement(
  'EDIT-008 @fullstack EDIT-011 SAVE-003 inspector and settings save exact metadata cues and sidecar and a second Save uses the new token',
  async ({ page, request }) => {
    await create(page, 'Step 4 inspector');
    await add(page, 'Left', 0.3, 'ff0000', '40');
    await page.getByLabel('Keyframe time').fill('00:03.000');
    await page.getByLabel('Keyframe time').blur();
    await page.getByLabel('Fade type').selectOption('LINEAR');
    await page.getByLabel('Fade length').fill('500');
    await page.getByLabel('Fade length').blur();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Track settings…' }).click();
    await page.getByLabel('Author', { exact: true }).fill('Step 4 author');
    await page.getByLabel('Description', { exact: true }).fill('A real saved editor regression');
    await page.getByLabel('Start behavior').selectOption('OFF');
    await page.getByLabel('End behavior').selectOption('LEAVE');
    await page.getByLabel('Credits behavior').selectOption('CREDITS_OFF');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    const first = await save(page, request);
    expect(first.track.keyframes).toHaveLength(1);
    expect(first.track.keyframes[0]).toMatchObject({
      channelId: 'left',
      timestampMs: 3000,
      color: { r: 255, g: 0, b: 0 },
      brightness: 40,
      interpolation: 'LINEAR',
      transitionMs: 500,
    });
    expect(first.track.metadata).toMatchObject({
      title: 'Step 4 inspector',
      author: 'Step 4 author',
      description: 'A real saved editor regression',
      startBehavior: 'OFF',
      endBehavior: 'LEAVE',
      creditsBehavior: 'CREDITS_OFF',
    });
    expect(await get(request, `Projects/${first.trackId}?itemId=${movie.itemId}`)).toMatchObject({
      version: 1,
      itemId: movie.itemId,
      trackId: first.trackId,
    });
    await page.getByLabel('Track title').fill('Step 4 inspector again');
    const second = await save(page, request);
    expect(second.updatedAt).not.toBe(first.updatedAt);
    expect(second.track.metadata.title).toBe('Step 4 inspector again');
  }
);

requirement(
  'EDIT-004 @fullstack five-channel routing labels stay pinned and usable while panning',
  async ({ page }) => {
    await create(page, 'Step 4 fold labels', '5.0');
    await expect(
      page
        .locator('.lane-name')
        .filter({ hasText: /^Left — Left lamp \(\+ Surround Left folded in\)$/ })
    ).toBeVisible();
    await expect(
      page.locator('.lane-name').filter({ hasText: /^Surround Left → folds into Left$/ })
    ).toBeVisible();
    await expect(
      page.locator('.lane-name').filter({ hasText: /^Center — Center lamp$/ })
    ).toBeVisible();
    for (let i = 0; i < 8; i++)
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const labels = page.locator('.lane-header');
    const before = await labels.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().x)
    );
    const viewport = page.locator('.timeline-scroll');
    await viewport.evaluate((node) => (node.scrollLeft = 400));
    await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBe(400);
    expect(
      await labels.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().x))
    ).toEqual(before);
    await labels.first().locator('.lane-name').click();
    await expect(
      page.locator('.inspector').getByRole('heading', { name: 'Left', exact: true })
    ).toBeVisible();
    const solo = page.getByRole('button', { name: 'Solo Left', exact: true });
    await solo.click();
    await expect(solo).toHaveAttribute('aria-pressed', 'true');
  }
);

requirement(
  'EDIT-010 @fullstack no-room authoring saves through the real API with disabled preview reasons',
  async ({ page, request }) => {
    expect(
      (await request.delete(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, { headers })).ok()
    ).toBeTruthy();
    await create(page, 'Step 4 no room');
    await expect(page.getByRole('switch', { name: 'Lights' })).toBeDisabled();
    await expect(page.getByRole('switch', { name: 'Lights' })).toHaveAttribute(
      'title',
      'Set up a room first'
    );
    await expect(page.locator('.lane-name').first()).toHaveText('Left');
    await add(page, 'Left', 0.3, '00ff00', '70');
    const saved = await save(page, request);
    expect(saved.track.keyframes[0]).toMatchObject({
      color: { r: 0, g: 255, b: 0 },
      brightness: 70,
    });
  }
);

requirement(
  'EDIT-009 @fullstack PREV-007 preview has fresh routed receipts and simultaneous rendered states and restores every bulb after Stop',
  async ({ page, request }) => {
    const changed = await request.put(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, {
      headers: { ...headers, 'If-Match': room.updatedAt },
      data: {
        name: room.name,
        screenDeviceId: 'step4-screen',
        bulbs: [
          { id: 'left-bulb', position: 'left', follows: null },
          { id: 'center-bulb', position: 'surround-left', follows: null },
          { id: 'right-bulb', position: 'right', follows: null },
        ],
      },
    });
    expect(changed.ok()).toBeTruthy();
    await create(page, 'Step 4 preview');
    await add(page, 'Left', 0.5, 'ff0000', '50');
    await add(page, 'Right', 0.1, '0000ff', '80');
    await seek(page, 0.6);
    const before = await cursor(request),
      receiptStart = receipts().length;
    await page.getByRole('switch', { name: 'Lights', exact: true }).click();
    const sample = await waitForObservation(control, {
      after: before,
      bulbs: {
        'left-bulb': { r: 255, g: 0, b: 0, brightness: 50, power: true },
        'center-bulb': { r: 255, g: 0, b: 0, brightness: 50, power: true },
        'right-bulb': { r: 0, g: 0, b: 255, brightness: 80, power: true },
      },
    });
    const fresh = receipts().slice(receiptStart);
    for (const [id, rgb, brightness] of [
      ['left-bulb', [255, 0, 0], 50],
      ['center-bulb', [255, 0, 0], 50],
      ['right-bulb', [0, 0, 255], 80],
    ] as const) {
      expect(
        fresh.some(
          (event) =>
            event.bulb_id === id &&
            [event.params.r, event.params.g, event.params.b].map(Number).join() === rgb.join() &&
            Number(event.params.brightness) === brightness
        )
      ).toBe(true);
    }
    await test.info().attach('preview-observation.json', {
      body: JSON.stringify(sample),
      contentType: 'application/json',
    });
    const stopping = await cursor(request);
    await page.getByRole('switch', { name: 'Lights on', exact: true }).click();
    await waitForObservation(control, { after: stopping, bulbs: off });
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  }
);

requirement(
  'PREV-008 @fullstack Emby owns the room until a real takeover is accepted and Cancel leaves its rendered lights unchanged',
  async ({ page, request }) => {
    await create(page, 'Step 4 takeover');
    await add(page, 'Left', 0.1, 'ff0000', '100');
    await add(page, 'Right', 0.1, '0000ff', '100');
    const saved = await save(page, request);
    expect(
      (
        await request.post(`${base}/OpenLightFX/Studio/Items/${movie.itemId}/ActiveTrack`, {
          headers,
          data: { trackId: saved.trackId },
        })
      ).ok()
    ).toBeTruthy();
    const auth = {
      'X-Emby-Token': screenToken,
      'X-Emby-Authorization':
        'MediaBrowser Client="Step4", Device="Editor TV", DeviceId="step4-screen", Version="1.0"',
    };
    const info = await request.post(`${base}/emby/Items/${movie.itemId}/PlaybackInfo`, {
      headers: auth,
      data: {},
    });
    expect(info.ok()).toBeTruthy();
    const playing = {
      ItemId: movie.itemId,
      MediaSourceId: (await info.json()).MediaSources[0].Id,
      PlaySessionId: `step4-${Date.now()}`,
      CanSeek: true,
      PlayMethod: 'DirectPlay',
      PositionTicks: 20000000,
    };
    const before = await cursor(request);
    expect(
      (await request.post(`${base}/emby/Sessions/Playing`, { headers: auth, data: playing })).ok()
    ).toBeTruthy();
    try {
      expect(
        (
          await request.post(`${base}/emby/Sessions/Playing/Progress`, {
            headers: auth,
            data: { ...playing, IsPaused: false },
          })
        ).ok()
      ).toBeTruthy();
      const embyStates = {
        'left-bulb': { r: 255, g: 0, b: 0, brightness: 100, power: true },
        'center-bulb': { r: 128, g: 0, b: 128, brightness: 100, power: true },
        'right-bulb': { r: 0, g: 0, b: 255, brightness: 100, power: true },
      };
      await waitForObservation(control, { after: before, bulbs: embyStates });
      const leftLane = (await page
        .locator('.lane-row')
        .filter({ hasText: 'Left' })
        .locator('.lane')
        .boundingBox())!;
      await page.mouse.click(leftLane.x + leftLane.width * 0.1, leftLane.y + 19);
      await page.getByLabel('Hex', { exact: true }).fill('00ff00');
      await seek(page, 0.6);
      const cancelled = page.waitForEvent('dialog');
      const click = page.getByRole('switch', { name: 'Lights', exact: true }).click();
      const prompt = await cancelled;
      expect(prompt.message()).toContain('Take over');
      await prompt.dismiss();
      await click;
      await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toHaveAttribute(
        'aria-checked',
        'false'
      );
      await waitForObservation(control, { after: await cursor(request), bulbs: embyStates });
      const takeover = page.waitForEvent('dialog');
      const accepting = page.getByRole('switch', { name: 'Lights', exact: true }).click();
      await (await takeover).accept();
      await accepting;
      await waitForObservation(control, {
        after: await cursor(request),
        bulbs: {
          'left-bulb': { r: 0, g: 255, b: 0, brightness: 100, power: true },
          'center-bulb': { r: 0, g: 128, b: 128, brightness: 100, power: true },
          'right-bulb': { r: 0, g: 0, b: 255, brightness: 100, power: true },
        },
      });
      await page.getByRole('switch', { name: 'Lights on', exact: true }).click();
    } finally {
      expect(
        (
          await request.post(`${base}/emby/Sessions/Playing/Stopped`, {
            headers: auth,
            data: playing,
          })
        ).ok()
      ).toBeTruthy();
    }
  }
);

requirement(
  'EDIT-012 @fullstack eight existing effects retain every protobuf field through Open and Save',
  async ({ page, request }) => {
    const source = decodeTrack(
      fs.readFileSync(`${root}/tests/fixtures/sampling/roundtrip.lightfx`)
    );
    source.metadata.title = 'Step 4 eight effects';
    source.metadata.movieTitle = movie.name;
    const effect = source.effects[0];
    source.effects = Array.from({ length: 8 }, (_, index) => ({
      ...structuredClone(effect),
      id: `preserved-effect-${index}`,
      timestampMs: 1000 + index * 1000,
    }));
    const response = await request.put(
      `${base}/OpenLightFX/Studio/Tracks/step4-effects?itemId=${movie.itemId}`,
      {
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        data: Buffer.from(encodeTrack(source)),
      }
    );
    expect(response.ok()).toBeTruthy();
    await page.goto(`${base}/emby/OpenLightFX/studio/#/edit/${movie.itemId}/step4-effects`);
    await expect(page.locator('.effect-block')).toHaveCount(8);
    await expect(page.locator('.effect-block').first()).toHaveText('PULSE');
    await page.locator('.effect-block').first().click();
    await expect(
      page.getByText('Effect editing comes in a later version. This effect is kept as is.', {
        exact: true,
      })
    ).toBeVisible();
    const saved = await save(page, request);
    expect(saved.track.effects).toEqual(source.effects);
  }
);

requirement(
  'EDIT-013 @fullstack a genuine non-admin session cannot Save or preview but can author and Export',
  async ({ page, request }) => {
    const authenticated = await request.post(`${base}/emby/Users/AuthenticateByName`, {
      headers: {
        'X-Emby-Authorization':
          'MediaBrowser Client="Step4Viewer", Device="Viewer", DeviceId="step4-viewer", Version="1.0"',
      },
      data: { Username: 'viewer', Pw: '' },
    });
    expect(authenticated.ok()).toBeTruthy();
    const viewer = await authenticated.json();
    expect(viewer.User.Policy.IsAdministrator).not.toBe(true);
    await page.evaluate(
      ({ base, viewer }) =>
        localStorage.setItem(
          'servercredentials3',
          JSON.stringify({
            Servers: [
              {
                Id: 'lab',
                ManualAddress: base,
                UserId: viewer.User.Id,
                Users: [{ UserId: viewer.User.Id, AccessToken: viewer.AccessToken }],
              },
            ],
          })
        ),
      { base, viewer }
    );
    await create(page, 'Step 4 viewer');
    await expect(page.getByRole('switch', { name: 'Lights' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Watch in Emby' })).toBeDisabled();
    await page.getByRole('button', { name: 'File', exact: true }).click();
    // Inspect Save without activating a forbidden request.
    const saveItem = page.getByRole('menuitem', { name: /^Save/ });
    await expect(saveItem).toBeDisabled();
    await expect(saveItem).toHaveAttribute('title', /Only an Emby administrator/);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await add(page, 'Left', 0.3, 'ff0000', '40');
    const downloaded = page.waitForEvent('download');
    await fileMenu(page, '^Export');
    const download = await downloaded;
    const exported = decodeTrack(fs.readFileSync((await download.path())!));
    expect(exported.keyframes[0].brightness).toBe(40);
  }
);

requirement(
  'ERR-003 @fullstack real concurrency conflict Reload adopts server bytes and Save as new preserves the original file',
  async ({ page, request }) => {
    await create(page, 'Step 4 conflicts');
    await add(page, 'Left', 0.3, 'ff0000', '40');
    const initial = await save(page, request);
    const invalid = structuredClone(initial.track);
    invalid.metadata.durationMs = 0;
    const rejected = await request.put(
      `${base}/OpenLightFX/Studio/Tracks/${initial.trackId}?itemId=${movie.itemId}`,
      {
        headers: {
          ...headers,
          'Content-Type': 'application/octet-stream',
          'If-Match': initial.updatedAt,
        },
        data: Buffer.from(encodeTrack(invalid)),
      }
    );
    expect(rejected.status()).toBe(400);
    expect(await rejected.text()).toMatch(/V-?\d{3}/);
    const unchanged = await request.get(
      `${base}/OpenLightFX/Studio/Tracks/${initial.trackId}?itemId=${movie.itemId}`,
      { headers }
    );
    expect(decodeTrack(await unchanged.body())).toEqual(initial.track);
    async function externalWrite(current: any, author: string) {
      const track = structuredClone(current.track);
      track.metadata.author = author;
      const response = await request.put(
        `${base}/OpenLightFX/Studio/Tracks/${current.trackId}?itemId=${movie.itemId}`,
        {
          headers: {
            ...headers,
            'Content-Type': 'application/octet-stream',
            'If-Match': current.updatedAt,
          },
          data: Buffer.from(encodeTrack(track)),
        }
      );
      expect(response.ok()).toBeTruthy();
      return { ...(await response.json()), track };
    }
    const external = await externalWrite(initial, 'External author');
    await page.getByLabel('Track title').fill('My unsaved revision');
    await fileMenu(page, '^Save');
    await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
    const dialog = page.waitForEvent('dialog');
    const reload = page.getByRole('button', { name: 'Reload', exact: true }).click();
    await (await dialog).accept();
    await reload;
    await expect(page.getByLabel('Track title')).toHaveValue('Step 4 conflicts');
    const newest = await externalWrite(external, 'External author again');
    await page.getByLabel('Track title').fill('My preserved revision');
    await fileMenu(page, '^Save');
    await expect(
      page.getByRole('button', { name: 'Save as new track', exact: true })
    ).toBeVisible();
    const response = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' && response.url().includes('/Studio/Tracks/')
    );
    await page.getByRole('button', { name: 'Save as new track', exact: true }).click();
    const saved = await response;
    expect(saved.ok()).toBeTruthy();
    const copy = await saved.json();
    expect(copy.trackId).not.toBe(initial.trackId);
    const original = await request.get(
      `${base}/OpenLightFX/Studio/Tracks/${initial.trackId}?itemId=${movie.itemId}`,
      { headers }
    );
    expect(decodeTrack(await original.body()).metadata.author).toBe(newest.track.metadata.author);
    const copied = await request.get(
      `${base}/OpenLightFX/Studio/Tracks/${copy.trackId}?itemId=${movie.itemId}`,
      { headers }
    );
    expect(decodeTrack(await copied.body()).metadata.title).toBe('My preserved revision');
  }
);
