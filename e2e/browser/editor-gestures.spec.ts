import { expect, test, type Page } from '@playwright/test';
import { openFixtureEditor } from '../harness/browser';
import { ActiveEditorPage } from '../pages/active-editor-page';

async function point(page: Page, time: number, lane: number, y = 19) {
  const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
  const bounds = (await ruler.boundingBox())!;
  const canvas = (await page.locator('.lane-canvas').nth(lane).boundingBox())!;
  const duration = Number(await ruler.getAttribute('aria-valuemax'));
  return {
    x: bounds.x + (time * bounds.width) / duration,
    y: canvas.y + y,
    scale: bounds.width / duration,
  };
}
async function startRectangle(page: Page, reverse = false) {
  const start = await point(page, reverse ? 6500 : 500, reverse ? 1 : 0, reverse ? 35 : 3);
  const end = await point(page, reverse ? 500 : 6500, reverse ? 0 : 1, reverse ? 3 : 35);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  return { start, end };
}

test('ED2-014 @browser click jitter inserts but a center-based cross-lane marquee never authors', async ({
  page,
}) => {
  const backend = await openFixtureEditor(page);
  const editor = new ActiveEditorPage(page);
  await page.getByRole('button', { name: 'Fit movie', exact: true }).click();
  const before = await editor.exportTrack();
  expect(
    await page.locator('.timeline-scroll').evaluate((node) => node.scrollWidth - node.clientWidth)
  ).toBeLessThanOrEqual(1);
  const click = await point(page, 4000, 0, 4);
  await page.mouse.move(click.x, click.y);
  await page.mouse.down();
  await page.mouse.move(click.x + 2, click.y + 1);
  await page.mouse.up();
  const inserted = (await editor.exportTrack()).keyframes.filter(
    (frame) => !before.keyframes.some((old) => old.id === frame.id)
  );
  expect(inserted).toHaveLength(1);
  expect(inserted[0].timestampMs).toBe(4000);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.locator('.lane-canvas').first().focus();
  await page.keyboard.press('Escape');

  const { start, end } = await startRectangle(page);
  const rectangle = page.getByRole('img', { name: 'Selection rectangle' });
  await expect(rectangle).toBeVisible();
  const bounds = (await rectangle.boundingBox())!;
  expect(Math.abs(bounds.x - start.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds.y - start.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds.x + bounds.width - end.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds.y + bounds.height - end.y)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('heading', { name: '3 selected keyframes' })).toBeVisible();
  await expect(page.locator('.timeline')).toHaveScreenshot('marquee-cross-lane.png', {
    animations: 'disabled',
  });
  await page.mouse.up();
  await expect(rectangle).toHaveCount(0);
  expect(await editor.exportTrack()).toEqual(before);
  await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
  expect(backend.writeAttempts).toHaveLength(0);

  await startRectangle(page, true);
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: '3 selected keyframes' })).toBeVisible();
  expect(await editor.exportTrack()).toEqual(before);
});

test('ED2-014 @browser marquee modifiers use the initial snapshot and every cancel restores it', async ({
  page,
}) => {
  await openFixtureEditor(page);
  const editor = new ActiveEditorPage(page);
  await page.getByRole('button', { name: 'Fit movie', exact: true }).click();
  const before = await editor.exportTrack();
  await editor.selectKeyframe('right', 8000);
  await page.keyboard.down('Shift');
  await startRectangle(page);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByRole('heading', { name: '4 selected keyframes' })).toBeVisible();
  await page.keyboard.down('Control');
  await startRectangle(page);
  await page.mouse.up();
  await page.keyboard.up('Control');
  await expect(page.getByLabel('Keyframe time', { exact: true })).toHaveValue('00:08.000');
  await expect(page.getByRole('heading', { name: 'Keyframe', exact: true })).toBeVisible();

  await page.evaluate(() =>
    document.addEventListener(
      'pointerdown',
      (event) => {
        document.documentElement.dataset.lastPointerId = String(event.pointerId);
      },
      true
    )
  );
  for (const reason of ['Escape', 'pointercancel', 'lostpointercapture', 'blur']) {
    await startRectangle(page);
    await expect(page.getByRole('heading', { name: '3 selected keyframes' })).toBeVisible();
    if (reason === 'Escape') await page.keyboard.press('Escape');
    else if (reason === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else
      await page
        .locator('.lane-canvas')
        .first()
        .dispatchEvent(reason, {
          pointerId: Number(await page.locator('html').getAttribute('data-last-pointer-id')),
          bubbles: true,
        });
    await expect(page.getByRole('img', { name: 'Selection rectangle' })).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveAttribute('data-editor-gesture', 'active');
    await page.mouse.up();
    await expect(page.getByLabel('Keyframe time', { exact: true })).toHaveValue('00:08.000');
    expect(await editor.exportTrack()).toEqual(before);
  }
});

test('ED2-016 @browser a live group draft preserves offsets, commits once, clamps and cancels', async ({
  page,
}) => {
  const backend = await openFixtureEditor(page);
  const editor = new ActiveEditorPage(page);
  await page.getByRole('button', { name: 'Fit movie', exact: true }).click();
  const before = await editor.exportTrack();
  await editor.selectKeyframe('left', 1000);
  await page.keyboard.down('Control');
  await editor.selectKeyframe('right', 2000);
  await page.keyboard.up('Control');
  const from = await point(page, 1000, 0);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 1000 * from.scale, from.y + 20, { steps: 5 });
  await expect(page.getByLabel('Keyframe time', { exact: true })).toHaveValue('00:02.000');
  await expect(page.getByRole('heading', { name: '2 selected keyframes' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Editor feedback' })).toHaveText('Move +1000 ms');
  await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
  const draftMark = (await page.locator('.diamond').boundingBox())!;
  expect(
    Math.abs(draftMark.x + draftMark.width / 2 - (from.x + 1000 * from.scale))
  ).toBeLessThanOrEqual(1);
  await expect(page.locator('.timeline')).toHaveScreenshot('live-group-drag.png', {
    animations: 'disabled',
  });
  await page.mouse.up();
  const moved = await editor.exportTrack();
  expect(moved).toEqual({
    ...before,
    safety: { ...before.safety, maxFlashFrequencyHz: 0.25 },
    keyframes: before.keyframes.map((frame) =>
      ['left-red', 'right-blue'].includes(frame.id)
        ? { ...frame, timestampMs: frame.timestampMs + 1000 }
        : frame
    ),
  });
  expect(backend.writeAttempts).toHaveLength(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await editor.exportTrack()).toEqual(before);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();

  // Request past an unselected neighbor: the grabbed key lands on frame 139, while
  // the other selected lane retains its exact 1000 ms offset, not a collapsed bound.
  const start = await point(page, 1000, 0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10000 * start.scale, start.y, { steps: 3 });
  await expect(page.getByLabel('Keyframe time', { exact: true })).toHaveValue('00:05.792');
  await expect(page.getByRole('status', { name: 'Editor feedback' })).toContainText('clamped');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await editor.exportTrack()).toEqual(before);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await expect(page.locator('body')).not.toHaveAttribute('data-editor-gesture', 'active');
});

test('ED2-014 @browser edge autoscroll stops on cancel without authoring', async ({ page }) => {
  await openFixtureEditor(page);
  const editor = new ActiveEditorPage(page);
  const before = await editor.exportTrack();
  await page.getByRole('button', { name: 'Frame detail', exact: true }).click();
  // Increase from frame detail until there is room to scroll beyond the viewport.
  for (let index = 0; index < 18; index++)
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const canvas = (await page.locator('.lane-canvas').first().boundingBox())!;
  const scroll = page.getByRole('region', { name: 'Timeline scroll area' });
  await page.mouse.move(canvas.x + 20, canvas.y + 3);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width - 2, canvas.y + 35);
  await expect.poll(() => scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(30);
  const rect = (await page.getByRole('img', { name: 'Selection rectangle' }).boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(canvas.x - 1);
  expect(rect.x + rect.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
  await page.keyboard.press('Escape');
  const cancelledAt = await scroll.evaluate((node) => node.scrollLeft);
  await page.evaluate(async () => {
    for (let index = 0; index < 5; index++) await new Promise(requestAnimationFrame);
  });
  expect(await scroll.evaluate((node) => node.scrollLeft)).toBe(cancelledAt);
  await page.mouse.up();
  expect(await editor.exportTrack()).toEqual(before);
});
