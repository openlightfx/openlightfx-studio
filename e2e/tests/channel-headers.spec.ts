import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('Channel headers', () => {
  let app: AppPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    await app.boot();
  });

  test('shows 2 channels from fixture', async ({ page }) => {
    await expect(page.locator('.channel-headers').getByText('Left')).toBeVisible();
    await expect(page.locator('.channel-headers').getByText('Right')).toBeVisible();
  });

  test('solo button toggles', async ({ page }) => {
    const firstRow = page.locator('.channel-headers .channel-row').first();
    const soloBtn = firstRow.locator('button:has-text("S")');

    await expect(soloBtn).toBeVisible();
    await soloBtn.click();

    const isSolo = await page.evaluate(() => {
      return (window as any).__stores.timelineStore.soloChannelIds.has('left');
    });
    expect(isSolo).toBe(true);

    await soloBtn.click();
    const isSoloAfter = await page.evaluate(() => {
      return (window as any).__stores.timelineStore.soloChannelIds.has('left');
    });
    expect(isSoloAfter).toBe(false);
  });

  test('mute button toggles', async ({ page }) => {
    const secondRow = page.locator('.channel-headers .channel-row').nth(1);
    const muteBtn = secondRow.locator('button:has-text("M")');
    await muteBtn.click();

    const isMuted = await page.evaluate(() => {
      return (window as any).__stores.timelineStore.mutedChannelIds.has('right');
    });
    expect(isMuted).toBe(true);

    await muteBtn.click();
    const isMutedAfter = await page.evaluate(() => {
      return (window as any).__stores.timelineStore.mutedChannelIds.has('right');
    });
    expect(isMutedAfter).toBe(false);
  });

  test('double-click renames channel', async ({ page }) => {
    const firstName = page.locator('.channel-headers .channel-row').first().locator('span.truncate');
    await firstName.dblclick();

    const input = page.locator('.channel-headers .channel-row').first().locator('input[type="text"]');
    await expect(input).toBeVisible();
    await input.fill('Front Left');
    await input.press('Enter');
    await page.waitForTimeout(200);

    const name = await page.evaluate(() => {
      return (window as any).__stores.projectStore.file?.track.channels[0].displayName;
    });
    expect(name).toBe('Front Left');
  });

  test('rename cancel with Escape reverts', async ({ page }) => {
    const firstName = page.locator('.channel-headers .channel-row').first().locator('span.truncate');
    await firstName.dblclick();

    const input = page.locator('.channel-headers .channel-row').first().locator('input[type="text"]');
    await input.fill('Something Else');
    await input.press('Escape');
    await page.waitForTimeout(200);

    const name = await page.evaluate(() => {
      return (window as any).__stores.projectStore.file?.track.channels[0].displayName;
    });
    expect(name).toBe('Left');
  });

  test('right-click opens channel popover', async ({ page }) => {
    const firstRow = page.locator('.channel-headers .channel-row').first();
    await firstRow.click({ button: 'right' });

    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
    await expect(popover).toBeVisible({ timeout: 3_000 });
  });
});
