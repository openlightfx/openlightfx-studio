import { test, expect } from '@playwright/test';
import { AppPage, VIDEO_PATH } from '../pages/app.page';

test.describe('Video playback', () => {
  let app: AppPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    await app.boot();
  });

  test.skip('drag-drop loads video', async ({ page }) => {
    // Skipped: synthetic DragEvent with DataTransfer does not trigger the app's
    // drop handler in headless Chromium — the video never loads. Needs real
    // browser drag-drop support or a dedicated file-input shim.
    await page.evaluate(async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      input.id = '__test-file-input';
      input.style.display = 'none';
      document.body.appendChild(input);
    });

    await page.locator('#__test-file-input').setInputFiles(VIDEO_PATH);

    await page.evaluate(() => {
      const input = document.getElementById('__test-file-input') as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) throw new Error('No file set');

      const panel = document.querySelector('[aria-label="Video panel"]');
      if (!panel) throw new Error('Video panel not found');

      const dt = new DataTransfer();
      dt.items.add(file);
      panel.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
      panel.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));

      input.remove();
    });

    await page.waitForFunction(
      () => {
        const v = document.querySelector('video');
        return v && v.readyState >= 1 && v.duration > 0;
      },
      { timeout: 30_000 },
    );

    const duration = await page.evaluate(() => document.querySelector('video')?.duration ?? 0);
    expect(duration).toBeGreaterThan(0);
  });

  test.skip('play/pause toggle with Space', async ({ page }) => {
    // Skipped: depends on video load via drag-drop which is not supported in headless Chromium.
    await loadVideoHelper(page);

    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    const isPlaying = await page.evaluate(() => (window as any).__stores.videoStore.isPlaying);
    expect(isPlaying).toBe(true);

    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    const isPaused = await page.evaluate(() => !(window as any).__stores.videoStore.isPlaying);
    expect(isPaused).toBe(true);
  });

  test.skip('step forward advances one frame', async ({ page }) => {
    // Skipped: depends on video load via drag-drop which is not supported in headless Chromium.
    await loadVideoHelper(page);

    const timeBefore = await page.evaluate(() => (window as any).__stores.videoStore.currentTimeMs);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    const timeAfter = await page.evaluate(() => (window as any).__stores.videoStore.currentTimeMs);
    expect(timeAfter).toBeGreaterThan(timeBefore);
    expect(timeAfter - timeBefore).toBeLessThan(100);
  });

  test.skip('scrub bar seeks', async ({ page }) => {
    // Skipped: depends on video load via drag-drop which is not supported in headless Chromium.
    await loadVideoHelper(page);

    const scrubBar = page.locator('input[aria-label="Scrub timeline"]');
    await expect(scrubBar).toBeVisible();

    const box = await scrubBar.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(500);

      const currentTime = await page.evaluate(() => (window as any).__stores.videoStore.currentTimeMs);
      const duration = await page.evaluate(() => (window as any).__stores.videoStore.durationMs);
      expect(currentTime).toBeGreaterThan(duration * 0.2);
      expect(currentTime).toBeLessThan(duration * 0.8);
    }
  });
});

async function loadVideoHelper(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.id = '__test-file-input';
    input.style.display = 'none';
    document.body.appendChild(input);
  });

  await page.locator('#__test-file-input').setInputFiles(VIDEO_PATH);

  await page.evaluate(() => {
    const input = document.getElementById('__test-file-input') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) throw new Error('No file set');

    const panel = document.querySelector('[aria-label="Video panel"]');
    if (!panel) throw new Error('Video panel not found');

    const dt = new DataTransfer();
    dt.items.add(file);
    panel.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
    panel.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));

    input.remove();
  });

  await page.waitForFunction(
    () => {
      const v = document.querySelector('video');
      return v && v.readyState >= 1 && v.duration > 0;
    },
    { timeout: 30_000 },
  );
}
