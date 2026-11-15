import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { requirement } = await import(pathToFileURL(`${root}/e2e/harness/requirement.ts`).href);
const { decodeTrack, encodeTrack } = await import(
  pathToFileURL(`${root}/src/lib/domain/index.ts`).href
);
const browser = process.env.OLFX_LAB_BROWSER ?? 'chromium';
if (!['chromium', 'firefox'].includes(browser)) throw new Error('Invalid browser');
test.use({ browserName: browser });
test.describe.configure({ mode: 'serial' });
const base = process.env.OLFX_EMBY_URL!;
const headers = { 'X-Emby-Token': process.env.OLFX_API_KEY! };
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
    `${base}/emby/OpenLightFX/studio/?api_key=${encodeURIComponent(process.env.OLFX_API_KEY!)}#/movie/${movie.itemId}`
  );
  await expect(page.getByRole('heading', { name: movie.name, exact: true })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: /^2\.0/ }).click();
  await page.getByRole('button', { name: 'Create track', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
}

requirement(
  'ED2-032 @fullstack real conflict retry and Save as new persist independently decoded track and sidecar snapshots',
  async ({ page, request }) => {
    if (process.env.OLFX_LAB !== '1' || !process.env.OLFX_MEDIA_DIR?.includes('/.emby-stack/labs/'))
      throw new Error('Isolated lab required');
    const items = await request.get(`${base}/OpenLightFX/Studio/Items`, { headers });
    expect(items.ok()).toBeTruthy();
    movie = (await items.json()).find((item: any) => item.name === 'clip-a');
    expect(movie?.runtimeMs).toBe(10000);

    const initialTitle = `Checkpoint before conflict ${Date.now()}`;
    await create(page, initialTitle);
    const lane = page.locator('.lane-row').filter({ hasText: /^Left/ }).locator('.lane');
    const bounds = (await lane.boundingBox())!;
    await page.mouse.click(bounds.x + bounds.width * 0.3, bounds.y + bounds.height / 2);
    await page.getByLabel('Hex', { exact: true }).fill('ff0000');
    await page.getByLabel('Brightness value', { exact: true }).fill('61');

    const firstResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes('/OpenLightFX/Studio/Tracks/')
    );
    await fileMenu(page, '^Save');
    const first = await firstResponse;
    expect(first.ok()).toBeTruthy();
    const originalInfo = await first.json();
    const originalId = originalInfo.trackId;
    const initial = await getTrack(request, originalId);
    expect(initial.track.metadata.title).toBe(initialTitle);
    expect(initial.track.keyframes).toMatchObject([
      { channelId: 'left', color: { r: 255, g: 0, b: 0 }, brightness: 61 },
    ]);
    expect(await getSidecar(request, originalId)).toEqual({
      version: 1,
      itemId: movie.itemId,
      trackId: originalId,
      sceneMarkers: [],
      channelGroups: [],
    });

    const external = structuredClone(initial.track);
    external.metadata.author = 'Independent server revision';
    const externalWrite = await request.put(
      `${base}/OpenLightFX/Studio/Tracks/${originalId}?itemId=${movie.itemId}`,
      {
        headers: {
          ...headers,
          'Content-Type': 'application/octet-stream',
          'If-Match': originalInfo.updatedAt,
        },
        data: Buffer.from(encodeTrack(external)),
      }
    );
    expect(externalWrite.ok()).toBeTruthy();
    const externalInfo = await externalWrite.json();

    await page.getByLabel('Track title', { exact: true }).fill('Local preserved title');
    await fileMenu(page, '^Save');
    await expect(
      page.getByRole('button', { name: 'Save as new track', exact: true })
    ).toBeVisible();
    const saveCopyResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes('/Studio/Tracks/') &&
        !response.url().endsWith(`/Tracks/${originalId}?itemId=${movie.itemId}`)
    );
    await page.getByRole('button', { name: 'Save as new track', exact: true }).click();
    const savedCopy = await saveCopyResponse;
    expect(savedCopy.ok()).toBeTruthy();
    const copyInfo = await savedCopy.json();
    expect(copyInfo.trackId).not.toBe(originalId);
    expect(copyInfo.updatedAt).toBeTruthy();

    const originalAfter = await getTrack(request, originalId);
    expect(originalAfter.track).toEqual(decodeTrack(Buffer.from(encodeTrack(external))));
    expect(originalAfter.track.metadata.author).toBe('Independent server revision');
    expect(originalAfter.bytes).toEqual(Buffer.from(encodeTrack(external)));
    const copy = await getTrack(request, copyInfo.trackId);
    expect(copy.track.metadata.title).toBe('Local preserved title');
    expect(copy.track.metadata.author).not.toBe('Independent server revision');
    expect(copy.track.keyframes).toEqual(initial.track.keyframes);
    const copySidecar = await getSidecar(request, copyInfo.trackId);
    expect(copySidecar).toEqual({
      version: 1,
      itemId: movie.itemId,
      trackId: copyInfo.trackId,
      sceneMarkers: [],
      channelGroups: [],
    });

    await expect(page).toHaveURL(new RegExp(`/edit/${movie.itemId}/${copyInfo.trackId}$`));
    await page.reload();
    await expect(page.getByLabel('Track title', { exact: true })).toHaveValue(
      'Local preserved title'
    );
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect((await getTrack(request, copyInfo.trackId)).track).toEqual(copy.track);
    expect(await getSidecar(request, copyInfo.trackId)).toEqual(copySidecar);
    expect(externalInfo.updatedAt).not.toBe(originalInfo.updatedAt);
  }
);
