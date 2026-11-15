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
    DateAdded: '2025-01-01T00:00:00Z',
  },
  {
    Id: 'm2',
    Name: 'Clip Long',
    ProductionYear: 2022,
    RunTimeTicks: 120_000_000,
    TrackCount: 1,
    DateAdded: '2020-01-01T00:00:00Z',
    HasActiveTrack: true,
  },
];

async function mockLibrary(page: Page, rooms: unknown[] = [], bulbs: unknown[] = []) {
  await page.unroute('**/OpenLightFX/Studio/Rooms');
  await page.unroute('**/OpenLightFX/Studio/Bulbs');
  await page.unroute('**/OpenLightFX/Studio/Session');
  await page.unroute('**/OpenLightFX/Studio/Items**');
  await page.route('**/OpenLightFX/Studio/Session', (route) =>
    route.fulfill({ json: { accessToken: 'browser-test' } })
  );
  await page.route('**/OpenLightFX/Studio/Rooms', (route) => route.fulfill({ json: rooms }));
  await page.route('**/OpenLightFX/Studio/Bulbs', (route) => route.fulfill({ json: bulbs }));
  await page.route('**/OpenLightFX/Studio/Items**', async (route) => {
    const search = new URL(route.request().url()).searchParams.get('search')?.toLowerCase() ?? '';
    await route.fulfill({
      json: movies.filter((movie) => movie.Name.toLowerCase().includes(search)),
    });
  });
  await page.route('**/OpenLightFX/Studio/Tracks?**', (route) => route.fulfill({ json: [] }));
  await page.goto('/?api_key=browser-test#/library');
  await expect(page.getByRole('link', { name: /clip short/i })).toBeVisible();
}

requirement(
  'LIB-001 @browser Library clearly shows a loading state until the initial movie request finishes',
  async ({ page }) => {
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
  }
);

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
  'LIB-004 @browser no-room strip links to Bulbs or Rooms based on named inventory',
  async ({ page }) => {
    let rooms: unknown[] = [];
    let bulbs: unknown[] = [];
    await page.route('**/OpenLightFX/Studio/Session', (route) =>
      route.fulfill({ json: { accessToken: 'browser-test' } })
    );
    await page.route('**/OpenLightFX/Studio/Rooms', (route) => route.fulfill({ json: rooms }));
    await page.route('**/OpenLightFX/Studio/Bulbs', (route) => route.fulfill({ json: bulbs }));
    await page.route('**/OpenLightFX/Studio/Items**', (route) => route.fulfill({ json: movies }));
    await page.route('**/OpenLightFX/Studio/Tracks?**', (route) => route.fulfill({ json: [] }));
    await page.goto('/?api_key=browser-test#/library');
    await page
      .locator('.no-room')
      .getByRole('link', { name: /find and name bulbs/i })
      .click();
    await expect(page).toHaveURL(/#\/bulbs$/);

    bulbs = [{ id: 'named', name: 'Desk lamp', isNamed: true }];
    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await expect(
      page.locator('.no-room').getByRole('link', { name: /set up a room/i })
    ).toBeVisible();
    rooms = [
      {
        id: 'room-1',
        name: 'Living Room',
        screen: { deviceId: 'screen-1', deviceName: 'TV', appName: 'Emby' },
        bulbs: [],
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ];
    await page.reload();
    await expect(page.locator('.no-room')).toHaveCount(0);
  }
);

requirement('LIB-001 @browser sort changes card order and survives reload', async ({ page }) => {
  await mockLibrary(page);
  const cards = page.locator('a.movie .title');
  await expect(cards).toHaveText(['Clip Long', 'Clip Short']);
  await page.getByLabel('Sort', { exact: true }).selectOption('recent');
  await expect(cards).toHaveText(['Clip Short', 'Clip Long']);
  await page.reload();
  await expect(page.getByLabel('Sort', { exact: true })).toHaveValue('recent');
  await expect(cards).toHaveText(['Clip Short', 'Clip Long']);
  await page.getByLabel('Sort', { exact: true }).selectOption('tracked');
  await expect(cards).toHaveText(['Clip Long', 'Clip Short']);
  await page.getByLabel('Sort', { exact: true }).selectOption('title');
  await expect(cards).toHaveText(['Clip Long', 'Clip Short']);
});

requirement(
  'LIB-001 @browser missing and failed posters show title fallbacks without broken images',
  async ({ page }) => {
    await page.route('**/emby/Items/m1/Images/**', (route) => route.fulfill({ status: 404 }));
    await mockLibrary(page);
    for (const title of ['Clip Short', 'Clip Long']) {
      const card = page.getByRole('link', { name: new RegExp(title) });
      await expect(card.locator('.poster-fallback')).toHaveText(title);
      await expect(card.locator('img')).toHaveCount(0);
    }
  }
);

requirement(
  'LIB-001 @browser an empty library tells the person to add movies, including whitespace searches',
  async ({ page }) => {
    await mockLibrary(page);
    await page.route('**/OpenLightFX/Studio/Items**', (route) => route.fulfill({ json: [] }));
    await page.reload();
    await expect(
      page.getByText('Emby has no movies yet. Add a movie library in Emby, then come back.')
    ).toBeVisible();
    await page.getByRole('searchbox').fill('   ');
    await expect(page.getByRole('status', { name: 'Loading movies' })).toHaveCount(0);
    await expect(
      page.getByText('Emby has no movies yet. Add a movie library in Emby, then come back.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0);
  }
);

requirement(
  'LIB-001 @browser reduced motion disables loading shimmer until the request completes',
  async ({ page }) => {
    await mockLibrary(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/OpenLightFX/Studio/Items**', async (route) => {
      await pending;
      await route.fulfill({ json: movies });
    });
    await page.reload();
    await expect(page.getByRole('status', { name: 'Loading movies' })).toBeVisible();
    expect(
      await page
        .locator('.placeholder')
        .first()
        .evaluate((element) => getComputedStyle(element).animationName)
    ).toBe('none');
    release();
    await expect(page.locator('a.movie')).toHaveCount(2);
  }
);

requirement(
  'LIB-002 @browser rapid typing sends one debounced query and obsolete responses never replace current results',
  async ({ page }) => {
    await mockLibrary(page);
    const queries: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/OpenLightFX/Studio/Items**', async (route) => {
      const query = new URL(route.request().url()).searchParams.get('search') ?? '';
      queries.push(query);
      if (query === 'short') await pending;
      await route.fulfill({
        json: movies.filter((movie) => movie.Name.toLowerCase().includes(query)),
      });
    });
    const search = page.getByRole('searchbox');
    await search.fill('short');
    await expect.poll(() => queries).toEqual(['short']);
    await search.fill('l');
    await search.fill('lo');
    await search.fill('long');
    await expect(page.getByRole('link', { name: /clip long/i })).toBeVisible({ timeout: 1000 });
    await expect(page.locator('a.movie')).toHaveCount(1);
    release();
    await expect.poll(() => queries).toEqual(['short', 'long']);
    await expect(page.locator('a.movie')).toContainText('Clip Long');
  }
);

requirement(
  'LIB-003 @browser keyboard Enter opens a movie and browser Back and Forward restore routes',
  async ({ page }) => {
    await mockLibrary(page);
    const card = page.getByRole('link', { name: /clip short/i });
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/movie\/m1$/);
    await expect(page.getByRole('heading', { name: 'Clip Short', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/#\/library$/);
    await expect(card).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/#\/movie\/m1$/);
  }
);

requirement(
  'LIB-001 @browser failed Items requests show no fake cards and Retry reloads movies',
  async ({ page }) => {
    await mockLibrary(page);
    let failed = true;
    await page.route('**/OpenLightFX/Studio/Items**', (route) =>
      failed ? route.fulfill({ status: 503 }) : route.fulfill({ json: movies })
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText(
      "Studio can't reach the OpenLightFX plugin."
    );
    await expect(page.locator('a.movie')).toHaveCount(0);
    failed = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('a.movie')).toHaveCount(2);
  }
);
