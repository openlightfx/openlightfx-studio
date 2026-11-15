import { expect, test } from '@playwright/test';
import { decodeTrack } from '../../src/lib/domain';
import { ActiveEditorPage } from '../pages/active-editor-page';
import { openFixtureEditor, menu } from '../harness/browser';

test('ED2-006 @browser commands dispatch once, match controls, and respect native/modal scope', async ({
  page,
}) => {
  const backend = await openFixtureEditor(page);
  const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
  const initialCount = await page.locator('.diamond').count();
  const originalDocumentCount = backend.track.keyframes.length;
  const title = page.getByLabel('Track title');
  await title.focus();
  await page.keyboard.press('k');
  await expect(page.locator('.diamond')).toHaveCount(initialCount);
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await play.focus();
  await page.keyboard.press('k');
  await expect(page.locator('.diamond')).toHaveCount(initialCount);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('k');
  await expect(page.locator('.diamond')).toHaveCount(initialCount + 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.diamond')).toHaveCount(initialCount);
  await menu(page, 'Edit', 'Redo');
  await expect(page.locator('.diamond')).toHaveCount(initialCount + 1);
  await page.keyboard.press('Backspace');
  await expect(page.locator('.diamond')).toHaveCount(initialCount);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.diamond')).toHaveCount(initialCount + 1);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoomedWidth = (await ruler.boundingBox())!.width;
  await page.keyboard.press('\\');
  await expect.poll(async () => (await ruler.boundingBox())!.width).toBeLessThan(zoomedWidth);

  await title.focus();
  await page.keyboard.press('Control+s');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect
    .poll(
      async () =>
        await page.evaluate(
          () =>
            performance
              .getEntriesByType('resource')
              .filter((entry) => entry.name.includes('/Tracks/')).length
        )
    )
    .toBeGreaterThan(0);
  await title.focus();
  await page.keyboard.press('Control+z');
  await expect(title).toBeFocused();

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click();
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toContainText('Add keyframe: K');
  await expect(help).toContainText('Eyedropper / pick color from frame: I');
  await expect(help).toContainText('Toggle visual overlay: V');
  await page.keyboard.press('Delete');
  await expect(help).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await new ActiveEditorPage(page).selectKeyframe('left', 1000);
  const frameRequest = page.waitForRequest((request) => request.url().includes('/Frame?timeMs='));
  await page.keyboard.press('i');
  expect(new URL((await frameRequest).url()).searchParams.has('timeMs')).toBe(true);
  await expect(page.getByRole('alert')).toContainText('frame could not be sampled');

  await page.keyboard.press('Control+k');
  await expect(page.locator('.diamond')).toHaveCount(initialCount + 1);
  await page.keyboard.press('Control+l');
  await expect(page.locator('.diamond')).toHaveCount(initialCount + 1);
  await page.keyboard.press('Control+d');
  await expect(page.locator('.diamond')).toHaveCount(initialCount + 1);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    menu(page, 'File', 'Export .lightfx'),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await (await import('node:fs/promises')).readFile(path!);
  const exported = decodeTrack(new Uint8Array(bytes));
  expect(exported.keyframes).toHaveLength(originalDocumentCount + 1);
  expect(exported.keyframes.map((key) => key.id)).toContain('left-red');
});

test('ED2-006 @browser captured timeline gestures block commands until pointer release', async ({
  page,
}) => {
  await openFixtureEditor(page);
  await new ActiveEditorPage(page).selectKeyframe('left', 1000);
  const totalKeyframes = () =>
    page
      .locator('.lane-canvas')
      .evaluateAll((canvases) =>
        canvases.reduce(
          (count, canvas) => count + Number((canvas as HTMLCanvasElement).dataset.keyframeCount),
          0
        )
      );
  expect(await totalKeyframes()).toBe(4);

  const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
  const bounds = (await ruler.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect(page.locator('body')).toHaveAttribute('data-editor-gesture', 'active');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Space');
  expect(await totalKeyframes()).toBe(4);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  await page.mouse.up();
  await expect(page.locator('body')).not.toHaveAttribute('data-editor-gesture', 'active');
  await page.keyboard.press('Delete');
  await expect.poll(totalKeyframes).toBe(3);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});
