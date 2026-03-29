import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';
import { TimelinePage } from '../pages/timeline.page';
import { ColorPickerPage } from '../pages/color-picker.page';

test.describe('Undo/redo chains', () => {
  let app: AppPage;
  let timeline: TimelinePage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    timeline = new TimelinePage(page);
    await app.boot();
  });

  test('create keyframe then undo removes it', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();
    await timeline.doubleClickAt(2500, 0);
    expect(await timeline.getKeyframeCount()).toBe(countBefore + 1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    expect(await timeline.getKeyframeCount()).toBe(countBefore);
  });

  test('edit color then undo reverts', async ({ page }) => {
    const colorBefore = await page.evaluate(() => {
      const kf = (window as any).__stores.projectStore.file?.track.keyframes
        .find((k: any) => k.id === 'kf-left-0');
      return kf ? { r: kf.color.r, g: kf.color.g, b: kf.color.b } : null;
    });
    expect(colorBefore).toEqual({ r: 255, g: 0, b: 0 });

    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl');
    await expect(popover).toBeVisible();

    const colorPicker = new ColorPickerPage(page);
    await colorPicker.toggleExpand();
    await colorPicker.setHex('00FF00');
    await page.waitForTimeout(300);

    const colorAfterEdit = await colorPicker.getKeyframeColor('kf-left-0');
    expect(colorAfterEdit).toEqual({ r: 0, g: 255, b: 0 });

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    const colorAfterUndo = await page.evaluate(() => {
      const kf = (window as any).__stores.projectStore.file?.track.keyframes
        .find((k: any) => k.id === 'kf-left-0');
      return kf ? { r: kf.color.r, g: kf.color.g, b: kf.color.b } : null;
    });
    expect(colorAfterUndo).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('multi-step undo reverts in order', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();

    await timeline.doubleClickAt(2500, 0);
    expect(await timeline.getKeyframeCount()).toBe(countBefore + 1);

    const keyframes = await timeline.getKeyframes();
    const newKf = keyframes.find(
      (kf) => kf.channelId === 'left' && kf.id !== 'kf-left-0' && kf.id !== 'kf-left-5000',
    );
    expect(newKf).toBeTruthy();

    await timeline.clickKeyframe(newKf!.timestampMs, 0);
    await timeline.dragKeyframe(newKf!.timestampMs, 4000, 0);

    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);
    expect(await timeline.getKeyframeCount()).toBe(countBefore);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);
    expect(await timeline.getKeyframeCount()).toBe(countBefore + 1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);
    expect(await timeline.getKeyframeCount()).toBe(countBefore);
  });

  test('redo replays after undo', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();
    await timeline.doubleClickAt(2500, 0);
    expect(await timeline.getKeyframeCount()).toBe(countBefore + 1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    expect(await timeline.getKeyframeCount()).toBe(countBefore);

    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(200);
    expect(await timeline.getKeyframeCount()).toBe(countBefore + 1);
  });

  test('rename channel then undo reverts', async ({ page }) => {
    const firstName = page.locator('.channel-headers .channel-row').first().locator('span.truncate');
    await firstName.dblclick();
    const input = page.locator('.channel-headers .channel-row').first().locator('input[type="text"]');
    await input.fill('Renamed');
    await input.press('Enter');
    await page.waitForTimeout(200);

    const nameAfter = await page.evaluate(() => {
      return (window as any).__stores.projectStore.file?.track.channels[0].displayName;
    });
    expect(nameAfter).toBe('Renamed');

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    const nameReverted = await page.evaluate(() => {
      return (window as any).__stores.projectStore.file?.track.channels[0].displayName;
    });
    expect(nameReverted).toBe('Left');
  });
});
