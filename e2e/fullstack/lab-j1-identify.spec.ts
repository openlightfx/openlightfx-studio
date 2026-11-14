import { expect } from '@playwright/test';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const repository = process.cwd();
const { requirement } = await import(
  pathToFileURL(`${repository}/e2e/harness/requirement.ts`).href
);

requirement(
  'ROOM-004 @fullstack Identify flashes exactly the chosen bulb and shows progress',
  async ({ page, request }) => {
    const base = process.env.OLFX_EMBY_URL!;
    const token = process.env.OLFX_API_KEY!;
    const headers = { 'X-Emby-Token': token };
    const ndjson = process.env.OLFX_NDJSON!;

    await page.goto(`${base}/web/index.html`);
    await page.getByText('admin', { exact: true }).click();
    await page.locator('input[type=password]').fill('openlightfx-test');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(/#!\/home/, { timeout: 15000 });
    await page.goto(`${base}/emby/OpenLightFX/studio/?api_key=${token}#/rooms`);
    await page.getByRole('button', { name: '+ New room', exact: true }).click();

    const bulbsResponse = await request.get(`${base}/OpenLightFX/Studio/Bulbs`, { headers });
    expect(bulbsResponse.ok()).toBeTruthy();
    const bulbs = await bulbsResponse.json();
    expect(bulbs).toHaveLength(4);
    const target = bulbs.find((bulb: { name: string }) => bulb.name === 'Red target');
    expect(target).toBeTruthy();
    const targetRow = page.getByRole('listitem').filter({ hasText: target.name });
    await expect(targetRow).toBeVisible();

    const eventCount = fs.readFileSync(ndjson, 'utf8').trimEnd().split('\n').length;
    await targetRow.getByRole('button', { name: 'Identify', exact: true }).click();
    await expect(targetRow.getByRole('button', { name: 'Flashing…', exact: true })).toBeVisible();
    await expect(targetRow.getByRole('button', { name: 'Identify', exact: true })).toBeVisible({
      timeout: 6000,
    });

    const newEvents = fs
      .readFileSync(ndjson, 'utf8')
      .trimEnd()
      .split('\n')
      .slice(eventCount)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter(
        (event) =>
          event.event === 'command_received' &&
          event.params.dimming === 100 &&
          event.params.state === true
      );
    const targetCommands = newEvents.filter((event) => event.bulb_id === 'red-target');
    expect(
      targetCommands.slice(0, 3).map((event) => [event.params.r, event.params.g, event.params.b])
    ).toEqual([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]);
    expect(newEvents.every((event) => event.bulb_id === 'red-target')).toBe(true);
    expect(targetCommands.every((event) => event.protocol === 'wiz')).toBe(true);
  }
);
