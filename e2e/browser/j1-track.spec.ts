import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';
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

async function openMovie(page, tracks: unknown[] = []) {
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
    await expect(page.getByText('First track')).toBeVisible();
    await expect(page.getByText('Second track')).toBeVisible();
    await expect(page.getByText('Plays in Emby')).toHaveCount(1);
    await expect(page.getByText('5.0', { exact: true })).toBeVisible();
  }
);

requirement(
  'TRACK-002 @browser create track opens the editor with the room-suggested layout',
  async ({ page }) => {
    await openMovie(page);
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
