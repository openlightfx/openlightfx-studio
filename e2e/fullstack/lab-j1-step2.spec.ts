import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const { requirement } = await import(
  pathToFileURL(`${process.cwd()}/e2e/harness/requirement.ts`).href
);
const browser = process.env.OLFX_LAB_BROWSER ?? 'chromium';
if (browser !== 'chromium' && browser !== 'firefox') throw new Error('Invalid OLFX_LAB_BROWSER');
test.use({ browserName: browser });
const base = process.env.OLFX_EMBY_URL!;
const headers = { 'X-Emby-Token': process.env.OLFX_API_KEY! };
const media = process.env.OLFX_MEDIA_DIR!;
const names = ['Clip Short', 'Clip Long', 'Clip Without Poster'];
let movies: any[];

async function api(request: APIRequestContext, url: string) {
  const response = await request.get(`${base}${url}`, { headers });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function openLibrary(page: Page) {
  await page.goto(`${base}/web/index.html`);
  await page.getByText('admin', { exact: true }).click();
  await page.locator('input[type=password]').fill('openlightfx-test');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/#!\/home/, { timeout: 15000 });
  await page.goto(`${base}/emby/OpenLightFX/studio/#/library`);
  await expect(page.locator('a.movie')).toHaveCount(3);
  await expect(page).not.toHaveURL(/api_key/);
}

test.beforeAll(async ({ request }) => {
  // Only disposable lab media: never accept the owner’s movie directory.
  if (process.env.OLFX_LAB !== '1' || !media?.includes('/.emby-stack/labs/'))
    throw new Error('An isolated lab is required');
  const source = path.join(media, 'clip-a-h264.mp4');
  for (let i = 0; i < names.length; i++) {
    const dir = path.join(media, 'j1-step2-movies', names[i]);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(source, path.join(dir, `${names[i]}.mp4`));
    fs.writeFileSync(
      path.join(dir, 'movie.nfo'),
      `<movie><title>${names[i]}</title><year>${2020 + i}</year><dateadded>202${i}-01-01 00:00:00</dateadded><lockdata>true</lockdata></movie>`
    );
    if (i === 0)
      execFileSync('ffmpeg', [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=160x240',
        '-frames:v',
        '1',
        path.join(dir, 'poster.png'),
      ]);
  }
  const tv = path.join(media, 'j1-step2-tv', 'Clip Series', 'Season 01');
  fs.mkdirSync(tv, { recursive: true });
  fs.copyFileSync(source, path.join(tv, 'Clip Series - S01E01.mp4'));
  fs.writeFileSync(
    path.join(tv, '..', 'tvshow.nfo'),
    '<tvshow><title>Clip Series</title><year>2023</year><lockdata>true</lockdata></tvshow>'
  );
  // Replace only this disposable lab's broad /media library with separate movie/TV roots.
  const folders = await api(request, '/emby/Library/VirtualFolders');
  for (const folder of folders)
    expect(
      (
        await request.delete(
          `${base}/emby/Library/VirtualFolders?id=${encodeURIComponent(folder.Id)}&refreshLibrary=true`,
          { headers }
        )
      ).ok()
    ).toBeTruthy();
  for (const [name, type, root] of [
    ['Step 2 Movies', 'movies', 'j1-step2-movies'],
    ['Step 2 TV', 'tvshows', 'j1-step2-tv'],
  ]) {
    expect(
      (
        await request.post(
          `${base}/emby/Library/VirtualFolders?name=${encodeURIComponent(name)}&collectionType=${type}&paths=/media/${root}&refreshLibrary=true`,
          { headers }
        )
      ).ok()
    ).toBeTruthy();
  }
  await expect
    .poll(
      async () =>
        (await api(request, '/emby/Items?Recursive=true&IncludeItemTypes=Movie')).Items.map(
          (item: any) => item.Name
        ).sort(),
      { timeout: 90000 }
    )
    .toEqual([...names].sort());
  await expect
    .poll(
      async () =>
        (await api(request, '/emby/Items?Recursive=true&IncludeItemTypes=Series')).Items.length,
      { timeout: 90000 }
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await api(request, '/emby/Items?Recursive=true&IncludeItemTypes=Episode')).Items.length,
      { timeout: 90000 }
    )
    .toBe(1);
  movies = await api(request, '/OpenLightFX/Studio/Items');
});

requirement(
  'LIB-001 @fullstack three movies and one series produce three cards with real posters, years, saved and active track badges',
  async ({ page, request }) => {
    const pages = await Promise.all(
      [0, 1, 2].map((index) =>
        api(request, `/OpenLightFX/Studio/Items?startIndex=${index}&limit=1`)
      )
    );
    expect(pages.map((page) => page.length)).toEqual([1, 1, 1]);
    expect(
      pages
        .flat()
        .map((item) => item.name)
        .sort()
    ).toEqual([...names].sort());
    const movie = movies.find((item) => item.name === 'Clip Short');
    const bytes = fs.readFileSync(
      path.join(process.cwd(), 'tests/fixtures/sampling/roundtrip.lightfx')
    );
    for (const track of ['step2-track-one', 'step2-track-two'])
      expect(
        (
          await request.put(`${base}/OpenLightFX/Studio/Tracks/${track}?itemId=${movie.itemId}`, {
            headers: { ...headers, 'Content-Type': 'application/octet-stream' },
            data: bytes,
          })
        ).ok()
      ).toBeTruthy();
    expect(
      (
        await request.post(`${base}/OpenLightFX/Studio/Items/${movie.itemId}/ActiveTrack`, {
          headers,
          data: { trackId: 'step2-track-one' },
        })
      ).ok()
    ).toBeTruthy();
    expect(
      (
        await request.put(
          `${base}/OpenLightFX/Studio/Tracks/step2-long-track?itemId=${movies.find((item) => item.name === 'Clip Long').itemId}`,
          {
            headers: { ...headers, 'Content-Type': 'application/octet-stream' },
            data: bytes,
          }
        )
      ).ok()
    ).toBeTruthy();
    await openLibrary(page);
    await expect(
      page.getByRole('link', { name: 'Clip Long, 2021', exact: true }).locator('.badge')
    ).toHaveText('1 track');
    await expect(
      page.getByRole('link', { name: 'Clip Without Poster, 2022', exact: true }).locator('.badge')
    ).toHaveText('No track');
    await expect(page.locator('a.movie .title')).toHaveText([...names].sort());
    await expect(page.getByText('Clip Series', { exact: true })).toHaveCount(0);
    for (let i = 0; i < names.length; i++)
      await expect(
        page.getByRole('link', { name: `${names[i]}, ${2020 + i}`, exact: true })
      ).toBeVisible();
    const card = page.getByRole('link', { name: 'Clip Short, 2020', exact: true });
    await expect(card.locator('.badge')).toHaveText('2 tracks · 1 plays in Emby');
    const image = card.locator('img');
    await expect(image).toBeVisible();
    expect(await image.getAttribute('src')).not.toMatch(/api_key|access_token|token=/i);
    await expect
      .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    const posterResponse = await request.get(
      new URL((await image.getAttribute('src'))!, base).href
    );
    expect(posterResponse.ok()).toBeTruthy();
    await expect(
      page.getByRole('link', { name: /Clip Without Poster/ }).locator('.poster-fallback')
    ).toHaveText('Clip Without Poster');
    await expect(
      page.getByRole('link', { name: /Clip Without Poster/ }).locator('img')
    ).toHaveCount(0);
  }
);

requirement(
  'LIB-002 @fullstack server-side search completes within one second and Clear search restores all movies',
  async ({ page }) => {
    await openLibrary(page);
    const response = page.waitForResponse(
      (response) =>
        response.url().includes('/Studio/Items?') &&
        new URL(response.url()).searchParams.get('search') === 'long'
    );
    const start = Date.now();
    await page.getByRole('searchbox').fill('long');
    await expect(page.locator('a.movie')).toHaveCount(1, { timeout: 1000 });
    await expect(page.locator('a.movie .title')).toHaveText('Clip Long');
    expect(Date.now() - start).toBeLessThanOrEqual(1000);
    expect((await response).ok()).toBeTruthy();
    await page.getByRole('searchbox').fill('zzz');
    await expect(page.getByText(/No movies match "zzz"/)).toBeVisible();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(page.locator('a.movie')).toHaveCount(3);
  }
);

requirement(
  'LIB-003 @fullstack clicking or pressing Enter opens the correct movie and Back restores the library',
  async ({ page }) => {
    await openLibrary(page);
    for (const keyboard of [false, true]) {
      const card = page.getByRole('link', { name: 'Clip Long, 2021', exact: true });
      if (keyboard) {
        await card.focus();
        await page.keyboard.press('Enter');
      } else await card.click();
      await expect(page).toHaveURL(
        new RegExp(`#/movie/${movies.find((item) => item.name === 'Clip Long').itemId}$`)
      );
      await expect(page.getByRole('heading', { name: 'Clip Long', exact: true })).toBeVisible();
      await page.goBack();
      await expect(page.locator('a.movie')).toHaveCount(3);
    }
  }
);

requirement(
  'LIB-001 @fullstack every sort order works and is remembered after reload',
  async ({ page, request }) => {
    await openLibrary(page);
    const rows = await api(request, '/OpenLightFX/Studio/Items');
    for (let index = 0; index < names.length; index++)
      expect(Date.parse(rows.find((item: any) => item.name === names[index]).dateAdded)).toBe(
        Date.parse(`202${index}-01-01T00:00:00Z`)
      );
    const expectedOrders: Record<string, string[]> = {
      recent: ['Clip Without Poster', 'Clip Long', 'Clip Short'],
      tracked: ['Clip Short', 'Clip Long', 'Clip Without Poster'],
      title: ['Clip Long', 'Clip Short', 'Clip Without Poster'],
    };
    const picker = page.getByLabel('Sort', { exact: true });
    for (const order of ['recent', 'tracked', 'title']) {
      const expected = expectedOrders[order];
      await picker.selectOption(order);
      await expect(page.locator('a.movie .title')).toHaveText(expected);
      await page.reload();
      await expect(picker).toHaveValue(order);
      await expect(page.locator('a.movie .title')).toHaveText(expected);
    }
  }
);

requirement(
  'LIB-004 @fullstack no-room strip opens Rooms and disappears after saving a real room',
  async ({ page, request }) => {
    for (const room of await api(request, '/OpenLightFX/Studio/Rooms'))
      expect(
        (await request.delete(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, { headers })).ok()
      ).toBeTruthy();
    await openLibrary(page);
    await expect(page.locator('.no-room')).toBeVisible();
    await page.getByRole('link', { name: 'Set up a room', exact: true }).click();
    await expect(page).toHaveURL(/#\/rooms$/);
    const devices = await api(request, '/OpenLightFX/Studio/Devices');
    await page.getByLabel('Room name').fill('Step 2 Room');
    await page.getByLabel('Screen (the Emby app in this room)').selectOption(devices[0].deviceId);
    await page.getByRole('button', { name: 'Save room', exact: true }).click();
    await expect(page.getByText('Room saved.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Next: pick a movie →', exact: true }).click();
    await expect(page).toHaveURL(/#\/library$/);
    await expect(page.locator('a.movie')).toHaveCount(3);
    await expect(page.locator('.no-room')).toHaveCount(0);
  }
);
