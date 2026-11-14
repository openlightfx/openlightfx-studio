import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { pathToFileURL } from 'node:url';
const { requirement } = await import(
  pathToFileURL(`${process.cwd()}/e2e/harness/requirement.ts`).href
);
const base = process.env.OLFX_EMBY_URL!;
const headers = { 'X-Emby-Token': process.env.OLFX_API_KEY! };
const studio = `${base}/emby/OpenLightFX/studio/`;

async function prepare(page: Page, request: APIRequestContext) {
  await page.goto(`${base}/web/index.html`);
  await page.getByText('admin', { exact: true }).click();
  await page.locator('input[type=password]').fill('openlightfx-test');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/#!\/home/, { timeout: 15000 });
  const rooms = await (await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers })).json();
  for (const room of rooms)
    expect(
      (await request.delete(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, { headers })).ok()
    ).toBeTruthy();
  const bulbs = await (await request.get(`${base}/OpenLightFX/Studio/Bulbs`, { headers })).json();
  const renamed = bulbs.find((bulb: { name: string }) => bulb.name === 'Desk lamp');
  if (renamed)
    expect(
      (
        await request.put(`${base}/OpenLightFX/Studio/Bulbs/${encodeURIComponent(renamed.id)}`, {
          headers,
          data: { name: 'Blue neighbor' },
        })
      ).ok()
    ).toBeTruthy();
  await page.goto(studio);
  await expect(page).toHaveURL(/#\/rooms$/);
  const devices = await (
    await request.get(`${base}/OpenLightFX/Studio/Devices`, { headers })
  ).json();
  expect(devices.length).toBeGreaterThan(0);
  return devices;
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Save room', exact: true }).click();
  await expect(page.getByText('Room saved.', { exact: true })).toBeVisible();
}
async function rooms(request: APIRequestContext) {
  const response = await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

requirement(
  'FLOW-001 @fullstack first run opens the welcome card without legacy setup',
  async ({ page, request }) => {
    await prepare(page, request);
    await expect(page.getByRole('heading', { name: 'Welcome to OpenLightFX' })).toBeVisible();
    await expect(page.getByLabel('Room name')).toHaveValue('Living Room');
    await expect(page.getByRole('button', { name: 'Save room', exact: true })).toBeDisabled();
    await expect(page.getByText(/legacy configuration|paste.*settings/i)).toHaveCount(0);
  }
);

requirement(
  'FLOW-003 @fullstack room setup redeems the Emby Web credential without a URL token and reloads its route',
  async ({ page, request }) => {
    const sessionResponse = page.waitForResponse(
      (response) => response.url().endsWith('/OpenLightFX/Studio/Session'),
      { timeout: 15000 }
    );
    await prepare(page, request);
    const session = await sessionResponse;
    expect(session.ok()).toBeTruthy();
    expect(session.headers()['cache-control']).toContain('no-store');
    expect(session.request().headers()['x-emby-token']).toBeTruthy();
    await expect(page).not.toHaveURL(/api_key/);
    await page.reload();
    await expect(page).toHaveURL(/#\/rooms$/);
    await expect(page.getByRole('heading', { name: 'Your rooms' })).toBeVisible();
  }
);

requirement(
  'ROOM-001 @fullstack saving requires a name and known screen and persists the room',
  async ({ page, request }) => {
    const devices = await prepare(page, request);
    const saveButton = page.getByRole('button', { name: 'Save room', exact: true });
    await expect(saveButton).toBeDisabled();
    await page.getByLabel('Screen (the Emby app in this room)').selectOption(devices[0].deviceId);
    await page.getByLabel('Room name').fill('');
    await expect(saveButton).toBeDisabled();
    await page.getByLabel('Room name').fill('Living Room');
    await save(page);
    const [room] = await rooms(request);
    expect(room.name).toBe('Living Room');
    expect(room.screen.deviceId).toBe(devices[0].deviceId);
    await expect(page.getByRole('button', { name: /Living Room.*bulbs/ })).toBeVisible();
  }
);

requirement(
  'ROOM-002 @fullstack every Emby device is visible and an occupied screen cannot be reassigned',
  async ({ page, request }) => {
    const viewer = await request.post(`${base}/emby/Users/AuthenticateByName`, {
      headers: {
        'X-Emby-Authorization':
          'MediaBrowser Client="Room acceptance", Device="Bedroom TV", DeviceId="j1-viewer-screen", Version="1.0"',
      },
      data: { Username: 'viewer', Pw: '' },
    });
    expect(viewer.ok()).toBeTruthy();
    const devices = await prepare(page, request);
    const bedroom = devices.find(
      (device: { deviceId: string }) => device.deviceId === 'j1-viewer-screen'
    );
    expect(bedroom.lastUserName).toBe('viewer');
    expect(
      devices.some((device: { lastUserName: string }) => device.lastUserName === 'admin')
    ).toBe(true);
    const activity = devices.map((device: { lastActivity: string }) =>
      Date.parse(device.lastActivity)
    );
    expect(activity).toEqual([...activity].sort((a: number, b: number) => b - a));
    await page.getByLabel('Screen (the Emby app in this room)').selectOption(bedroom.deviceId);
    await page.getByLabel('Room name').fill('Bedroom');
    await save(page);
    await page.getByRole('button', { name: '+ New room', exact: true }).click();
    const picker = page.getByLabel('Screen (the Emby app in this room)');
    for (const device of devices)
      await expect(picker.locator(`option[value="${device.deviceId}"]`)).toHaveCount(1);
    const occupied = picker.locator(`option[value="${bedroom.deviceId}"]`);
    await expect(occupied).toContainText('In Bedroom');
    await expect(occupied).toBeDisabled();
    const rejected = await request.post(`${base}/OpenLightFX/Studio/Rooms`, {
      headers,
      data: { name: 'Other room', screenDeviceId: bedroom.deviceId, bulbs: [] },
    });
    expect(rejected.status()).toBe(400);
    expect(await rejected.text()).toContain('already assigned');
  }
);

requirement(
  'ROOM-005 @fullstack drag and Place menu persist positions and removal unplaces the bulb',
  async ({ page, request }) => {
    const devices = await prepare(page, request);
    await page.getByLabel('Screen (the Emby app in this room)').selectOption(devices[0].deviceId);
    const bulb = page.getByRole('listitem').filter({ hasText: 'Red target' });
    await bulb.dragTo(page.getByRole('region', { name: 'Left bulb position', exact: true }));
    await expect(
      page.getByRole('region', { name: 'Left bulb position', exact: true })
    ).toContainText('Red target');
    await save(page);
    let [room] = await rooms(request);
    const id = room.bulbs[0].id;
    expect(room.bulbs[0].position).toBe('left');
    await page
      .getByRole('group', { name: 'Placed bulb' })
      .filter({ hasText: 'Red target' })
      .getByRole('button', { name: 'Take out of room' })
      .click();
    await page.getByRole('listitem').filter({ hasText: 'Red target' }).locator('summary').click();
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Red target' })
      .locator('.place-menu')
      .getByRole('button', { name: 'Surround Right', exact: true })
      .click();
    await save(page);
    [room] = await rooms(request);
    expect(room.bulbs.find((b: { id: string }) => b.id === id).position).toBe('surround-right');
    await page
      .getByRole('group', { name: 'Placed bulb' })
      .filter({ hasText: 'Red target' })
      .getByRole('button', { name: 'Take out of room' })
      .click();
    await save(page);
    const bulbs = await (await request.get(`${base}/OpenLightFX/Studio/Bulbs`, { headers })).json();
    expect(bulbs.find((b: { id: string }) => b.id === id).roomId ?? null).toBeNull();
  }
);

requirement(
  'ROOM-008 @fullstack renamed bulb and Follows persist through save and reload',
  async ({ page, request }) => {
    const devices = await prepare(page, request);
    await page.getByLabel('Screen (the Emby app in this room)').selectOption(devices[0].deviceId);
    const row = page.getByRole('listitem').filter({ hasText: 'Blue neighbor' });
    await row.locator('summary').click();
    await row.locator('.place-menu').getByRole('button', { name: 'Center', exact: true }).click();
    const chip = page
      .getByRole('group', { name: 'Placed bulb' })
      .filter({ hasText: 'Blue neighbor' });
    await chip.getByRole('button', { name: 'Bulb options' }).click();
    page.once('dialog', (dialog) => dialog.accept('Desk lamp'));
    await chip.getByRole('button', { name: 'Rename…' }).click();
    const renamed = page
      .getByRole('group', { name: 'Placed bulb' })
      .filter({ hasText: 'Desk lamp' });
    await renamed.getByLabel('Follows').selectOption('ambient');
    await save(page);
    await page.reload();
    await expect(
      page.getByRole('group', { name: 'Placed bulb' }).filter({ hasText: 'Desk lamp' })
    ).toContainText('→ Ambient');
    const [room] = await rooms(request);
    expect(room.bulbs[0].follows).toBe('ambient');
  }
);

requirement(
  'ROOM-009 @fullstack deletion unplaces bulbs and makes its screen reusable',
  async ({ page, request }) => {
    const devices = await prepare(page, request);
    await page.getByLabel('Screen (the Emby app in this room)').selectOption(devices[0].deviceId);
    for (const name of ['Red target', 'Green third']) {
      const row = page.getByRole('listitem').filter({ hasText: name });
      await row.locator('summary').click();
      await row.locator('.place-menu').getByRole('button', { name: 'Left', exact: true }).click();
    }
    await save(page);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete room', exact: true }).click();
    await expect(page.getByText('No rooms yet.', { exact: true })).toBeVisible();
    expect(await rooms(request)).toEqual([]);
    const bulbs = await (await request.get(`${base}/OpenLightFX/Studio/Bulbs`, { headers })).json();
    expect(bulbs.every((b: { roomId?: string }) => !b.roomId)).toBe(true);
    await page.getByRole('button', { name: '+ New room', exact: true }).click();
    await expect(
      page
        .getByLabel('Screen (the Emby app in this room)')
        .locator(`option[value="${devices[0].deviceId}"]`)
    ).toBeEnabled();
    await page.getByLabel('Screen (the Emby app in this room)').selectOption(devices[0].deviceId);
    await save(page);
  }
);
