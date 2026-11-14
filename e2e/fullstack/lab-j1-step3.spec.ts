import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { requirement } = await import(pathToFileURL(`${root}/e2e/harness/requirement.ts`).href);
const { decodeTrack, encodeTrack, changeTrackLayout } = await import(
  pathToFileURL(`${root}/src/lib/domain/index.ts`).href
);
const browser = process.env.OLFX_LAB_BROWSER ?? 'chromium';
if (browser !== 'chromium' && browser !== 'firefox') throw new Error('Invalid OLFX_LAB_BROWSER');
test.use({ browserName: browser });
test.describe.configure({ mode: 'serial' });
const base = process.env.OLFX_EMBY_URL!;
const headers = { 'X-Emby-Token': process.env.OLFX_API_KEY! };
let movie: any;
let bulbs: any[];
let room: any;
const seeded = decodeTrack(fs.readFileSync(`${root}/tests/fixtures/sampling/roundtrip.lightfx`));

async function get(request: APIRequestContext, url: string) {
  const response = await request.get(`${base}/OpenLightFX/Studio/${url}`, { headers });
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
async function openMovie(page: Page) {
  await page.goto(`${base}/emby/OpenLightFX/studio/#/movie/${movie.itemId}`);
  await expect(page.getByRole('heading', { name: movie.name, exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/api_key/);
}
async function save(page: Page, request: APIRequestContext) {
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().includes('/Studio/Tracks/')
  );
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Save/ }).click();
  const saved = await response;
  expect(saved.ok()).toBeTruthy();
  const id = new URL(saved.url()).pathname.split('/').at(-1)!;
  const bytes = await request.get(
    `${base}/OpenLightFX/Studio/Tracks/${id}?itemId=${movie.itemId}`,
    { headers }
  );
  expect(bytes.ok()).toBeTruthy();
  return decodeTrack(new Uint8Array(await bytes.body()));
}
async function chooseFile(page: Page, bytes: Uint8Array, name = 'import.lightfx') {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open a .lightfx file…', exact: true }).click();
  await (
    await chooser
  ).setFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
}

test.beforeAll(async ({ request }) => {
  if (process.env.OLFX_LAB !== '1' || !process.env.OLFX_MEDIA_DIR?.includes('/.emby-stack/labs/'))
    throw new Error('An isolated lab is required');
  for (const device of ['step3-screen', 'step3-second-screen'])
    expect(
      (
        await request.post(`${base}/emby/Users/AuthenticateByName`, {
          headers: {
            'X-Emby-Authorization': `MediaBrowser Client="Step 3", Device="Movie TV", DeviceId="${device}", Version="1.0"`,
          },
          data: { Username: 'admin', Pw: 'openlightfx-test' },
        })
      ).ok()
    ).toBeTruthy();
  movie = (await get(request, 'Items')).find((item: any) => item.name === 'clip-a');
  expect(movie.runtimeMs).toBe(10000);
  bulbs = await get(request, 'Bulbs');
  expect(bulbs.map((bulb) => bulb.id).sort()).toEqual(['center-bulb', 'left-bulb', 'right-bulb']);
  for (const [id, title, layout] of [
    ['step3-first', 'First lighting', 'LAYOUT_3_0'],
    ['step3-second', 'Second lighting', 'LAYOUT_5_0'],
  ]) {
    const track = changeTrackLayout(structuredClone(seeded), layout).track;
    track.metadata.title = title;
    track.metadata.author = 'Step 3 author';
    expect(
      (
        await request.put(`${base}/OpenLightFX/Studio/Tracks/${id}?itemId=${movie.itemId}`, {
          headers: { ...headers, 'Content-Type': 'application/octet-stream' },
          data: Buffer.from(encodeTrack(track)),
        })
      ).ok()
    ).toBeTruthy();
  }
  expect(
    (
      await request.post(`${base}/OpenLightFX/Studio/Items/${movie.itemId}/ActiveTrack`, {
        headers,
        data: { trackId: 'step3-first' },
      })
    ).ok()
  ).toBeTruthy();
});

test.beforeEach(async ({ page, request }) => {
  await login(page);
  for (const existing of await get(request, 'Rooms'))
    expect(
      (await request.delete(`${base}/OpenLightFX/Studio/Rooms/${existing.id}`, { headers })).ok()
    ).toBeTruthy();
  const created = await request.post(`${base}/OpenLightFX/Studio/Rooms`, {
    headers,
    data: {
      name: 'Living Room',
      screenDeviceId: 'step3-screen',
      bulbs: [
        { id: 'left-bulb', position: 'left' },
        { id: 'center-bulb', position: 'center' },
        { id: 'right-bulb', position: 'right' },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  room = await created.json();
});

requirement(
  'TRACK-001 @fullstack two saved tracks show metadata, one active badge, and Open loads the correct persisted lanes',
  async ({ page, request }) => {
    await openMovie(page);
    const rows = page.locator('.track-row');
    await expect(rows).toHaveCount(2);
    for (const title of ['First lighting', 'Second lighting']) {
      const row = rows.filter({ hasText: title });
      await expect(row).toContainText('Step 3 author');
      await expect(row).not.toContainText('Not saved');
      await expect(row.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
    }
    await expect(rows.filter({ hasText: 'First lighting' })).toContainText('3.0');
    await expect(rows.filter({ hasText: 'Second lighting' })).toContainText('5.0');
    await expect(rows.locator('.badge')).toHaveCount(1);
    await expect(rows.filter({ hasText: 'First lighting' }).locator('.badge')).toHaveText(
      'Plays in Emby'
    );
    await rows
      .filter({ hasText: 'Second lighting' })
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`#/edit/${movie.itemId}/step3-second$`));
    await expect(page.getByRole('button', { name: 'File', exact: true })).toBeVisible();
    await expect(page.locator('.lane')).toHaveCount(5);
    await expect(page.getByRole('textbox', { name: 'Track title', exact: true })).toHaveValue(
      'Second lighting'
    );
    const saved = await save(page, request);
    expect(saved.metadata.title).toBe('Second lighting');
    expect(saved.metadata.author).toBe('Step 3 author');
    expect(saved.metadata.channelLayout).toBe('LAYOUT_5_0');
    expect(saved.keyframes).toEqual(seeded.keyframes);
  }
);

requirement(
  'TRACK-002 @fullstack LCR room suggests 3.0 and creation remains unsaved until Save with exact movie metadata and dark lanes',
  async ({ page, request }) => {
    const before = await get(request, `Tracks?itemId=${movie.itemId}`);
    await openMovie(page);
    await expect(
      page.getByRole('button', { name: /3\.0.*Suggested for Living Room/s })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue('clip-a lighting');
    await page.getByLabel('Title', { exact: true }).fill('New three-channel lighting');
    await page.getByRole('button', { name: 'Create track', exact: true }).click();
    await expect(page.locator('.lane')).toHaveCount(3);
    expect(await get(request, `Tracks?itemId=${movie.itemId}`)).toEqual(before);
    const saved = await save(page, request);
    expect(saved.version).toBe(1);
    expect(saved.metadata).toMatchObject({
      title: 'New three-channel lighting',
      movieTitle: movie.name,
      year: movie.year,
      durationMs: 10000,
      channelLayout: 'LAYOUT_3_0',
    });
    expect(saved.channels.map((channel) => channel.id)).toEqual(['left', 'center', 'right']);
    expect(saved.channels.map((channel) => channel.displayName)).toEqual([
      'Left',
      'Center',
      'Right',
    ]);
    for (const channel of saved.channels) {
      expect(channel.defaultColor).toEqual({ r: 0, g: 0, b: 0 });
      expect(channel.defaultBrightness).toBe(0);
    }
    expect(saved.keyframes).toEqual([]);
    expect(saved.effects).toEqual([]);
  }
);

requirement(
  'TRACK-002 @fullstack no-room creation defaults to 2.0 and does not write a track',
  async ({ page, request }) => {
    expect(
      (await request.delete(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, { headers })).ok()
    ).toBeTruthy();
    const before = await get(request, `Tracks?itemId=${movie.itemId}`);
    await openMovie(page);
    await expect(
      page.getByRole('button', { name: /2\.0.*Selected without a room/s })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('For room', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Create track', exact: true }).click();
    await expect(page.locator('.lane')).toHaveCount(2);
    await expect(
      page.getByText('Set up a room to preview on your lights.', { exact: false })
    ).toBeVisible();
    expect(await get(request, `Tracks?itemId=${movie.itemId}`)).toEqual(before);
  }
);

requirement(
  'TRACK-002 @fullstack room selection updates layout and the first editor preview room, with coverage supplied by the plugin',
  async ({ page, request }) => {
    expect(
      (
        await request.put(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, {
          headers: { ...headers, 'If-Match': room.updatedAt },
          data: {
            name: room.name,
            screenDeviceId: 'step3-screen',
            bulbs: [
              { id: 'left-bulb', position: 'left' },
              { id: 'right-bulb', position: 'right' },
            ],
          },
        })
      ).ok()
    ).toBeTruthy();
    const created = await request.post(`${base}/OpenLightFX/Studio/Rooms`, {
      headers,
      data: {
        name: 'Ambient Room',
        screenDeviceId: 'step3-second-screen',
        bulbs: [{ id: 'center-bulb', position: 'ambient' }],
      },
    });
    expect(created.ok()).toBeTruthy();
    const second = await created.json();
    await openMovie(page);
    await page.getByLabel('For room', { exact: true }).selectOption(second.id);
    await expect(
      page.getByRole('button', { name: /Ambient.*Every bulb plays it/s })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /^5\.0/ })).toContainText(
      '5 channels fold · 1 bulb reached'
    );
    await page.getByRole('button', { name: 'Create track', exact: true }).click();
    await expect(page.locator('.lane')).toHaveCount(1);
    await expect(page.getByRole('combobox', { name: 'Preview room', exact: true })).toHaveValue(
      second.id
    );
  }
);

requirement(
  'TRACK-003 @fullstack mismatched file warns, Cancel preserves the movie, and Continue imports exact cues without writing until Save',
  async ({ page, request }) => {
    await openMovie(page);
    const before = await get(request, `Tracks?itemId=${movie.itemId}`);
    const source = changeTrackLayout(structuredClone(seeded), 'LAYOUT_5_0').track;
    source.metadata.movieTitle = 'Other movie';
    const cancelled = page.waitForEvent('dialog');
    await chooseFile(page, encodeTrack(source));
    const cancelDialog = await cancelled;
    expect(cancelDialog.message()).toContain('Other movie');
    expect(cancelDialog.message()).toContain('clip-a');
    await cancelDialog.dismiss();
    await expect(page).toHaveURL(new RegExp(`#/movie/${movie.itemId}$`));
    const continued = page.waitForEvent('dialog');
    await chooseFile(page, encodeTrack(source));
    await (await continued).accept();
    await expect(page).toHaveURL(new RegExp(`#/edit/${movie.itemId}/import$`));
    await expect(page.locator('.lane')).toHaveCount(5);
    expect(await get(request, `Tracks?itemId=${movie.itemId}`)).toEqual(before);
    const saved = await save(page, request);
    expect(saved.keyframes).toEqual(source.keyframes);
    expect(saved.effects).toEqual(source.effects);
    expect(saved.channels).toEqual(source.channels);
  }
);

requirement(
  'TRACK-003 @fullstack non-track files show the specified error and never navigate',
  async ({ page }) => {
    await openMovie(page);
    await chooseFile(page, new Uint8Array([137, 80, 78, 71]), 'poster.png');
    await expect(page.getByRole('alert')).toHaveText("That file isn't a .lightfx track.");
    await expect(page).toHaveURL(new RegExp(`#/movie/${movie.itemId}$`));
  }
);

requirement(
  'TRACK-004 @fullstack marketplace is a note and Library navigation remains functional',
  async ({ page }) => {
    await openMovie(page);
    await expect(
      page.getByText('Marketplace: browse tracks others have made — coming later.', { exact: true })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Marketplace/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Marketplace/i })).toHaveCount(0);
    await page.getByRole('link', { name: '← Library', exact: true }).click();
    await expect(page).toHaveURL(/#\/library$/);
    await expect(page.locator('a.movie').filter({ hasText: 'clip-a' })).toBeVisible();
  }
);
