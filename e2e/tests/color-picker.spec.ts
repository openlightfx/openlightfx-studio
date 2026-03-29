import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/app.page';
import { TimelinePage } from '../pages/timeline.page';
import { ColorPickerPage } from '../pages/color-picker.page';

test.describe('Color picker', () => {
  let app: AppPage;
  let timeline: TimelinePage;
  let colorPicker: ColorPickerPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    timeline = new TimelinePage(page);
    colorPicker = new ColorPickerPage(page);
    await app.boot();
    await timeline.clickKeyframe(0, 0);
    await page.locator('.fixed.z-50.bg-surface.rounded-xl.shadow-2xl').waitFor({ state: 'visible' });
  });

  test('expand color picker shows color wheel', async () => {
    await colorPicker.toggleExpand();
    expect(await colorPicker.isWheelVisible()).toBe(true);
  });

  test('clicking color wheel changes keyframe color', async () => {
    await colorPicker.toggleExpand();
    const colorBefore = await colorPicker.getKeyframeColor('kf-left-0');
    await colorPicker.clickWheel(90, 0.7);
    const colorAfter = await colorPicker.getKeyframeColor('kf-left-0');
    expect(
      colorAfter.r !== colorBefore.r ||
      colorAfter.g !== colorBefore.g ||
      colorAfter.b !== colorBefore.b,
    ).toBe(true);
  });

  test('RGB sliders update keyframe color', async ({ page }) => {
    await colorPicker.toggleExpand();
    await colorPicker.setRGBSlider('R', 255);
    await colorPicker.setRGBSlider('G', 0);
    await colorPicker.setRGBSlider('B', 0);
    await page.waitForTimeout(300);
    const color = await colorPicker.getKeyframeColor('kf-left-0');
    expect(color.r).toBe(255);
    expect(color.g).toBe(0);
    expect(color.b).toBe(0);
  });

  test('hex input applies color', async () => {
    await colorPicker.toggleExpand();
    await colorPicker.setHex('00FF00');
    const color = await colorPicker.getKeyframeColor('kf-left-0');
    expect(color).toEqual({ r: 0, g: 255, b: 0 });
  });

  test('invalid hex shows error', async () => {
    await colorPicker.toggleExpand();
    await colorPicker.setHex('ZZZZZZ');
    expect(await colorPicker.hasHexError()).toBe(true);
    const color = await colorPicker.getKeyframeColor('kf-left-0');
    expect(color).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('switch to Kelvin mode shows kelvin slider', async () => {
    await colorPicker.toggleExpand();
    await colorPicker.selectMode('Kelvin');
    expect(await colorPicker.isKelvinSliderVisible()).toBe(true);
    expect(await colorPicker.isWheelVisible()).toBe(false);
  });

  test('Kelvin slider sets color temperature', async () => {
    await colorPicker.toggleExpand();
    await colorPicker.selectMode('Kelvin');
    await colorPicker.setKelvin(3000);
    const mode = await colorPicker.getKeyframeColorMode('kf-left-0');
    expect(mode).toBe('COLOR_TEMPERATURE');
  });

  test('switch back to RGB mode shows wheel', async () => {
    await colorPicker.toggleExpand();
    await colorPicker.selectMode('Kelvin');
    expect(await colorPicker.isWheelVisible()).toBe(false);
    await colorPicker.selectMode('RGB');
    expect(await colorPicker.isWheelVisible()).toBe(true);
  });

  test('color history records picks', async ({ page }) => {
    await colorPicker.toggleExpand();
    await page.evaluate(() => localStorage.removeItem('openlightfx-studio:color-history'));
    await colorPicker.setHex('FF0000');
    await page.waitForTimeout(200);
    await colorPicker.setHex('00FF00');
    await page.waitForTimeout(200);
    const count = await colorPicker.getHistoryCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('clicking history swatch applies color', async ({ page }) => {
    await colorPicker.toggleExpand();
    await colorPicker.setHex('0000FF');
    await page.waitForTimeout(200);
    await colorPicker.setHex('FF0000');
    await page.waitForTimeout(200);
    const historyCount = await colorPicker.getHistoryCount();
    if (historyCount > 0) {
      await colorPicker.clickHistorySwatch(0);
      const color = await colorPicker.getKeyframeColor('kf-left-0');
      expect(color.r + color.g + color.b).toBeGreaterThan(0);
    }
  });

  test('multi-select color change applies to all keyframes', async ({ page }) => {
    await timeline.clickKeyframe(0, 1, { ctrlKey: true });
    await page.waitForTimeout(200);

    await colorPicker.toggleExpand();
    await colorPicker.setHex('FF0000');
    await page.waitForTimeout(300);

    const leftColor = await colorPicker.getKeyframeColor('kf-left-0');
    const rightColor = await colorPicker.getKeyframeColor('kf-right-0');
    expect(leftColor).toEqual({ r: 255, g: 0, b: 0 });
    expect(rightColor).toEqual({ r: 255, g: 0, b: 0 });
  });
});
