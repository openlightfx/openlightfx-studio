import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { decodeTrack, encodeTrack } from '../../src/lib/domain';
import { requirement } from '../harness/requirement';

const trackBytes = readFileSync(
  path.join(process.cwd(), 'tests/fixtures/sampling/roundtrip.lightfx')
);
const movies = [{ Id: 'm1', Name: 'Clip Short', ProductionYear: 2020, RunTimeTicks: 60_000_000 }];
const room = {
  id: 'room-1',
  name: 'Living Room',
  screen: { deviceId: 'screen-1', deviceName: 'TV', appName: 'Emby' },
  bulbs: [
    { id: 'left', position: 'left', follows: null },
    { id: 'center', position: 'center', follows: null },
    { id: 'right', position: 'right', follows: null },
  ],
  updatedAt: 'v1',
};

async function openMovie(page: Page, tracks: unknown[] = []) {
  await page.route('**/OpenLightFX/Studio/Session', (route) =>
    route.fulfill({ json: { accessToken: 'browser-test' } })
  );
  await page.route('**/OpenLightFX/Studio/Rooms', (route) => route.fulfill({ json: [room] }));
  await page.route('**/OpenLightFX/Studio/Items**', (route) => route.fulfill({ json: movies }));
  await page.route('**/OpenLightFX/Studio/Tracks?*', (route) => route.fulfill({ json: tracks }));
  await page.route('**/OpenLightFX/Studio/Tracks/*', (route) =>
    route.fulfill({ body: trackBytes, contentType: 'application/octet-stream' })
  );
  await page.route('**/OpenLightFX/Tracks/ByItem?*', (route) =>
    route.fulfill({ json: { globalSelectedTrack: '/movies/Clip Short/lightfx/track-a.lightfx' } })
  );
  await page.goto('/?api_key=browser-test#/movie/m1');
  await expect(page.getByRole('heading', { name: 'Clip Short' })).toBeVisible();
}

requirement(
  'TRACK-001 @browser movie screen lists saved tracks and marks the active track',
  async ({ page }) => {
    await openMovie(page, [
      { trackId: 'track-a', title: 'First track', itemId: 'm1', updatedAt: '2025-01-01T00:00:00Z' },
      {
        trackId: 'track-b',
        title: 'Second track',
        itemId: 'm1',
        updatedAt: '2025-01-02T00:00:00Z',
      },
    ]);
    await expect(page.locator('.track-row')).toHaveCount(2);
    await expect(page.getByText('First track')).toBeVisible();
    await expect(page.getByText('Second track')).toBeVisible();
    await expect(page.getByText('Plays in Emby')).toHaveCount(1);
    await expect(page.locator('.track-row').first()).toContainText('2.0');
    await expect(page.locator('.track-row').first()).toContainText('studio');
    await expect(page.locator('.track-row').first()).not.toContainText('Not saved');
  }
);

requirement(
  'TRACK-001 @browser Windows paths still mark only the selected active track',
  async ({ page }) => {
    await openMovie(page, [
      { trackId: 'track-a', title: 'First track', itemId: 'm1' },
      { trackId: 'track-b', title: 'Second track', itemId: 'm1' },
    ]);
    await page.route('**/OpenLightFX/Tracks/ByItem?*', (route) =>
      route.fulfill({
        json: { globalSelectedTrack: 'C:\\Movies\\Clip Short\\lightfx\\track-a.lightfx' },
      })
    );
    await page.reload();
    await expect(page.locator('.track-row .badge')).toHaveCount(1);
    await expect(
      page.locator('.track-row').filter({ hasText: 'First track' }).locator('.badge')
    ).toHaveText('Plays in Emby');
  }
);

requirement(
  'TRACK-002 @browser create track opens the editor with the room-suggested layout',
  async ({ page }) => {
    await openMovie(page);
    await expect(page.getByText('No tracks for this movie yet.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
    await expect(
      page.getByRole('button', { name: /3.0.*Suggested for Living Room/s })
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Create track' }).click();
    await expect(page).toHaveURL(/#\/edit\/m1\/new$/);
    const request = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('olfx-editor-request') ?? '{}')
    );
    expect(request).toMatchObject({
      itemId: 'm1',
      layout: 'LAYOUT_3_0',
      title: 'Clip Short lighting',
    });
  }
);

requirement(
  'TRACK-003 @browser importing a non-track file reports an error without navigating',
  async ({ page }) => {
    await openMovie(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open a .lightfx file…' }).click();
    await (
      await chooser
    ).setFiles({ name: 'poster.png', mimeType: 'image/png', buffer: Buffer.from('not a track') });
    await expect(page.getByRole('alert')).toHaveText("That file isn't a .lightfx track.");
    await expect(page).toHaveURL(/#\/movie\/m1$/);
  }
);

requirement(
  'TRACK-004 @browser marketplace is informational text and not an interactive control',
  async ({ page }) => {
    await openMovie(page);
    await expect(
      page.getByText('Marketplace: browse tracks others have made — coming later.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /marketplace/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /marketplace/i })).toHaveCount(0);
  }
);

async function chooseFile(page: Page, bytes: Uint8Array, name = 'import.lightfx') {
  const chooser = page.waitForEvent('filechooser');
  // Wait for content focus after a native confirmation, then use a complete Space
  // activation (keyup click), avoiding both native double-click and Enter-dialog races.
  await page.waitForFunction(() => document.hasFocus());
  await page.getByRole('button', { name: 'Open a .lightfx file…', exact: true }).press('Space');
  await (
    await chooser
  ).setFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
}

requirement(
  'TRACK-003 @browser movie mismatch names both movies, Cancel keeps the screen and Continue imports',
  async ({ page }) => {
    await openMovie(page);
    const track = decodeTrack(trackBytes);
    track.metadata.movieTitle = 'Other Movie';
    track.metadata.durationMs = 6000;
    const cancelled = page.waitForEvent('dialog');
    await chooseFile(page, encodeTrack(track));
    const cancelDialog = await cancelled;
    expect(cancelDialog.message()).toContain('Other Movie');
    expect(cancelDialog.message()).toContain('Clip Short');
    await cancelDialog.dismiss();
    await expect(page).toHaveURL(/#\/movie\/m1$/);
    const continued = page.waitForEvent('dialog');
    // The first upload verifies the native picker activation. Re-upload the same
    // file through its input here: Firefox may not reactivate a native chooser
    // immediately after dismissing a native confirmation.
    await page.locator('input[type="file"]').setInputFiles({
      name: 'import.lightfx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(encodeTrack(track)),
    });
    await (await continued).accept();
    await expect(page).toHaveURL(/#\/edit\/m1\/import$/);
  }
);

requirement(
  'TRACK-003 @browser matching files within the two-percent duration tolerance open without warning',
  async ({ page }) => {
    await openMovie(page);
    const track = decodeTrack(trackBytes);
    track.metadata.movieTitle = 'Clip Short';
    track.metadata.durationMs = 6120;
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await chooseFile(page, encodeTrack(track));
    await expect(page).toHaveURL(/#\/edit\/m1\/import$/);
    expect(dialogs).toEqual([]);
  }
);

requirement(
  'TRACK-003 @browser duration mismatches warn and invalid protobuf or invalid tracks do not open',
  async ({ page }) => {
    await openMovie(page);
    const track = decodeTrack(trackBytes);
    track.metadata.movieTitle = 'Clip Short';
    track.metadata.durationMs = 10000;
    // Title matches, but the warning still gives both durations and asks to continue.
    const warning = page.waitForEvent('dialog');
    await chooseFile(page, encodeTrack(track));
    const dialog = await warning;
    expect(dialog.message()).toContain('10 seconds');
    expect(dialog.message()).toContain('6 seconds');
    await dialog.dismiss();
    await expect(page).toHaveURL(/#\/movie\/m1$/);
    await chooseFile(page, new Uint8Array([255, 255, 255]));
    await expect(page.getByRole('alert')).toHaveText("That file isn't a .lightfx track.");
    track.metadata.durationMs = 0;
    await chooseFile(page, encodeTrack(track));
    await expect(page.getByRole('alert')).toHaveText("That file isn't a .lightfx track.");
    await expect(page).toHaveURL(/#\/movie\/m1$/);
  }
);

requirement(
  'TRACK-001 @browser semantic validation failures show a code and no Open control',
  async ({ page }) => {
    const track = decodeTrack(trackBytes);
    track.metadata.durationMs = 0;
    await openMovie(page, [{ trackId: 'bad', title: 'Invalid track', itemId: 'm1' }]);
    // Replace the bytes and reload to exercise a decodable but invalid saved track.
    await page.route('**/OpenLightFX/Studio/Tracks/bad?*', (route) =>
      route.fulfill({
        body: Buffer.from(encodeTrack(track)),
        contentType: 'application/octet-stream',
      })
    );
    await page.reload();
    await expect(page.locator('.track-row')).toContainText("Can't open: V-004");
    await expect(
      page.locator('.track-row').getByRole('button', { name: 'Open', exact: true })
    ).toHaveCount(0);
  }
);

requirement(
  'TRACK-002 @browser no room defaults to 2.0 and a custom title is passed to the unsaved editor',
  async ({ page }) => {
    await openMovie(page);
    await page.route('**/OpenLightFX/Studio/Rooms', (route) => route.fulfill({ json: [] }));
    await page.reload();
    await expect(
      page.getByRole('button', { name: /2\.0.*Selected without a room/s })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('For room')).toHaveCount(0);
    await expect(page.locator('.layout-map')).toHaveCount(4);
    await page.getByLabel('Title', { exact: true }).fill('  My lighting  ');
    await page.getByRole('button', { name: 'Create track', exact: true }).click();
    await expect(page).toHaveURL(/#\/edit\/m1\/new$/);
    expect(
      await page.evaluate(() => JSON.parse(sessionStorage.getItem('olfx-editor-request')!))
    ).toMatchObject({ title: 'My lighting', layout: 'LAYOUT_2_0' });
  }
);

requirement(
  'TRACK-002 @browser changing rooms updates the suggestion and retains the room for editor preview',
  async ({ page }) => {
    await openMovie(page);
    const second = {
      ...room,
      id: 'room-2',
      name: 'Ambient Room',
      bulbs: [{ id: 'ambient', position: 'ambient', follows: null }],
    };
    await page.route('**/OpenLightFX/Studio/Rooms', (route) =>
      route.fulfill({ json: [room, second] })
    );
    await page.reload();
    await page.getByLabel('For room', { exact: true }).selectOption('room-2');
    await expect(
      page.getByRole('button', { name: /Ambient.*Every bulb plays it/s })
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Create track', exact: true }).click();
    await expect(page).toHaveURL(/#\/edit\/m1\/new$/);
    expect(await page.evaluate(() => sessionStorage.getItem('olfx-preview-room'))).toBe('room-2');
  }
);

requirement(
  'TRACK-002 @browser unknown runtime blocks creation and a successful media probe enables it',
  async ({ page }) => {
    await openMovie(page);
    await page.route('**/OpenLightFX/Studio/Items**', (route) =>
      route.fulfill({ json: [{ ...movies[0], RunTimeTicks: 0 }] })
    );
    await page.route('**/OpenLightFX/Studio/Items/m1/MediaInfo', (route) =>
      route.fulfill({ json: { runtimeMs: 0 } })
    );
    await page.reload();
    await expect(page.getByRole('button', { name: 'Create track', exact: true })).toBeDisabled();
    await expect(page.getByText('Reading the movie’s length…')).toBeVisible();
    await page.route('**/OpenLightFX/Studio/Items/m1/MediaInfo', (route) =>
      route.fulfill({ json: { runtimeMs: 6000 } })
    );
    await page.reload();
    await expect(page.getByRole('button', { name: 'Create track', exact: true })).toBeEnabled();
  }
);

requirement(
  'TRACK-001 @browser current server metadata replaces stale cached selection and missing movies report an error',
  async ({ page }) => {
    await openMovie(page);
    await page.evaluate(() =>
      sessionStorage.setItem(
        'olfx-selected-movie',
        JSON.stringify({ itemId: 'm1', name: 'Stale title', runtimeMs: 0 })
      )
    );
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Clip Short', exact: true })).toBeVisible();
    await page.route('**/OpenLightFX/Studio/Items**', (route) => route.fulfill({ json: [] }));
    await page.reload();
    await expect(page.getByRole('alert')).toContainText(
      'This movie is no longer available in Emby.'
    );
    await page.getByRole('link', { name: 'Return to the Library', exact: true }).click();
    await expect(page).toHaveURL(/#\/library$/);
  }
);
