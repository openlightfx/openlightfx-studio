import { expect, type Page, test } from '@playwright/test';
import { requirement } from '../harness/requirement';

const movies = [
  {
    Id: 'm1',
    Name: 'Clip Short',
    ProductionYear: 2020,
    RunTimeTicks: 60_000_000,
    ImageTags: { Primary: 'short-poster' },
    TrackCount: 0,
  },
  {
    Id: 'm2',
    Name: 'Clip Long',
    ProductionYear: 2022,
    RunTimeTicks: 120_000_000,
    TrackCount: 1,
    HasActiveTrack: true,
  },
];

async function mockLibrary(page: Page, rooms: unknown[] = []) {
  await page.unroute('**/OpenLightFX/Studio/Rooms');
  await page.unroute('**/OpenLightFX/Studio/Session');
  await page.unroute('**/OpenLightFX/Studio/Items**');
  await page.route('**/OpenLightFX/Studio/Session', (route) =>
    route.fulfill({ json: { accessToken: 'browser-test' } })
  );
  await page.route('**/OpenLightFX/Studio/Rooms', (route) => route.fulfill({ json: rooms }));
  await page.route('**/OpenLightFX/Studio/Items**', async (route) => {
    const search = new URL(route.request().url()).searchParams.get('search')?.toLowerCase() ?? '';
    await route.fulfill({
      json: movies.filter((movie) => movie.Name.toLowerCase().includes(search)),
    });
  });
  await page.goto('/?api_key=browser-test#/library');
  await expect(page.getByRole('link', { name: /clip short/i })).toBeVisible();
}

test('Library clearly shows a loading state until the initial movie request finishes', async ({
  page,
}) => {
  await page.route('**/OpenLightFX/Studio/Session', (route) =>
    route.fulfill({ json: { accessToken: 'browser-test' } })
  );
  await page.route('**/OpenLightFX/Studio/Rooms', (route) => route.fulfill({ json: [] }));
  await page.route('**/OpenLightFX/Studio/Items**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ json: movies });
  });
  await page.goto('/?api_key=browser-test#/library');
  await expect(page.getByRole('status', { name: 'Loading movies' })).toBeVisible();
  await expect(page.getByText('Loading movies…')).toBeVisible();
  await expect(page.locator('.placeholder')).toHaveCount(8);
  await expect(page.getByRole('link', { name: /clip short/i })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading movies' })).toHaveCount(0);
});

requirement(
  'LIB-001 @browser library shows movie poster cards, years, and track badges',
  async ({ page }) => {
    await mockLibrary(page);
    const short = page.getByRole('link', { name: /clip short, 2020/i });
    await expect(short.locator('img')).toHaveAttribute(
      'src',
      /m1\/Images\/Primary\?tag=short-poster/
    );
    await expect(short).toContainText('No track');
    await expect(page.getByRole('link', { name: /clip long, 2022/i })).toContainText(
      '1 track · Plays in Emby'
    );
  }
);

requirement(
  'LIB-002 @browser title search filters movies and reports no matches',
  async ({ page }) => {
    await mockLibrary(page);
    const search = page.getByRole('searchbox', { name: /search/i });
    await search.fill('long');
    await expect(page.getByRole('link', { name: /clip long/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /clip short/i })).toHaveCount(0);
    await search.fill('zzz');
    await expect(page.getByText(/no movies match "zzz"/i)).toBeVisible();
    await page.getByRole('button', { name: /clear search/i }).click();
    await expect(page.getByRole('link', { name: /clip short/i })).toBeVisible();
  }
);

requirement('LIB-003 @browser selecting a movie opens its Movie screen', async ({ page }) => {
  await mockLibrary(page);
  await page.getByRole('link', { name: /clip short/i }).click();
  await expect(page).toHaveURL(/#\/movie\/m1$/);
});

requirement(
  'LIB-004 @browser no-room strip links to room setup and hides when a room exists',
  async ({ page }) => {
    await mockLibrary(page);
    const strip = page.locator('.no-room');
    await expect(strip).toBeVisible();
    await strip.getByRole('link', { name: /set up a room/i }).click();
    await expect(page).toHaveURL(/#\/rooms$/);
    await mockLibrary(page, [
      {
        id: 'room-1',
        name: 'Living Room',
        screen: { deviceId: 'screen-1', deviceName: 'TV', appName: 'Emby' },
        bulbs: [],
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ]);
    await page.reload();
    await expect(page.locator('.no-room')).toHaveCount(0);
  }
);
