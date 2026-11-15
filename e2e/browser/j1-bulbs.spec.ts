import { expect } from '@playwright/test';
import { requirement } from '../harness/requirement';

const initialBulbs = [
  {
    id: 'bulb-a',
    name: 'Govee H6008',
    isNamed: false,
    protocol: 'govee',
    model: 'H6008',
    ipAddress: '192.0.2.10',
    roomId: null,
  },
  {
    id: 'bulb-b',
    name: 'Desk lamp',
    isNamed: true,
    protocol: 'wiz',
    model: 'A19',
    ipAddress: '192.0.2.11',
    roomId: 'room-1',
  },
];

async function mockBulbs(page, starting: typeof initialBulbs = []) {
  let bulbs = structuredClone(starting);
  const identified: string[] = [];
  await page.route('**/OpenLightFX/Studio/Session', (route) =>
    route.fulfill({ json: { accessToken: 'browser-test' } })
  );
  await page.route('**/OpenLightFX/Studio/Setup', (route) =>
    route.fulfill({ json: { roomCount: 0 } })
  );
  await page.route('**/OpenLightFX/Studio/CanManageRooms', (route) =>
    route.fulfill({ json: { canManageRooms: true } })
  );
  await page.route('**/OpenLightFX/Studio/Rooms', (route) =>
    route.fulfill({
      json: starting.some((bulb) => bulb.roomId)
        ? [{ id: 'room-1', name: 'Living Room', bulbs: [] }]
        : [],
    })
  );
  await page.route('**/OpenLightFX/Studio/Devices', (route) => route.fulfill({ json: [] }));
  await page.route('**/OpenLightFX/Studio/Bulbs**', async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ json: bulbs });
    if (method === 'PUT') {
      const target = bulbs.find((bulb) => bulb.id === id);
      if (!target) return route.fulfill({ status: 404, body: 'Bulb not found.' });
      target.name = route.request().postDataJSON().name;
      target.isNamed = true;
      return route.fulfill({ json: target });
    }
    if (method === 'DELETE') {
      if (bulbs.find((bulb) => bulb.id === id)?.roomId)
        return route.fulfill({ status: 409, body: 'Bulb is in a room.' });
      bulbs = bulbs.filter((bulb) => bulb.id !== id);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.continue();
  });
  await page.route('**/OpenLightFX/Studio/Bulbs/*/Identify', async (route) => {
    identified.push(
      decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? '')
    );
    await route.fulfill({ json: { durationMs: 1500 } });
  });
  await page.route('**/OpenLightFX/Studio/Discover', async (route) => {
    bulbs = structuredClone(initialBulbs.slice(0, 1));
    await route.fulfill({ json: { foundCount: 1, bulbs } });
  });
  return { identified, getBulbs: () => bulbs };
}

requirement(
  'FLOW-001 @browser a first run with no bulb inventory opens the Bulbs page',
  async ({ page }) => {
    await mockBulbs(page);
    await page.goto('/?api_key=browser-test');
    await expect(page).toHaveURL(/#\/bulbs$/);
    await expect(page.getByRole('heading', { name: 'Set up your bulbs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Find bulbs' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Skip setup/ })).toBeVisible();
  }
);

requirement(
  'BULB-001 @browser discovery persists an inventory item and naming makes it available',
  async ({ page }) => {
    const state = await mockBulbs(page);
    await page.goto('/?api_key=browser-test#/bulbs');
    await page.getByRole('button', { name: 'Find bulbs' }).click();
    await expect(page.getByRole('article', { name: 'Unnamed bulb' })).toBeVisible();
    await page.getByLabel('Name this bulb').fill('Window strip');
    await page.getByRole('button', { name: 'Name bulb' }).click();
    await expect(page.getByRole('article', { name: 'Window strip' })).toBeVisible();
    expect(state.getBulbs()[0].isNamed).toBe(true);
    await page.getByRole('link', { name: 'Rooms', exact: true }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Window strip' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Identify' })).toHaveCount(0);
  }
);

requirement(
  'BULB-001 @browser a long bulb inventory can be scrolled to its last bulb',
  async ({ page }) => {
    const manyBulbs = Array.from({ length: 24 }, (_, index) => ({
      ...initialBulbs[0],
      id: `bulb-${index + 1}`,
      name: `Bulb ${index + 1}`,
      isNamed: true,
    }));
    await mockBulbs(page, manyBulbs);
    await page.goto('/?api_key=browser-test#/bulbs');

    const scrollContainer = page.locator('.bulbs-app');
    await expect
      .poll(() =>
        scrollContainer.evaluate((element) => element.scrollHeight > element.clientHeight)
      )
      .toBe(true);
    await page.mouse.move(600, 600);
    await page.mouse.wheel(0, 3000);
    await expect(page.getByRole('article', { name: 'Bulb 24' })).toBeInViewport();
  }
);

requirement('BULB-002 @browser Identify targets the selected saved bulb', async ({ page }) => {
  const state = await mockBulbs(page, initialBulbs);
  await page.goto('/?api_key=browser-test#/bulbs');
  await page
    .getByRole('article', { name: 'Desk lamp' })
    .getByRole('button', { name: 'Identify' })
    .click();
  await expect.poll(() => state.identified).toEqual(['bulb-b']);
});

requirement(
  'BULB-003 @browser bulb names persist and assigned bulbs show their room',
  async ({ page }) => {
    const state = await mockBulbs(page, initialBulbs);
    await page.goto('/?api_key=browser-test#/bulbs');
    const assigned = page.getByRole('article', { name: 'Desk lamp' });
    await expect(assigned.getByText('In Living Room')).toBeVisible();
    await assigned.getByLabel('Bulb name').fill('Reading lamp');
    await assigned.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByRole('article', { name: 'Reading lamp' })).toBeVisible();
    expect(state.getBulbs().find((bulb) => bulb.id === 'bulb-b')?.name).toBe('Reading lamp');
  }
);

requirement(
  'BULB-004 @browser unassigned bulbs can be forgotten but room bulbs cannot',
  async ({ page }) => {
    const state = await mockBulbs(page, initialBulbs);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/?api_key=browser-test#/bulbs');
    const assigned = page.getByRole('article', { name: 'Desk lamp' });
    await expect(assigned.getByRole('button', { name: 'Forget' })).toBeDisabled();
    const unassigned = page.getByRole('article', { name: 'Unnamed bulb' });
    await unassigned.getByRole('button', { name: 'Forget' }).click();
    await expect(page.getByRole('article', { name: 'Unnamed bulb' })).toHaveCount(0);
    expect(state.getBulbs().map((bulb) => bulb.id)).toEqual(['bulb-b']);
  }
);
