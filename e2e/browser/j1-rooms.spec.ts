import { expect } from '@playwright/test';
import { requirement } from '../harness/requirement';

const initialRoom = {
  id: 'room-1',
  name: 'Living Room',
  screen: { deviceId: 'screen-1', deviceName: 'TV', appName: 'Emby Theater' },
  bulbs: [
    { id: 'bulb-left', position: 'left', follows: null },
    { id: 'bulb-right', position: 'right', follows: null },
  ],
  updatedAt: 'v1',
  suggestedLayout: 'LAYOUT_2_0',
};

const devices = [
  { deviceId: 'screen-1', name: 'TV', appName: 'Emby Theater' },
  {
    deviceId: 'screen-2',
    name: 'Bedroom TV',
    appName: 'Emby Android',
    roomId: 'room-1',
    roomName: 'Living Room',
  },
];

const bulbs = [
  {
    id: 'bulb-left',
    name: 'Left lamp',
    isNamed: true,
    protocol: 'WiZ',
    model: 'A19',
    roomId: 'room-1',
    position: 'left',
  },
  {
    id: 'bulb-right',
    name: 'Right lamp',
    isNamed: true,
    protocol: 'WiZ',
    model: 'A19',
    roomId: 'room-1',
    position: 'right',
  },
  {
    id: 'bulb-center',
    name: 'Center lamp',
    isNamed: true,
    protocol: 'LIFX',
    model: 'Color',
    roomId: null,
  },
];

async function mockRooms(page, { rooms: initialRooms = [initialRoom] } = {}) {
  let rooms = structuredClone(initialRooms);
  let knownBulbs = structuredClone(bulbs);
  await page.route('**/OpenLightFX/Studio/Session', (route) =>
    route.fulfill({ json: { accessToken: 'browser-test' } })
  );
  await page.route('**/OpenLightFX/Studio/Setup', (route) =>
    route.fulfill({ json: { roomCount: rooms.length } })
  );
  await page.route('**/OpenLightFX/Studio/CanManageRooms', (route) =>
    route.fulfill({ json: { canManageRooms: true } })
  );
  await page.route('**/OpenLightFX/Studio/Devices', (route) => route.fulfill({ json: devices }));
  await page.route('**/OpenLightFX/Studio/Bulbs', (route) => route.fulfill({ json: knownBulbs }));
  await page.route('**/OpenLightFX/Studio/Rooms', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: rooms });
    const data = route.request().postDataJSON();
    const created = {
      id: 'room-created',
      name: data.name,
      screen: {
        deviceId: data.screenDeviceId,
        deviceName: data.deviceName,
        appName: data.appName,
      },
      bulbs: data.bulbs,
      updatedAt: 'v2',
      suggestedLayout: 'LAYOUT_2_0',
    };
    rooms = [...rooms, created];
    return route.fulfill({ status: 201, json: created });
  });
  await page.route('**/OpenLightFX/Studio/Rooms/*', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const data = route.request().postDataJSON();
      rooms = rooms.map((room) =>
        room.id === 'room-1'
          ? { ...room, name: data.name, bulbs: data.bulbs, updatedAt: 'v2' }
          : room
      );
      return route.fulfill({ json: rooms.find((room) => room.id === 'room-1') });
    }
    if (method === 'DELETE') {
      rooms = rooms.filter((room) => room.id !== 'room-1');
      return route.fulfill({ status: 204, body: '' });
    }
    return route.continue();
  });
  await page.route('**/OpenLightFX/Studio/Discover', async (route) =>
    route.fulfill({ json: { foundCount: 0, bulbs: [] } })
  );
  await page.route('**/OpenLightFX/Studio/Items**', (route) => route.fulfill({ json: [] }));
}

async function openRooms(page, options?: { rooms?: (typeof initialRoom)[] }) {
  await mockRooms(page, options);
  await page.goto('/?api_key=browser-test#/rooms');
  await expect(page.getByRole('heading', { name: 'Your rooms' })).toBeVisible();
}

requirement(
  'FLOW-002 @browser a returning user resumes the last route they visited',
  async ({ page }) => {
    await mockRooms(page);
    await page.addInitScript(() => localStorage.setItem('olfx-last-route', '#/library'));
    await page.goto('/?api_key=browser-test');
    await expect(page).toHaveURL(/#\/library$/);
    await expect(page.getByRole('searchbox', { name: 'Search', exact: true })).toBeVisible();
  }
);

requirement(
  'FLOW-004 @browser Rooms and Library are reachable from the header',
  async ({ page }) => {
    await openRooms(page);
    await page.getByRole('link', { name: 'Library' }).click();
    await expect(page).toHaveURL(/#\/library$/);
    await expect(page.getByRole('link', { name: 'Rooms' })).toBeVisible();
    await page.getByRole('link', { name: 'Rooms' }).click();
    await expect(page).toHaveURL(/#\/rooms$/);
  }
);

requirement(
  'ROOM-001 @browser creating a room saves its name and selected screen',
  async ({ page }) => {
    await openRooms(page);
    await page.getByRole('button', { name: '+ New room' }).click();
    await page.getByLabel('Room name').fill('Cinema');
    await page.getByLabel('Screen (the Emby app in this room)').selectOption('screen-1');
    await page.getByRole('button', { name: 'Save room' }).click();
    await expect(page.getByRole('button', { name: /Cinema/ })).toBeVisible();
    await expect(page.getByText('Room saved.')).toBeVisible();
  }
);

requirement(
  'ROOM-002 @browser screen picker lists every device and disables an occupied screen',
  async ({ page }) => {
    await openRooms(page);
    await page.getByRole('button', { name: '+ New room' }).click();
    const picker = page.getByLabel('Screen (the Emby app in this room)');
    await expect(picker.locator('option', { hasText: 'TV · Emby Theater' })).toHaveCount(1);
    await expect(picker.locator('option', { hasText: 'Bedroom TV' })).toBeDisabled();
  }
);

requirement(
  'ROOM-005 @browser Place menu assigns a known bulb to the chosen position',
  async ({ page }) => {
    await openRooms(page);
    const centerBulb = page.getByRole('listitem').filter({ hasText: 'Center lamp' });
    await centerBulb.getByText('Place ▾').click();
    await centerBulb
      .locator('.place-menu')
      .getByRole('button', { name: 'Center', exact: true })
      .click();
    await expect(page.getByRole('region', { name: 'Center bulb position' })).toContainText(
      'Center lamp'
    );
    await page.getByRole('button', { name: 'Save room' }).click();
    await expect(page.getByText('Room saved.')).toBeVisible();
  }
);

requirement(
  'ROOM-006 @browser coverage line updates when a bulb moves to Center',
  async ({ page }) => {
    await openRooms(page);
    await expect(page.locator('.coverage')).toContainText('2.0');
    const centerBulb = page.getByRole('listitem').filter({ hasText: 'Center lamp' });
    await centerBulb.getByText('Place ▾').click();
    await centerBulb
      .locator('.place-menu')
      .getByRole('button', { name: 'Center', exact: true })
      .click();
    await expect(page.locator('.coverage')).toContainText('3.0');
  }
);

requirement(
  'ROOM-008 @browser a Follows override is shown and included when saving a room',
  async ({ page }) => {
    let savedBulbs: unknown;
    page.on('request', (request) => {
      if (
        request.method() === 'PUT' &&
        request.url().includes('/OpenLightFX/Studio/Rooms/room-1')
      ) {
        savedBulbs = request.postDataJSON().bulbs;
      }
    });
    await openRooms(page);
    const chip = page.getByRole('group', { name: 'Placed bulb' }).filter({ hasText: 'Left lamp' });
    await chip.getByRole('button', { name: 'Bulb options' }).click();
    await chip.getByLabel('Follows').selectOption('ambient');
    await expect(chip).toContainText('→ Ambient');
    await page.getByRole('button', { name: 'Save room' }).click();
    await expect(page.getByText('Room saved.')).toBeVisible();
    expect(savedBulbs).toContainEqual({ id: 'bulb-left', position: 'left', follows: 'ambient' });
  }
);

requirement(
  'ROOM-009 @browser deleting a room requires confirmation and removes it',
  async ({ page }) => {
    await openRooms(page);
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete room' }).click();
    await expect(page.getByText('No rooms yet.')).toBeVisible();
  }
);

requirement(
  'ROOM-012 @browser save conflict keeps the edited room name and offers resolution',
  async ({ page }) => {
    await openRooms(page);
    await page.route('**/OpenLightFX/Studio/Rooms/room-1', (route) =>
      route.fulfill({ status: 409, body: 'This room changed in another tab.' })
    );
    await page.getByLabel('Room name').fill('My edited room');
    await page.getByRole('button', { name: 'Save room', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'This room changed in another tab' })
    ).toBeVisible();
    await expect(page.getByLabel('Room name')).toHaveValue('My edited room');
    await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep mine', exact: true })).toBeVisible();
  }
);

requirement(
  'ROOM-003 @browser room setup shows only named bulbs and keeps discovery on Bulbs',
  async ({ page }) => {
    await openRooms(page);
    await expect(page.getByRole('listitem').filter({ hasText: 'Center lamp' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Manage bulbs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Find bulbs' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Identify' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rename…' })).toHaveCount(0);
  }
);
