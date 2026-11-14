import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';

const repository = process.cwd();
const { requirement } = await import(
  pathToFileURL(`${repository}/e2e/harness/requirement.ts`).href
);

requirement(
  'FLOW-001 @fullstack a fresh Studio session opens the welcome room editor when there are no rooms',
  async ({ page, request }) => {
    const base = process.env.OLFX_EMBY_URL!;
    const headers = { 'X-Emby-Token': process.env.OLFX_API_KEY! };
    const existing = await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers });
    expect(existing.ok()).toBeTruthy();
    for (const room of await existing.json()) {
      const deleted = await request.delete(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, {
        headers,
      });
      expect(deleted.ok()).toBeTruthy();
    }

    const loginPage = await page.context().newPage();
    await loginPage.goto(`${base}/web/index.html`);
    await loginPage.getByText('admin', { exact: true }).click();
    await loginPage.locator('input[type=password]').fill('openlightfx-test');
    await loginPage.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(loginPage).toHaveURL(/#!\/home/, { timeout: 15000 });
    await loginPage.close();

    await page.goto(`${base}/emby/OpenLightFX/studio/`);
    await expect(page).toHaveURL(/#\/rooms$/);
    await expect(page.getByRole('heading', { name: 'Welcome to OpenLightFX' })).toBeVisible();
    await expect(page.getByLabel('Room name')).toHaveValue('Living Room');
    await expect(page.getByRole('button', { name: 'Save room', exact: true })).toBeDisabled();
    await expect(page.getByText(/legacy configuration|paste.*settings/i)).toHaveCount(0);
  }
);
