import { expect } from '@playwright/test';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const { requirement } = await import(
  pathToFileURL(`${process.cwd()}/e2e/harness/requirement.ts`).href
);

requirement(
  'BULB-001 @fullstack Bulbs discovery persists four WiZ inventory records and preserves names and room assignments',
  async ({ page, request }) => {
    const base = process.env.OLFX_EMBY_URL!;
    const token = process.env.OLFX_API_KEY!;
    const headers = { 'X-Emby-Token': token };
    await page.goto(`${base}/web/index.html`);
    await page.getByText('admin', { exact: true }).click();
    await page.locator('input[type=password]').fill('openlightfx-test');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(/#!\/home/, { timeout: 15000 });
    const devices = await (
      await request.get(`${base}/OpenLightFX/Studio/Devices`, { headers })
    ).json();
    expect(devices.length).toBeGreaterThan(0);
    const roomsResponse = await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers });
    expect(roomsResponse.ok()).toBeTruthy();
    const [room] = await roomsResponse.json();
    const occupied = room.bulbs[0];
    const saved = await request.put(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, {
      headers: { ...headers, 'If-Match': room.updatedAt },
      data: { name: 'Bedroom', screenDeviceId: devices[0].deviceId, bulbs: [occupied] },
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    await page.goto(`${base}/emby/OpenLightFX/studio/?api_key=${token}#/bulbs`);
    const ndjson = process.env.OLFX_NDJSON!;
    const eventsBefore = fs.readFileSync(ndjson, 'utf8').trimEnd().split('\n').length;
    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/Discover') && response.request().method() === 'POST',
      { timeout: 10000 }
    );
    await page.getByRole('button', { name: 'Find bulbs', exact: true }).click();
    await expect(page.locator('progress')).toBeVisible();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    const discovery = await response.json();
    expect(discovery.foundCount).toBe(4);
    expect(discovery.bulbs).toHaveLength(4);
    await expect(page.getByRole('article')).toHaveCount(4);
    for (const bulb of discovery.bulbs) {
      expect(bulb.protocol).toBe('wiz');
      expect(bulb.model).toBe('ESP01_SHRGB1W_01');
      expect(bulb.ipAddress).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      const row = page.getByRole('article').filter({ hasText: bulb.ipAddress });
      await expect(row).toContainText(bulb.model);
      await expect(row).toContainText(bulb.ipAddress);
      await expect(row).toContainText('wiz');
    }
    const occupiedBulb = discovery.bulbs.find(
      (bulb: { roomId?: string }) => bulb.roomId === room.id
    );
    expect(occupiedBulb).toBeTruthy();
    const occupiedRow = page.getByRole('article').filter({ hasText: occupiedBulb.ipAddress });
    await expect(occupiedRow).toContainText('In Bedroom');
    await expect(occupiedRow.getByRole('button', { name: 'Forget' })).toBeDisabled();
    await page.reload();
    const persistedBulbs = await (
      await request.get(`${base}/OpenLightFX/Studio/Bulbs`, { headers })
    ).json();
    expect(persistedBulbs.map((bulb: { id: string }) => bulb.id).sort()).toEqual(
      discovery.bulbs.map((bulb: { id: string }) => bulb.id).sort()
    );
    expect(persistedBulbs.find((bulb: { id: string }) => bulb.id === occupiedBulb.id).roomId).toBe(
      room.id
    );
    const probes = fs
      .readFileSync(ndjson, 'utf8')
      .trimEnd()
      .split('\n')
      .slice(eventsBefore)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((event) => event.event === 'discovery_probe');
    expect(new Set(probes.map((event) => event.bulb_id))).toEqual(
      new Set(['red-target', 'blue-neighbor', 'green-third', 'white-fourth'])
    );
  }
);
