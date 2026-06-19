import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('Export dialog', () => {
  let app: AppPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    await app.boot();
  });

  test('Ctrl+E opens export dialog', async ({ page }) => {
    await page.keyboard.press('Control+e');
    const dialog = page.locator('[role="dialog"][aria-label="Export Track"]');
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  });

  test('shows validation section', async ({ page }) => {
    await page.keyboard.press('Control+e');
    const dialog = page.locator('[role="dialog"][aria-label="Export Track"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Safety', { exact: false })).toBeVisible();
  });

  test('export button triggers download', async ({ page }) => {
    await page.keyboard.press('Control+e');
    const dialog = page.locator('[role="dialog"][aria-label="Export Track"]');
    await expect(dialog).toBeVisible();

    // Wait for validation to complete (button becomes enabled)
    const exportBtn = dialog.getByText('Export .lightfx');
    await expect(exportBtn).toBeEnabled({ timeout: 5_000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
    await exportBtn.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.lightfx');
  });

  test('cancel closes dialog', async ({ page }) => {
    await page.keyboard.press('Control+e');
    const dialog = page.locator('[role="dialog"][aria-label="Export Track"]');
    await expect(dialog).toBeVisible();

    await dialog.getByText('Cancel').click();
    await expect(dialog).not.toBeVisible({ timeout: 2_000 });
  });
});
