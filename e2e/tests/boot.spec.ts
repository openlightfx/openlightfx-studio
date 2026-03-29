import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('App boot', () => {
  test('shows new-project dialog when no snapshot exists', async ({ page }) => {
    const app = new AppPage(page);
    await app.bootFresh();

    const dialog = page.locator('[role="dialog"][aria-label="New Project"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Stereo')).toBeVisible();
  });

  test('restores snapshot and skips dialog on boot', async ({ page }) => {
    const app = new AppPage(page);
    await app.boot();

    const dialog = page.locator('[role="dialog"][aria-label="New Project"]');
    await expect(dialog).not.toBeVisible();
    await expect(app.canvas).toBeVisible();
    await expect(page.getByText('Left')).toBeVisible();
    await expect(page.getByText('Right')).toBeVisible();
  });

  test('displays project title in top bar', async ({ page }) => {
    const app = new AppPage(page);
    await app.boot();
    await expect(page.getByText('Test Project')).toBeVisible();
  });
});
