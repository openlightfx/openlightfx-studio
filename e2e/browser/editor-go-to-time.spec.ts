import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { decodeTrack, encodeTrack, normalizeForEncode } from '../../src/lib/domain';
import { openFixtureEditor } from '../harness/browser';

test('ED2-012 @browser go-to-time validates exact milliseconds and preserves authored state', async ({
  page,
}) => {
  const backend = await openFixtureEditor(page);
  const field = page.getByRole('textbox', { name: 'Go to time' });
  await field.fill('00:00:01.234');
  await field.press('Enter');
  const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
  await expect(ruler).toHaveAttribute('aria-valuenow', '1234');
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(1.234, 2);
  await ruler.focus();
  await page.keyboard.press('PageDown');
  await expect(ruler).toHaveAttribute('aria-valuenow', '6000');
  await page.getByRole('button', { name: 'All lanes' }).click();
  await page.keyboard.press('PageUp');
  await expect(ruler).toHaveAttribute('aria-valuenow', '2000');
  await page.keyboard.press('Home');
  await expect(ruler).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('button', { name: 'Previous keyframe' })).toBeDisabled();
  await page.keyboard.press('End');
  await expect(ruler).toHaveAttribute('aria-valuenow', '10000');
  await expect(page.getByRole('button', { name: 'Next keyframe' })).toBeDisabled();
  await field.fill('00:00:03.456');
  await field.press('Home');
  await expect(ruler).toHaveAttribute('aria-valuenow', '10000');
  await expect(field).toHaveValue('00:00:03.456');
  await field.press('Escape');
  await expect(field).toHaveValue('00:00:10.000');
  await field.fill('00:00:02.000');
  await field.press('Enter');
  await expect(ruler).toHaveAttribute('aria-valuenow', '2000');
  await field.fill('00:00:10.001');
  await field.press('Enter');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(ruler).toHaveAttribute('aria-valuenow', '2000');
  await field.fill('nonsense');
  await field.press('Enter');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(ruler).toHaveAttribute('aria-valuenow', '2000');
  await expect(page.getByRole('alert')).toContainText('Enter a time');
  await expect(page.locator('.timeline')).toHaveScreenshot('editor-navigation-invalid-time.png');
  await expect(field).toBeFocused();
  expect(backend.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: /Export/ }).click();
  const downloaded = await downloadPromise;
  const exported = decodeTrack(fs.readFileSync((await downloaded.path())!));
  expect(exported.keyframes).toEqual(normalizeForEncode(backend.track).keyframes);
  expect(exported.metadata).toEqual(decodeTrack(encodeTrack(backend.track)).metadata);
  expect(
    backend.track.keyframes.map(({ id, timestampMs, color, brightness }) => ({
      id,
      timestampMs,
      color,
      brightness,
    }))
  ).toEqual([
    { id: 'left-red', timestampMs: 1000, color: { r: 255, g: 0, b: 0 }, brightness: 100 },
    { id: 'right-blue', timestampMs: 2000, color: { r: 0, g: 0, b: 255 }, brightness: 40 },
    { id: 'left-green', timestampMs: 6000, color: { r: 0, g: 255, b: 0 }, brightness: 70 },
    { id: 'right-white', timestampMs: 8000, color: { r: 255, g: 255, b: 255 }, brightness: 20 },
  ]);
});

test('ED2-012 @browser navigation controls remain reachable at narrow and desktop widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixtureEditor(page);
  const controls = [
    page.getByRole('textbox', { name: 'Go to time' }),
    page.getByRole('button', { name: 'All lanes' }),
    page.getByRole('button', { name: 'Previous keyframe' }),
    page.getByRole('button', { name: 'Next keyframe' }),
  ];
  for (const width of [390, 1024, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 844 });
    for (const control of controls) {
      await expect(control).toBeVisible();
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  }
  await controls[0].focus();
  await expect(controls[0]).toBeFocused();
});
