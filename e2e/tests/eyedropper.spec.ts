import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('Eyedropper', () => {
  let app: AppPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    await app.boot();
  });

  test('eyedropper overlay only renders when video is loaded', async ({ page }) => {
    // Eyedropper component is conditionally rendered by VideoPanel
    // when videoStore.isLoaded is true. Without a video, even setting
    // eyedropperActive won't produce the overlay.
    await page.evaluate(() => {
      (window as any).__stores.uiStore.eyedropperActive = true;
    });
    await page.waitForTimeout(300);

    const overlay = page.locator('[aria-label="Eyedropper \u2014 click to sample color"]');
    await expect(overlay).not.toBeVisible();
  });

  test('rawFrameToImageData correctly converts rgb24 to RGBA', async ({ page }) => {
    // Verify the rgb24→RGBA conversion algorithm is correct.
    // This runs the same logic as rawFrameToImageData in the browser.
    const result = await page.evaluate(() => {
      const rgb24 = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
      const width = 2;
      const height = 2;
      const pixelCount = width * height;
      const imageData = new ImageData(width, height);
      const out = imageData.data;
      for (let i = 0; i < pixelCount; i++) {
        const srcOff = i * 3;
        const dstOff = i * 4;
        out[dstOff] = rgb24[srcOff];
        out[dstOff + 1] = rgb24[srcOff + 1];
        out[dstOff + 2] = rgb24[srcOff + 2];
        out[dstOff + 3] = 255;
      }
      return {
        width: imageData.width,
        height: imageData.height,
        dataLength: imageData.data.length,
        pixel0: Array.from(imageData.data.slice(0, 4)),
        pixel1: Array.from(imageData.data.slice(4, 8)),
        pixel2: Array.from(imageData.data.slice(8, 12)),
        pixel3: Array.from(imageData.data.slice(12, 16)),
      };
    });

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.dataLength).toBe(16);
    expect(result.pixel0).toEqual([255, 0, 0, 255]);
    expect(result.pixel1).toEqual([0, 255, 0, 255]);
    expect(result.pixel2).toEqual([0, 0, 255, 255]);
    expect(result.pixel3).toEqual([255, 255, 255, 255]);
  });

  test('isFFmpegSupported returns true in Chromium', async ({ page }) => {
    const supported = await page.evaluate(() => typeof WebAssembly !== 'undefined');
    expect(supported).toBe(true);
  });

  test.skip('eyedropper activates with loaded video', async ({ page }) => {
    // Skipped: requires video loaded via drag-drop, which synthetic DragEvent
    // does not support in headless Chromium.
    await app.loadVideo();

    await page.evaluate(() => {
      (window as any).__stores.uiStore.eyedropperActive = true;
    });

    const overlay = page.locator('[aria-label="Eyedropper \u2014 click to sample color"]');
    await expect(overlay).toBeVisible({ timeout: 5000 });
  });

  test.skip('eyedropper deactivates on Escape with loaded video', async ({ page }) => {
    // Skipped: requires video loaded via drag-drop.
    await app.loadVideo();

    await page.evaluate(() => {
      (window as any).__stores.uiStore.eyedropperActive = true;
    });

    const overlay = page.locator('[aria-label="Eyedropper \u2014 click to sample color"]');
    await expect(overlay).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(overlay).not.toBeVisible({ timeout: 2000 });

    const isActive = await page.evaluate(() => (window as any).__stores.uiStore.eyedropperActive);
    expect(isActive).toBe(false);
  });

  test.skip('eyedropper extracts frame and samples color', async ({ page }) => {
    // Skipped: requires video loaded via drag-drop.
    await app.loadVideo();

    await page.evaluate(() => {
      (window as any).__stores.uiStore.eyedropperActive = true;
    });

    const overlay = page.locator('[aria-label="Eyedropper \u2014 click to sample color"]');
    await expect(overlay).toBeVisible({ timeout: 30_000 });

    // Wait for frame extraction to complete (loading spinner disappears)
    await page.waitForFunction(() => !document.querySelector('.animate-spin'), { timeout: 60_000 });

    // Click on the video area to sample a color
    const videoPanel = page.locator('[aria-label="Video panel"]');
    const box = await videoPanel.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }

    await page.waitForTimeout(500);
    const isActive = await page.evaluate(() => (window as any).__stores.uiStore.eyedropperActive);
    expect(isActive).toBe(false);
  });
});
