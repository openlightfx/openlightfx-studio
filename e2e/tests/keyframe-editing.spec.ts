import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';
import { TimelinePage } from '../pages/timeline.page';

test.describe('Keyframe editing via popover', () => {
  let app: AppPage;
  let timeline: TimelinePage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    timeline = new TimelinePage(page);
    await app.boot();
  });

  test('popover opens when keyframe is selected', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl').first();
    await expect(popover).toBeVisible({ timeout: 3_000 });
  });

  test('brightness slider changes keyframe brightness', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl').first();
    await expect(popover).toBeVisible();

    const brightnessSlider = popover.locator('label:has-text("Bright")').locator('..').locator('input[type="range"]');
    await brightnessSlider.evaluate((el: HTMLInputElement) => {
      el.value = '50';
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    await page.waitForTimeout(200);

    const kf = await timeline.getKeyframe('kf-left-0');
    expect(kf.brightness).toBeCloseTo(0.5, 1);
  });

  test('interpolation dropdown changes keyframe interpolation', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl').first();
    await expect(popover).toBeVisible();

    const select = popover.locator('label:has-text("Interp")').locator('..').locator('select');
    await select.selectOption('LINEAR');
    await page.waitForTimeout(200);

    const kf = await timeline.getKeyframe('kf-left-0');
    expect(kf.interpolation).toBe('LINEAR');
  });

  test('power toggle changes keyframe powerOn', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl').first();
    await expect(popover).toBeVisible();

    const toggle = popover.locator('button[role="switch"]');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await page.waitForTimeout(200);

    const kf = await timeline.getKeyframe('kf-left-0');
    expect(kf.powerOn).toBe(false);
  });

  test('transition slider changes keyframe transition', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl').first();
    await expect(popover).toBeVisible();

    const transitionSlider = popover.locator('label:has-text("Trans")').locator('..').locator('input[type="range"]');
    await transitionSlider.evaluate((el: HTMLInputElement) => {
      el.value = '500';
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    await page.waitForTimeout(200);

    const kf = await timeline.getKeyframe('kf-left-0');
    expect(kf.transitionMs).toBeCloseTo(500, -1);
  });

  test('multi-select shows mixed indicator', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    await timeline.clickKeyframe(0, 1, { ctrlKey: true });

    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl').first();
    await expect(popover).toBeVisible();
    await expect(popover.getByText('2 selected')).toBeVisible();
  });

  test('popover closes when deselecting', async ({ page }) => {
    await timeline.clickKeyframe(0, 0);
    const popover = page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl').first();
    await expect(popover).toBeVisible();

    await timeline.clickEmpty();
    await expect(popover).not.toBeVisible({ timeout: 2_000 });
  });
});
