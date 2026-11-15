import { expect, test } from '@playwright/test';
import { openFixtureEditor } from '../harness/browser';
import { ActiveEditorPage } from '../pages/active-editor-page';

test('ED2-016 @browser cancel routes and teardown discard drafts without recovery or history writes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      if (this.name === 'crash')
        document.documentElement.dataset.crashWrites = String(
          Number(document.documentElement.dataset.crashWrites ?? 0) + 1
        );
      return put.apply(this, args);
    };
    document.addEventListener(
      'pointerdown',
      (event) => {
        document.documentElement.dataset.pointerId = String(event.pointerId);
      },
      true
    );
  });
  const backend = await openFixtureEditor(page);
  const editor = new ActiveEditorPage(page);
  const before = await editor.exportTrack();
  await editor.selectKeyframe('left', 1000);
  const initialWrites = await page.locator('html').getAttribute('data-crash-writes');
  for (const reason of ['pointercancel', 'lostpointercapture', 'blur', 'Escape', 'route']) {
    const mark = (await page.locator('.diamond').boundingBox())!;
    const ruler = (await page.getByRole('slider', { name: 'Timeline ruler' }).boundingBox())!;
    await page.mouse.move(mark.x + mark.width / 2, mark.y + mark.height / 2);
    await page.mouse.down();
    await page.mouse.move(mark.x + mark.width / 2 + ruler.width / 20, mark.y + mark.height / 2, {
      steps: 3,
    });
    await expect(page.getByLabel('Keyframe time', { exact: true })).toHaveValue('00:01.500');
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    expect(await page.locator('html').getAttribute('data-crash-writes')).toBe(initialWrites);
    if (reason === 'Escape') await page.keyboard.press('Escape');
    else if (reason === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else if (reason === 'route')
      await page.evaluate(() => {
        location.hash = '#/movie/42';
      });
    else
      await page.locator('.diamond').dispatchEvent(reason, {
        pointerId: Number(await page.locator('html').getAttribute('data-pointer-id')),
        bubbles: true,
      });
    await page.mouse.up();
    await expect(page.locator('body')).not.toHaveAttribute('data-editor-gesture', 'active');
    expect(await page.locator('html').getAttribute('data-crash-writes')).toBe(initialWrites);
    if (reason === 'route') {
      await expect(page.getByRole('heading', { name: 'Proxy Fixture', exact: true })).toBeVisible();
      await page
        .locator('.track-row')
        .first()
        .getByRole('button', { name: 'Open', exact: true })
        .click();
      await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
    } else await expect(page.getByLabel('Keyframe time', { exact: true })).toHaveValue('00:01.000');
    expect(await editor.exportTrack()).toEqual(before);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  }
  expect(backend.writeAttempts).toHaveLength(0);
});

test.describe('DPR 2 gesture geometry', () => {
  test.use({ deviceScaleFactor: 2 });
  test('ED2-014 @browser marquee uses CSS pixels at DPR two after zoom pan and resize', async ({
    page,
  }) => {
    await openFixtureEditor(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    for (let index = 0; index < 3; index++)
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const scroll = page.getByRole('region', { name: 'Timeline scroll area' });
    await scroll.evaluate((node) => {
      node.scrollLeft = 120;
    });
    const canvas = page.locator('.lane-canvas').first();
    await expect
      .poll(() => canvas.evaluate((node) => Number.parseFloat(getComputedStyle(node).left)))
      .toBe(120);
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    const bounds = (await canvas.boundingBox())!;
    const start = { x: bounds.x + 25, y: bounds.y + 3 };
    const end = { x: bounds.x + 225, y: bounds.y + 65 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 4 });
    const rectangle = page.getByRole('img', { name: 'Selection rectangle' });
    await expect(rectangle).toBeVisible();
    const actual = (await rectangle.boundingBox())!;
    expect(Math.abs(actual.x - start.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.y - start.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.x + actual.width - end.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.y + actual.height - end.y)).toBeLessThanOrEqual(1);
    await expect(page.locator('.timeline')).toHaveScreenshot('marquee-dpr-two.png', {
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  });
});
