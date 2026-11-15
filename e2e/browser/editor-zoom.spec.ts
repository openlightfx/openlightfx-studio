import { expect, test } from '@playwright/test';
import { openFixtureEditor } from '../harness/browser';
import { ActiveEditorPage } from '../pages/active-editor-page';

test('ED2-009 @browser zoom anchors pointer, fits selection, and leaves document clean', async ({
  page,
}) => {
  const backend = await openFixtureEditor(page);
  const originalKeyframes = backend.track.keyframes.map((frame) => [frame.id, frame.timestampMs]);
  const scroll = page.locator('.timeline-scroll');
  const lane = page.locator('.lane').first();
  const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
  for (let index = 0; index < 8; index += 1)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await scroll.evaluate((node) => {
    node.scrollLeft = 120;
  });
  await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  const bounds = await lane.boundingBox();
  if (!bounds) throw new Error('timeline lane is not visible');
  const pointerX = bounds.x + bounds.width * 0.62;
  const before = await page.evaluate((x) => {
    const duration = Number(
      document.querySelector('[aria-label="Timeline ruler"]')!.getAttribute('aria-valuemax')
    );
    const scale =
      document.querySelector('[aria-label="Timeline ruler"]')!.getBoundingClientRect().width /
      duration;
    const laneLeft = document.querySelector('.lane')!.getBoundingClientRect().left;
    return (x - laneLeft) / scale;
  }, pointerX);
  await page.mouse.move(pointerX, bounds.y + bounds.height / 2);
  await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control');
  await expect.poll(() => ruler.boundingBox().then((box) => box!.width)).toBeGreaterThan(0);
  const after = await page.evaluate((x) => {
    const duration = Number(
      document.querySelector('[aria-label="Timeline ruler"]')!.getAttribute('aria-valuemax')
    );
    const scale =
      document.querySelector('[aria-label="Timeline ruler"]')!.getBoundingClientRect().width /
      duration;
    const laneLeft = document.querySelector('.lane')!.getBoundingClientRect().left;
    return { time: (x - laneLeft) / scale, scale };
  }, pointerX);
  expect(Math.abs(after.time - before) * after.scale).toBeLessThanOrEqual(1);
  const beforePan = await scroll.evaluate((node) => node.scrollLeft);
  await scroll.dispatchEvent('wheel', {
    shiftKey: true,
    deltaY: 40,
    bubbles: true,
    cancelable: true,
  });
  await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(beforePan);

  await expect(page.getByRole('button', { name: 'Fit selection' })).toBeDisabled();
  await page.getByRole('button', { name: 'Frame detail' }).click();
  await expect
    .poll(
      async () =>
        (await ruler.boundingBox())!.width / Number(await ruler.getAttribute('aria-valuemax'))
    )
    .toBeCloseTo(0.024, 3);
  await new ActiveEditorPage(page).selectKeyframe('left', 1000);
  const keyframe = page.locator('.diamond').first();
  await expect(page.getByRole('button', { name: 'Fit selection' })).toBeEnabled();
  await page.getByRole('button', { name: 'Fit selection' }).click();
  const marker = await keyframe.boundingBox();
  const laneBounds = await page.locator('.lane').first().boundingBox();
  expect(marker && laneBounds && marker.x).toBeGreaterThanOrEqual(laneBounds!.x - 1);
  expect(marker && laneBounds && marker.x).toBeLessThanOrEqual(
    laneBounds!.x + laneBounds!.width + 1
  );
  await expect(page.getByRole('button', { name: 'Fit movie' })).toBeVisible();
  await expect(page.locator('.timeline')).toHaveScreenshot('editor-zoom-controls.png');
  expect(backend.track.keyframes.map((frame) => [frame.id, frame.timestampMs])).toEqual(
    originalKeyframes
  );
  expect(backend.writes).toHaveLength(0);
  expect(backend.projects).toHaveLength(0);
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  const recoveryRecords = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const request = indexedDB.open('openlightfx-studio');
        request.onsuccess = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('crash')) {
            database.close();
            resolve(0);
            return;
          }
          const count = database.transaction('crash', 'readonly').objectStore('crash').count();
          count.onsuccess = () => {
            database.close();
            resolve(count.result);
          };
          count.onerror = () => {
            database.close();
            resolve(-1);
          };
        };
        request.onerror = () => resolve(-1);
      })
  );
  expect(recoveryRecords).toBe(0);
});

test('ED2-009 @browser Fit movie fits a four-hour document in a narrow timeline viewport', async ({
  page,
}) => {
  const durationMs = 4 * 60 * 60 * 1000;
  await page.setViewportSize({ width: 390, height: 720 });
  await openFixtureEditor(page, { durationMs, empty: true });
  const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
  await page.getByRole('button', { name: 'Fit movie' }).click();
  const measurements = await page.evaluate(() => {
    const ruler = document.querySelector<HTMLElement>('[aria-label="Timeline ruler"]')!;
    const scroll = document.querySelector<HTMLElement>('.timeline-scroll')!;
    const header = document.querySelector<HTMLElement>('.lane-header')!;
    return {
      rulerWidth: ruler.getBoundingClientRect().width,
      timeViewportWidth: scroll.clientWidth - header.getBoundingClientRect().width,
      scale: ruler.getBoundingClientRect().width / Number(ruler.getAttribute('aria-valuemax')),
      duration: Number(ruler.getAttribute('aria-valuemax')),
      scrollWidth: scroll.scrollWidth,
      clientWidth: scroll.clientWidth,
    };
  });
  expect(measurements.duration).toBe(durationMs);
  expect(measurements.rulerWidth).toBeGreaterThan(0);
  expect(Math.abs(measurements.rulerWidth - measurements.timeViewportWidth)).toBeLessThanOrEqual(1);
  expect(measurements.scrollWidth).toBeLessThanOrEqual(measurements.clientWidth + 181);
  await expect(ruler).toBeVisible();
});
