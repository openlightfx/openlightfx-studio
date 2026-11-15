import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
const root = process.cwd();
const { requirement } = await import(pathToFileURL(`${root}/e2e/harness/requirement.ts`).href);
const { decodeTrack, encodeTrack, newTrackFromMovie } = await import(
  pathToFileURL(`${root}/src/lib/domain/index.ts`).href
);
const { waitForObservation } = await import(
  pathToFileURL(`${root}/scripts/fullstack/observations.mjs`).href
);
const { ActiveEditorPage } = await import(
  pathToFileURL(`${root}/e2e/pages/active-editor-page.ts`).href
);
const browser = process.env.OLFX_LAB_BROWSER ?? 'chromium';
if (!['chromium', 'firefox'].includes(browser)) throw new Error('Invalid browser');
test.use({ browserName: browser });
test.describe.configure({ mode: 'serial' });
const base = process.env.OLFX_EMBY_URL!;
const control = process.env.OLFX_SIMULATOR_CONTROL_URL!;
const headers = { 'X-Emby-Token': process.env.OLFX_API_KEY! };
const off = {
  'left-bulb': { power: false },
  'center-bulb': { power: false },
  'right-bulb': { power: false },
};
let movie: any;
async function api(request: APIRequestContext, path: string) {
  const response = await request.get(`${base}/OpenLightFX/Studio/${path}`, { headers });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
function receipts(): any[] {
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
async function cursor(request: APIRequestContext) {
  const response = await request.get(`${control}/state`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).event_id;
}
async function moviePage(page: Page) {
  await page.goto(
    `${base}/emby/OpenLightFX/studio/?api_key=${encodeURIComponent(process.env.OLFX_API_KEY!)}#/movie/${movie.itemId}`
  );
  await expect(page.getByRole('heading', { name: movie.name, exact: true })).toBeVisible();
}
async function create(page: Page, title: string) {
  await moviePage(page);
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: /^2\.0/ }).click();
  await page.getByRole('button', { name: 'Create track', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
}
async function add(page: Page, lane: number, time: number, hex: string, brightness: string) {
  const ruler = (await page.getByRole('slider', { name: 'Timeline ruler' }).boundingBox())!;
  const canvas = (await page.locator('.lane-canvas').nth(lane).boundingBox())!;
  await page.mouse.click(ruler.x + (time * ruler.width) / 10000, canvas.y + 19);
  await page.getByLabel('Hex', { exact: true }).fill(hex);
  await page.getByLabel('Brightness value', { exact: true }).fill(brightness);
}
async function goTo(page: Page, seconds: number) {
  const field = page.getByLabel('Go to time', { exact: true });
  await field.fill(`00:00:${seconds.toFixed(3).padStart(6, '0')}`);
  await field.press('Enter');
  await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveAttribute(
    'aria-valuenow',
    String(seconds * 1000)
  );
  await page.locator('.lane-canvas').first().focus();
}
async function readTrack(request: APIRequestContext, id: string) {
  const response = await request.get(
    `${base}/OpenLightFX/Studio/Tracks/${id}?itemId=${movie.itemId}`,
    { headers }
  );
  expect(response.ok()).toBeTruthy();
  return decodeTrack(await response.body());
}
async function save(page: Page, request: APIRequestContext) {
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().includes('/Studio/Tracks/')
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const saved = await response;
  expect(saved.ok()).toBeTruthy();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const { trackId } = await saved.json();
  return { trackId, track: await readTrack(request, trackId) };
}

test.beforeAll(async ({ request }) => {
  if (process.env.OLFX_LAB !== '1' || !process.env.OLFX_MEDIA_DIR?.includes('/.emby-stack/labs/'))
    throw new Error('Isolated lab required');
  movie = (await api(request, 'Items')).find((item: any) => item.name === 'clip-a');
  expect(movie?.runtimeMs).toBe(10000);
  const response = await request.post(`${base}/emby/Users/AuthenticateByName`, {
    headers: {
      'X-Emby-Authorization':
        'MediaBrowser Client="EditorGestures", Device="Editor TV", DeviceId="editor-gestures-screen", Version="1.0"',
    },
    data: { Username: 'admin', Pw: 'openlightfx-test' },
  });
  expect(response.ok()).toBeTruthy();
});
test.beforeEach(async ({ request }) => {
  expect(
    (await request.post(`${base}/OpenLightFX/Studio/Preview/Stop`, { headers, data: {} })).ok()
  ).toBeTruthy();
  expect((await request.post(`${control}/reset`)).ok()).toBeTruthy();
  for (const room of await api(request, 'Rooms'))
    expect(
      (await request.delete(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, { headers })).ok()
    ).toBeTruthy();
  const response = await request.post(`${base}/OpenLightFX/Studio/Rooms`, {
    headers,
    data: {
      name: 'Gesture room',
      screenDeviceId: 'editor-gestures-screen',
      bulbs: [
        { id: 'left-bulb', position: 'left', follows: null },
        { id: 'right-bulb', position: 'right', follows: null },
      ],
    },
  });
  expect(response.ok()).toBeTruthy();
});
test.afterEach(async ({ request }) => {
  await request.post(`${base}/OpenLightFX/Studio/Preview/Stop`, { headers, data: {} });
  await waitForObservation(control, { after: await cursor(request), bulbs: off });
});

requirement(
  'ED2-020 @fullstack UI paste saves and reloads exact keys and untouched imported effects without starting preview',
  async ({ page, request }) => {
    const source = newTrackFromMovie(
      movie.itemId,
      `Clipboard lab ${browser} ${Date.now()}`,
      10000,
      'LAYOUT_2_0'
    );
    source.metadata.movieTitle = movie.name;
    source.effects = [
      {
        id: 'imported-pulse',
        channelId: 'left',
        timestampMs: 7000,
        durationMs: 500,
        effectType: 'PULSE',
        intensity: 30,
        primaryColor: null,
        secondaryColor: null,
        params: {},
        requiredCapability: '',
        fallbackColor: null,
        fallbackBrightness: 0,
      },
    ];
    await moviePage(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'clipboard-passage.lightfx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(encodeTrack(source)),
    });
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
    await add(page, 0, 1000, '132535', '37');
    await add(page, 1, 2000, '4f6583', '61');
    await page.getByLabel('Fade type', { exact: true }).selectOption('LINEAR');
    await page.getByLabel('Fade length', { exact: true }).fill('250');
    await page.locator('.lane-canvas').first().focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');
    const receiptStart = receipts().length;
    await goTo(page, 4);
    await page.keyboard.press('Control+v');
    await expect(page.getByRole('heading', { name: '2 selected keyframes' })).toBeVisible();
    const saved = await save(page, request);
    expect(
      saved.track.keyframes.map(
        ({ channelId, timestampMs, color, brightness, transitionMs, interpolation }: any) => ({
          channelId,
          timestampMs,
          color,
          brightness,
          transitionMs,
          interpolation,
        })
      )
    ).toEqual([
      {
        channelId: 'left',
        timestampMs: 1000,
        color: { r: 19, g: 37, b: 53 },
        brightness: 37,
        transitionMs: 0,
        interpolation: 'STEP',
      },
      {
        channelId: 'left',
        timestampMs: 4000,
        color: { r: 19, g: 37, b: 53 },
        brightness: 37,
        transitionMs: 0,
        interpolation: 'STEP',
      },
      {
        channelId: 'right',
        timestampMs: 2000,
        color: { r: 79, g: 101, b: 131 },
        brightness: 61,
        transitionMs: 250,
        interpolation: 'LINEAR',
      },
      {
        channelId: 'right',
        timestampMs: 5000,
        color: { r: 79, g: 101, b: 131 },
        brightness: 61,
        transitionMs: 250,
        interpolation: 'LINEAR',
      },
    ]);
    expect(new Set(saved.track.keyframes.map((frame: any) => frame.id)).size).toBe(4);
    expect(saved.track.effects).toEqual(source.effects);
    await page.reload();
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
    const exported = await new ActiveEditorPage(page).exportTrack();
    expect(exported).toEqual(saved.track);
    expect(receipts().slice(receiptStart)).toHaveLength(0);
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    await test.info().attach('clipboard-saved.json', {
      body: JSON.stringify(saved),
      contentType: 'application/json',
    });
  }
);

requirement(
  'ED2-016 @fullstack real Lights follow live drag drafts and restore canceled committed and undone samples',
  async ({ page, request }) => {
    await create(page, `Live drag lab ${browser} ${Date.now()}`);
    await add(page, 0, 1000, 'ff0000', '100');
    await add(page, 0, 3000, '0000ff', '80');
    await add(page, 1, 1000, '00ff00', '60');
    const saved = await save(page, request);
    await goTo(page, 2.5);
    const committed = {
      'left-bulb': {
        r: 255,
        g: 0,
        b: 0,
        brightness: 100,
        power: true,
        display_color: { r: 255, g: 0, b: 0 },
      },
      'right-bulb': {
        r: 0,
        g: 255,
        b: 0,
        brightness: 60,
        power: true,
        display_color: { r: 0, g: 153, b: 0 },
      },
      'center-bulb': { power: false },
    };
    const draft = {
      ...committed,
      'left-bulb': {
        r: 0,
        g: 0,
        b: 255,
        brightness: 80,
        power: true,
        display_color: { r: 0, g: 0, b: 204 },
      },
    };
    async function observe(expected: typeof committed, action: () => Promise<void>, label: string) {
      const after = await cursor(request),
        start = receipts().length;
      await action();
      const sample = await waitForObservation(control, { after, bulbs: expected, tolerance: 2 });
      const fresh = receipts().slice(start);
      expect(
        fresh.some(
          (event) =>
            event.bulb_id === 'left-bulb' &&
            Number(event.params.r) === expected['left-bulb'].r &&
            Number(event.params.b) === expected['left-bulb'].b &&
            Number(event.params.brightness) === expected['left-bulb'].brightness
        )
      ).toBe(true);
      expect(fresh.filter((event) => event.bulb_id === 'center-bulb')).toHaveLength(0);
      await test.info().attach(`${label}.json`, {
        body: JSON.stringify({ sample, receipts: fresh }),
        contentType: 'application/json',
      });
    }
    async function startDrag() {
      await new ActiveEditorPage(page).selectKeyframe('left', 3000);
      const mark = (await page.locator('.diamond').boundingBox())!;
      const ruler = (await page.getByRole('slider', { name: 'Timeline ruler' }).boundingBox())!;
      await page.mouse.move(mark.x + mark.width / 2, mark.y + mark.height / 2);
      await page.mouse.down();
      await page.mouse.move(mark.x + mark.width / 2 - ruler.width / 10, mark.y + mark.height / 2, {
        steps: 4,
      });
      await expect(page.getByLabel('Keyframe time', { exact: true })).toHaveValue('00:02.000');
    }
    const offReceiptStart = receipts().length;
    await startDrag();
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(receipts().slice(offReceiptStart)).toHaveLength(0);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await observe(
      committed,
      () => page.getByRole('switch', { name: 'Lights', exact: true }).click(),
      'drag-preview-start'
    );
    await observe(draft, startDrag, 'drag-live-draft');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect((await readTrack(request, saved.trackId)).keyframes).toEqual(saved.track.keyframes);
    await observe(
      committed,
      async () => {
        await page.keyboard.press('Escape');
        await page.mouse.up();
      },
      'drag-cancel-restored'
    );
    await observe(
      draft,
      async () => {
        await startDrag();
        await page.mouse.up();
      },
      'drag-committed'
    );
    const moved = await new ActiveEditorPage(page).exportTrack();
    expect(
      moved.keyframes.map(({ channelId, timestampMs }: any) => ({ channelId, timestampMs }))
    ).toEqual([
      { channelId: 'left', timestampMs: 1000 },
      { channelId: 'left', timestampMs: 2000 },
      { channelId: 'right', timestampMs: 1000 },
    ]);
    await observe(
      committed,
      () => page.getByRole('button', { name: 'Undo', exact: true }).click(),
      'drag-undo-restored'
    );
    expect((await new ActiveEditorPage(page).exportTrack()).keyframes).toEqual(
      saved.track.keyframes
    );
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const stopping = await cursor(request);
    await page.getByRole('switch', { name: 'Lights on', exact: true }).click();
    await waitForObservation(control, { after: stopping, bulbs: off });
  }
);
