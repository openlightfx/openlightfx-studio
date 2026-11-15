import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { requirement } = await import(pathToFileURL(`${root}/e2e/harness/requirement.ts`).href);
const { decodeTrack, encodeTrack } = await import(
  pathToFileURL(`${root}/src/lib/domain/index.ts`).href
);
const { roundTripTrack } = await import(
  pathToFileURL(`${root}/tests/fixtures/sampling/roundtrip-track.ts`).href
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
    `${base}/OpenLightFX/Studio/Tracks/${encodeURIComponent(trackId)}?itemId=${movie.itemId}`,
    { headers }
  );
  expect(response.ok()).toBeTruthy();
  const bytes = await response.body();
  return { bytes, track: decodeTrack(bytes) };
}

async function getSidecar(request: APIRequestContext, trackId: string) {
  const response = await request.get(
    `${base}/OpenLightFX/Studio/Projects/${encodeURIComponent(trackId)}?itemId=${movie.itemId}`,
    { headers }
  );
  expect(response.ok()).toBeTruthy();
  return response.json();
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
            resolve(request.result.find((row: Record<string, unknown>) => row.dirty) ?? null);
          };
          request.onerror = () => reject(request.error);
        };
      })
  );
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

requirement(
  'ED2-027 @fullstack real Projects GET PUT reload recovery and Save as new preserve matching v1 sidecars and protobuf data',
  async ({ page, request }) => {
    if (process.env.OLFX_LAB !== '1' || !process.env.OLFX_MEDIA_DIR?.includes('/.emby-stack/labs/'))
      throw new Error('Isolated lab required');
    const items = await request.get(`${base}/OpenLightFX/Studio/Items`, { headers });
    expect(items.ok()).toBeTruthy();
    movie = (await items.json()).find((item: any) => item.name === 'clip-a');
    expect(movie?.runtimeMs).toBe(10000);

    const title = `Sidecar-${browser}-${Date.now()}`;
    await create(page, title);
    const firstTrackWrite = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes('/OpenLightFX/Studio/Tracks/')
    );
    await fileMenu(page, '^Save');
    const initialResponse = await firstTrackWrite;
    expect(initialResponse.ok()).toBeTruthy();
    const initialResult = await initialResponse.json();
    const trackId = initialResult.trackId as string;
    const initial = await getTrack(request, trackId);

    const enriched = structuredClone(initial.track);
    const effect = roundTripTrack().effects[0];
    enriched.effects = [effect];
    enriched.metadata = {
      ...enriched.metadata,
      author: 'Sidecar acceptance author',
      description: 'Metadata survives editor sidecar lifecycle',
      tags: ['sidecar', 'preserve'],
    };
    const enrichResponse = await request.put(
      `${base}/OpenLightFX/Studio/Tracks/${trackId}?itemId=${movie.itemId}`,
      {
        headers: {
          ...headers,
          'Content-Type': 'application/octet-stream',
          'If-Match': initialResult.updatedAt,
        },
        data: Buffer.from(encodeTrack(enriched)),
      }
    );
    expect(enrichResponse.ok()).toBeTruthy();
    const enrichedResult = await enrichResponse.json();

    const sidecarInput = {
      version: 1,
      itemId: movie.itemId,
      trackId,
      sceneMarkers: [
        { id: 'manual-real', timeMs: 125, label: 'Manual', kind: 'manual' },
        { id: 'chapter-real', timeMs: 250, label: 'Chapter', kind: 'chapter' },
        { id: 'detected-real', timeMs: 375, label: 'Detected', kind: 'detected' },
      ],
      channelGroups: [
        {
          id: 'mirror-real',
          name: 'Mirror',
          mode: 'mirror',
          channelIds: ['left', 'right'],
          spreadMs: 0,
        },
        {
          id: 'spread-real',
          name: 'Spread',
          mode: 'spread',
          channelIds: ['left', 'right'],
          spreadMs: 180,
        },
        {
          id: 'alternate-real',
          name: 'Alternate',
          mode: 'alternate',
          channelIds: ['left', 'right'],
          spreadMs: 0,
        },
      ],
      pluginMetadata: { source: 'controlled-real-lab', preserved: true },
      undo: ['plugin filters this'],
      Duration: 10000,
    };
    const expectedSidecar = {
      version: 1,
      itemId: movie.itemId,
      trackId,
      sceneMarkers: sidecarInput.sceneMarkers,
      channelGroups: sidecarInput.channelGroups,
      pluginMetadata: sidecarInput.pluginMetadata,
    };
    const seedResponse = await request.put(
      `${base}/OpenLightFX/Studio/Projects/${trackId}?itemId=${movie.itemId}`,
      { headers: { ...headers, 'Content-Type': 'application/json' }, data: sidecarInput }
    );
    expect(seedResponse.ok()).toBeTruthy();
    expect(await getSidecar(request, trackId)).toEqual(expectedSidecar);

    await page.reload();
    await expect(page.getByLabel('Track title', { exact: true })).toHaveValue(title);
    await page.getByLabel('Track title', { exact: true }).fill(`Recovered-${title}`);
    await expect
      .poll(async () => {
        const record = await readRecovery(page);
        return record?.itemId === movie.itemId && record?.trackId === trackId;
      })
      .toBe(true);
    expect(await readRecovery(page)).toMatchObject({
      key: `${movie.itemId}:${trackId}`,
      dirty: true,
      sidecar: expectedSidecar,
      track: { metadata: { title: `Recovered-${title}` } },
    });
    await page.reload();
    await expect(page.getByRole('status', { name: 'Crash recovery' })).toContainText('restored');
    await expect(page.getByLabel('Track title', { exact: true })).toHaveValue(`Recovered-${title}`);

    const trackPut = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes(`/Studio/Tracks/${trackId}?itemId=${movie.itemId}`)
    );
    const projectPut = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes(`/Studio/Projects/${trackId}?itemId=${movie.itemId}`)
    );
    await fileMenu(page, '^Save');
    const savedTrackResponse = await trackPut;
    expect(savedTrackResponse.ok()).toBeTruthy();
    expect(savedTrackResponse.request().headers()['if-match']).toBe(enrichedResult.updatedAt);
    expect((await projectPut).ok()).toBeTruthy();
    const recoveredTrack = await getTrack(request, trackId);
    expect(recoveredTrack.track.metadata).toMatchObject({
      title: `Recovered-${title}`,
      author: enriched.metadata.author,
      description: enriched.metadata.description,
      tags: enriched.metadata.tags,
    });
    expect(recoveredTrack.track.effects).toEqual(enriched.effects);
    expect(recoveredTrack.track.keyframes).toEqual(enriched.keyframes);
    expect(await getSidecar(request, trackId)).toEqual(expectedSidecar);
    expect(recoveredTrack.bytes).toEqual(Buffer.from(encodeTrack(recoveredTrack.track)));

    const external = structuredClone(recoveredTrack.track);
    external.metadata.author = 'Independent server edit';
    const externalWrite = await request.put(
      `${base}/OpenLightFX/Studio/Tracks/${trackId}?itemId=${movie.itemId}`,
      {
        headers: {
          ...headers,
          'Content-Type': 'application/octet-stream',
          'If-Match': (await savedTrackResponse.json()).updatedAt,
        },
        data: Buffer.from(encodeTrack(external)),
      }
    );
    expect(externalWrite.ok()).toBeTruthy();
    const externalResult = await externalWrite.json();
    await page.getByLabel('Track title', { exact: true }).fill(`SaveAsNew-${title}`);
    await fileMenu(page, '^Save');
    await expect(
      page.getByRole('button', { name: 'Save as new track', exact: true })
    ).toBeVisible();
    const copyTrackResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes('/Studio/Tracks/') &&
        !response.url().includes(`/Tracks/${trackId}?itemId=${movie.itemId}`)
    );
    const copyProjectResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes('/Studio/Projects/') &&
        !response.url().includes(`/Projects/${trackId}?itemId=${movie.itemId}`)
    );
    await page.getByRole('button', { name: 'Save as new track', exact: true }).click();
    const copyTrackInfo = await copyTrackResponse;
    expect(copyTrackInfo.ok()).toBeTruthy();
    expect((await copyProjectResponse).ok()).toBeTruthy();
    const copyId = (await copyTrackInfo.json()).trackId as string;
    expect(copyId).not.toBe(trackId);

    const originalAfterCopy = await getTrack(request, trackId);
    expect(originalAfterCopy.track).toEqual(decodeTrack(Buffer.from(encodeTrack(external))));
    expect(originalAfterCopy.track.metadata.author).toBe('Independent server edit');
    expect(await getSidecar(request, trackId)).toEqual(expectedSidecar);
    const copiedTrack = await getTrack(request, copyId);
    expect(copiedTrack.track.metadata).toMatchObject({
      title: `SaveAsNew-${title}`,
      author: enriched.metadata.author,
      description: enriched.metadata.description,
      tags: enriched.metadata.tags,
    });
    expect(copiedTrack.track.effects).toEqual(recoveredTrack.track.effects);
    expect(copiedTrack.track.keyframes).toEqual(recoveredTrack.track.keyframes);
    const copiedSidecar = { ...expectedSidecar, trackId: copyId };
    expect(await getSidecar(request, copyId)).toEqual(copiedSidecar);

    await page.reload();
    await expect(page.getByLabel('Track title', { exact: true })).toHaveValue(`SaveAsNew-${title}`);
    expect(await getSidecar(request, copyId)).toEqual(copiedSidecar);
    expect((await getTrack(request, copyId)).track.effects).toEqual(enriched.effects);
    expect((await getTrack(request, copyId)).track.metadata.author).toBe(enriched.metadata.author);
    expect(externalResult.updatedAt).not.toBe(enrichedResult.updatedAt);
  }
);
