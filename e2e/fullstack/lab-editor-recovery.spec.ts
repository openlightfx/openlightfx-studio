import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { requirement } = await import(pathToFileURL(`${root}/e2e/harness/requirement.ts`).href);
const { decodeTrack, encodeTrack } = await import(
  pathToFileURL(`${root}/src/lib/domain/index.ts`).href
);
const { ActiveEditorPage } = await import(
  pathToFileURL(`${root}/e2e/pages/active-editor-page.ts`).href
);
const browser = process.env.OLFX_LAB_BROWSER ?? 'chromium';
if (!['chromium', 'firefox'].includes(browser)) throw new Error('Invalid browser');
test.use({ browserName: browser });
test.describe.configure({ mode: 'serial' });
const base = process.env.OLFX_EMBY_URL!;
const apiKey = process.env.OLFX_API_KEY!;
const headers = { 'X-Emby-Token': apiKey };
let movie: any;

async function getTrack(request: APIRequestContext, trackId: string) {
  const response = await request.get(
    `${base}/OpenLightFX/Studio/Tracks/${trackId}?itemId=${movie.itemId}`,
    { headers }
  );
  expect(response.ok()).toBeTruthy();
  const bytes = await response.body();
  return { bytes, track: decodeTrack(bytes) };
}

async function getSidecar(request: APIRequestContext, trackId: string) {
  const response = await request.get(
    `${base}/OpenLightFX/Studio/Projects/${trackId}?itemId=${movie.itemId}`,
    { headers }
  );
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function fileMenu(page: Page, name: string) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
}

async function create(page: Page, title: string) {
  await page.goto(
    `${base}/emby/OpenLightFX/studio/?api_key=${encodeURIComponent(apiKey)}#/movie/${movie.itemId}`
  );
  await expect(page.getByRole('heading', { name: movie.name, exact: true })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: /^2\.0/ }).click();
  await page.getByRole('button', { name: 'Create track', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
}

async function readRecovery(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, any>>((resolve, reject) => {
        const open = indexedDB.open('openlightfx-studio');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('crash', 'readonly').objectStore('crash').getAll();
          request.onsuccess = () => {
            db.close();
            resolve(request.result.at(-1) ?? null);
          };
          request.onerror = () => reject(request.error);
        };
      })
  );
}

requirement(
  'ED2-033 @fullstack real committed recovery then hosted save and reload retain exact track and sidecar',
  async ({ page, request }) => {
    if (process.env.OLFX_LAB !== '1' || !process.env.OLFX_MEDIA_DIR?.includes('/.emby-stack/labs/'))
      throw new Error('Isolated lab required');
    const items = await request.get(`${base}/OpenLightFX/Studio/Items`, { headers });
    expect(items.ok()).toBeTruthy();
    movie = (await items.json()).find((item: any) => item.name === 'clip-a');
    expect(movie?.runtimeMs).toBe(10000);

    const title = `Recovery-${browser}-${Date.now()}`;
    await create(page, title);
    const initialSave = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes('/OpenLightFX/Studio/Tracks/')
    );
    await fileMenu(page, '^Save');
    const firstResponse = await initialSave;
    expect(firstResponse.ok()).toBeTruthy();
    const firstToken = (await firstResponse.json()).updatedAt as string;
    const trackId = (await firstResponse.json()).trackId as string;
    const initial = await getTrack(request, trackId);
    expect(initial.track.metadata.title).toBe(title);

    const lane = page.locator('.lane-row').filter({ hasText: /^Left/ }).locator('.lane');
    const bounds = (await lane.boundingBox())!;
    await page.mouse.click(bounds.x + bounds.width * 0.3, bounds.y + bounds.height / 2);
    await expect(page.getByLabel('Hex', { exact: true })).toBeVisible();
    await page.getByLabel('Keyframe time', { exact: true }).fill('00:02.500');
    await page.getByLabel('Keyframe time', { exact: true }).press('Enter');
    await page.getByLabel('Hex', { exact: true }).fill('27a4e1');
    await page.getByLabel('Brightness value', { exact: true }).fill('63');

    const localExpected = await new ActiveEditorPage(page).exportTrack();
    const expectedCue = localExpected.keyframes.find(
      (frame) => frame.channelId === 'left' && frame.timestampMs === 2500
    );
    expect(expectedCue).toMatchObject({
      timestampMs: 2500,
      color: { r: 39, g: 164, b: 225 },
      brightness: 63,
    });
    await expect
      .poll(async () => {
        const row = await readRecovery(page);
        return row?.dirty === true && row?.track?.metadata?.title === title;
      })
      .toBe(true);
    const recovery = await readRecovery(page);
    expect(recovery).toMatchObject({
      key: `${movie.itemId}:${trackId}`,
      itemId: movie.itemId,
      trackId,
      dirty: true,
      storage: 'indexeddb',
      sidecar: {
        version: 1,
        itemId: movie.itemId,
        trackId,
        sceneMarkers: [],
        channelGroups: [],
      },
    });
    expect(typeof recovery.revision).toBe('string');
    expect(JSON.stringify(recovery)).not.toContain(apiKey);

    await page.reload();
    await expect(page.getByLabel('Track title', { exact: true })).toHaveValue(title);
    const restored = await new ActiveEditorPage(page).exportTrack();
    expect(restored).toEqual(localExpected);
    expect(restored.keyframes.find((frame) => frame.channelId === 'left')).toMatchObject({
      timestampMs: 2500,
      color: { r: 39, g: 164, b: 225 },
      brightness: 63,
    });

    const trackPut = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes(`/OpenLightFX/Studio/Tracks/${trackId}?itemId=${movie.itemId}`)
    );
    const projectPut = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes(`/OpenLightFX/Studio/Projects/${trackId}?itemId=${movie.itemId}`)
    );
    await fileMenu(page, '^Save');
    const savedResponse = await trackPut;
    expect(savedResponse.ok()).toBeTruthy();
    expect(savedResponse.request().headers()['if-match']).toBe(firstToken);
    expect((await projectPut).ok()).toBeTruthy();
    const saved = await getTrack(request, trackId);
    const savedSidecar = await getSidecar(request, trackId);
    expect(saved.track).toEqual(decodeTrack(Buffer.from(encodeTrack(restored))));
    expect(saved.track.keyframes.find((frame) => frame.channelId === 'left')).toMatchObject({
      timestampMs: 2500,
      color: { r: 39, g: 164, b: 225 },
      brightness: 63,
    });
    expect(savedSidecar).toEqual({
      version: 1,
      itemId: movie.itemId,
      trackId,
      sceneMarkers: [],
      channelGroups: [],
    });
    expect(saved.bytes).toEqual(Buffer.from(encodeTrack(saved.track)));

    await page.reload();
    await expect(page.getByLabel('Track title', { exact: true })).toHaveValue(title);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(await new ActiveEditorPage(page).exportTrack()).toEqual(saved.track);
    expect((await getTrack(request, trackId)).bytes).toEqual(saved.bytes);
    expect(await getSidecar(request, trackId)).toEqual(savedSidecar);
    const cleanRecovery = await readRecovery(page);
    expect(cleanRecovery.dirty).toBe(false);
  }
);
