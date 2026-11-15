import { expect, test } from '@playwright/test';
import { ActiveEditorPage } from '../pages/active-editor-page';
import { openFixtureEditor } from '../harness/browser';

// ED2-013 @browser

test('ED2-013 @browser range selection keeps its primary and cancels capture before clearing', async ({
  page,
}) => {
  await openFixtureEditor(page);
  const active = new ActiveEditorPage(page);
  await active.selectKeyframe('left', 1000);
  await page.locator('.lane-canvas').first().focus();
  await page.keyboard.press('Shift+ArrowDown');

  await expect(page.getByRole('heading', { name: '2 selected keyframes' })).toBeVisible();
  await expect(page.getByLabel('Keyframe time')).toHaveValue('00:06.000');
  await expect(page.locator('input[type="color"][aria-label="Color"]')).toHaveValue('#00ff00');
  await expect(page.locator('input[type="range"][aria-label="Brightness"]')).toHaveValue('70');
  await expect(page.getByLabel('Hex')).toHaveValue('—');
  await expect(page.getByLabel('Brightness value')).toHaveValue('—');
  await expect(page.locator('.lane-canvas').first()).toBeFocused();
  await expect(page.locator('.diamond')).toHaveCount(1);
  await expect(page.locator('.diamond')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.diamond')).toHaveAccessibleName('Left keyframe at 00:06.000');
  const rulerBounds = (await page.getByRole('slider', { name: 'Timeline ruler' }).boundingBox())!;
  const primaryBounds = (await page.locator('.diamond').boundingBox())!;
  const scale =
    rulerBounds.width /
    Number(
      await page.getByRole('slider', { name: 'Timeline ruler' }).getAttribute('aria-valuemax')
    );
  expect(
    Math.abs(primaryBounds.x + primaryBounds.width / 2 - (rulerBounds.x + 6000 * scale))
  ).toBeLessThanOrEqual(1);
  await expect(page.locator('.timeline')).toHaveScreenshot('selection-range-primary.png', {
    animations: 'disabled',
  });

  const primary = page.locator('.diamond');
  const bounds = (await primary.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.getByRole('heading', { name: '2 selected keyframes' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Keyframe', exact: true })).toBeVisible();

  await active.selectKeyframe('left', 1000);
  await page.locator('.lane-canvas').first().focus();
  await page.keyboard.press('Shift+ArrowDown');
  await expect(page.getByRole('heading', { name: '2 selected keyframes' })).toBeVisible();
  const restoredPrimary = page.locator('.diamond');
  const restoredBounds = (await restoredPrimary.boundingBox())!;
  await page.mouse.move(
    restoredBounds.x + restoredBounds.width / 2,
    restoredBounds.y + restoredBounds.height / 2
  );
  await page.mouse.down();
  await expect(page.locator('body')).toHaveAttribute('data-editor-gesture', 'active');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveAttribute('data-editor-gesture', 'active');
  await expect(page.getByRole('heading', { name: '2 selected keyframes' })).toBeVisible();
  await page.mouse.up();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '2 selected keyframes' })).toHaveCount(0);
});

test('ED2-013 @browser Ctrl+A selects offscreen keys only in timeline and native inputs keep text selection', async ({
  page,
}) => {
  await openFixtureEditor(page);
  const editor = new ActiveEditorPage(page);
  await editor.selectKeyframe('left', 1000);
  const title = page.getByLabel('Track title');
  await title.focus();
  await page.keyboard.press('Control+A');
  await expect(title).toBeFocused();
  const nativeSelection = await title.evaluate((node) => {
    const input = node as HTMLInputElement;
    return [input.selectionStart, input.selectionEnd, input.value.length];
  });
  expect(nativeSelection[0]).toBe(0);
  expect(nativeSelection[1]).toBe(nativeSelection[2]);

  const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
  const durationMs = Number(await ruler.getAttribute('aria-valuemax'));
  await page.locator('.lane-canvas').first().focus();
  for (let index = 0; index < 18; index++) await page.keyboard.press(']');
  const rulerBounds = (await ruler.boundingBox())!;
  const scale = rulerBounds.width / durationMs;
  const leftCanvas = page.locator('.lane-canvas').first();
  const canvasWidth = await leftCanvas.evaluate((node) => node.clientWidth);
  expect(8000 * scale).toBeGreaterThan(canvasWidth);

  await leftCanvas.focus();
  await page.keyboard.press('Control+A');
  await expect(page.getByRole('heading', { name: '4 selected keyframes' })).toBeVisible();
});

test('ED2-013 @browser primary Inspector follows inherited insertion and undo without changing selection exports', async ({
  page,
}) => {
  const backend = await openFixtureEditor(page);
  const editor = new ActiveEditorPage(page);
  const before = await editor.exportTrack();

  await editor.selectKeyframe('left', 6000);
  await expect(page.getByLabel('Hex')).toHaveValue('00ff00');
  await expect(page.getByLabel('Brightness value')).toHaveValue('70');
  const afterSelection = await editor.exportTrack();
  expect(afterSelection).toEqual(before);
  expect(backend.writeAttempts).toHaveLength(0);
  await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);

  const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
  const bounds = (await ruler.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width * 0.3, bounds.y + bounds.height / 2);
  await page.keyboard.press('k');
  await expect(page.getByLabel('Hex')).toHaveValue('ff0000');
  await expect(page.getByLabel('Brightness value')).toHaveValue('100');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Hex')).toHaveValue('00ff00');
  await expect(page.getByLabel('Brightness value')).toHaveValue('70');
  expect(await editor.exportTrack()).toEqual(before);
});
