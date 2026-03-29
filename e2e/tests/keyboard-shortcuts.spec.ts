import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';
import { TimelinePage } from '../pages/timeline.page';
import { CommandPalettePage } from '../pages/command-palette.page';

test.describe('Keyboard shortcuts', () => {
  let app: AppPage;
  let timeline: TimelinePage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    timeline = new TimelinePage(page);
    await app.boot();
  });

  test('Ctrl+K opens command palette', async ({ page }) => {
    const palette = new CommandPalettePage(page);
    await palette.open();
    expect(await palette.isVisible()).toBe(true);
  });

  test('Escape closes command palette', async ({ page }) => {
    const palette = new CommandPalettePage(page);
    await palette.open();
    await palette.close();
    expect(await palette.isVisible()).toBe(false);
  });

  test('Ctrl+Z undoes keyframe creation', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();
    await timeline.doubleClickAt(2500, 0);
    const countAfterCreate = await timeline.getKeyframeCount();
    expect(countAfterCreate).toBe(countBefore + 1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    const countAfterUndo = await timeline.getKeyframeCount();
    expect(countAfterUndo).toBe(countBefore);
  });

  test('Ctrl+Shift+Z redoes', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();
    await timeline.doubleClickAt(2500, 0);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(200);

    const countAfterRedo = await timeline.getKeyframeCount();
    expect(countAfterRedo).toBe(countBefore + 1);
  });

  test('Delete removes selected keyframe', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();
    await timeline.clickKeyframe(5000, 0);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    const countAfter = await timeline.getKeyframeCount();
    expect(countAfter).toBe(countBefore - 1);
  });

  test('+ key zooms in', async ({ page }) => {
    const pxBefore = await timeline.getPxPerMs();
    await page.keyboard.press('Equal');
    await page.waitForTimeout(200);
    const pxAfter = await timeline.getPxPerMs();
    expect(pxAfter).toBeGreaterThan(pxBefore);
  });

  test('- key zooms out', async ({ page }) => {
    const pxBefore = await timeline.getPxPerMs();
    await page.keyboard.press('Minus');
    await page.waitForTimeout(200);
    const pxAfter = await timeline.getPxPerMs();
    expect(pxAfter).toBeLessThan(pxBefore);
  });

  test('Ctrl+C / Ctrl+V copies and pastes keyframe', async ({ page }) => {
    const countBefore = await timeline.getKeyframeCount();

    await timeline.clickKeyframe(0, 0);
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+v');
    await page.waitForTimeout(200);

    const countAfter = await timeline.getKeyframeCount();
    expect(countAfter).toBe(countBefore + 1);
  });
});
