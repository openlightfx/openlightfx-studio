import { expect, test, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const repository = process.cwd();
const { runLabScenario } = await import(pathToFileURL(`${repository}/e2e/lab/scenario.ts`).href);
const { requirement } = await import(
  pathToFileURL(`${repository}/e2e/harness/requirement.ts`).href
);

requirement(
  'MODEL-006 @fullstack a Center bulb following Ambient mixes all channels while Center folds to Left and Right',
  async ({ page, request }) => {
    await runLabScenario(page, request, test.info());
  }
);

requirement(
  'TRACK-002 @fullstack Create track preselects the room suggested layout',
  async ({ page, request }) => {
    await runLabScenario(page, request, test.info(), {
      beforeTrackCreate: async (moviePage: Page) => {
        await expect(moviePage.getByRole('button', { name: /3\.0/ })).toHaveAttribute(
          'aria-pressed',
          'true'
        );
      },
    });
  }
);

requirement(
  'ROOM-009 @fullstack deleting a room unplaces its bulbs and frees its screen',
  async ({ page, request }) => {
    await runLabScenario(page, request, test.info());
    const base = process.env.OLFX_EMBY_URL!;
    const headers = { 'X-Emby-Token': process.env.OLFX_API_KEY! };
    const roomsResponse = await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers });
    expect(roomsResponse.ok()).toBeTruthy();
    const savedRooms = await roomsResponse.json();
    expect(savedRooms).toHaveLength(1);
    const deviceId = savedRooms[0].screen.deviceId;

    await page.goto(`${base}/emby/OpenLightFX/studio/#/rooms`);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete room', exact: true }).click();
    await expect(page.getByText('No rooms yet.', { exact: true })).toBeVisible();
    for (const bulbName of ['Left lamp', 'Center lamp', 'Right lamp']) {
      await expect(
        page
          .getByRole('listitem')
          .filter({ has: page.getByRole('button', { name: bulbName, exact: true }) })
      ).toBeVisible();
    }
    const emptyRoomsResponse = await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers });
    expect(emptyRoomsResponse.ok()).toBeTruthy();
    expect(await emptyRoomsResponse.json()).toEqual([]);

    await page.getByRole('button', { name: '+ New room', exact: true }).click();
    await page.getByLabel('Screen (the Emby app in this room)').selectOption(deviceId);
    const saveButton = page.getByRole('button', { name: 'Save room', exact: true });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByText('Room saved.', { exact: true })).toBeVisible();
    const replacementRooms = await (
      await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers })
    ).json();
    expect(replacementRooms).toHaveLength(1);
    expect(replacementRooms[0].screen.deviceId).toBe(deviceId);
  }
);

requirement(
  'ROOM-008 @fullstack renamed bulb and Follows persist after saving and reloading the room',
  async ({ page, request }) => {
    await runLabScenario(page, request, test.info());
    const studio = `${process.env.OLFX_EMBY_URL}/emby/OpenLightFX/studio/`;
    await page.goto(`${studio}#/rooms`);
    const centerBulb = page
      .getByRole('group', { name: 'Placed bulb' })
      .filter({ hasText: 'Center lamp' });
    await centerBulb.getByRole('button', { name: 'Bulb options' }).click();
    page.once('dialog', (dialog) => dialog.accept('Desk lamp'));
    await centerBulb.getByRole('button', { name: 'Rename…' }).click();
    const renamedBulb = page
      .getByRole('group', { name: 'Placed bulb' })
      .filter({ hasText: 'Desk lamp' });
    await expect(renamedBulb).toContainText('→ Ambient');
    await page.getByRole('button', { name: 'Save room', exact: true }).click();
    await expect(page.getByText('Room saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('group', { name: 'Placed bulb' }).filter({ hasText: 'Desk lamp' })
    ).toContainText('→ Ambient');
  }
);
