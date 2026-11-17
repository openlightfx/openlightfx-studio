import { expect } from '@playwright/test';
import { openFixtureEditor } from '../harness/browser';
import { ActiveEditorPage } from '../pages/active-editor-page';
import { trackWithNeighboringKeys } from '../fixtures/editor';
import { requirement } from '../harness/requirement';

requirement(
  'ED2-026 @browser workspace separators resize accessibly, persist locally, and reset without editing the document',
  async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openFixtureEditor(page, { track: trackWithNeighboringKeys('LAYOUT_2_0') });
    const active = new ActiveEditorPage(page);
    await active.selectKeyframe('left', 7300);
    const inspector = page.getByRole('separator', { name: 'Inspector width' });
    const timeline = page.getByRole('separator', { name: 'Timeline height' });
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    const initialTime = await ruler.getAttribute('aria-valuenow');
    const initialVideoTime = await page
      .locator('video')
      .evaluate((node) => (node as HTMLVideoElement).currentTime);
    const crashBefore = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('openlightfx-studio');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction('crash', 'readonly').objectStore('crash').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return JSON.stringify(record);
    });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page).toHaveScreenshot('workspace-default.png', {
      fullPage: true,
      animations: 'disabled',
      mask: [page.locator('video')],
    });
    const initialInspector = Number(await inspector.getAttribute('aria-valuenow'));
    await inspector.focus();
    await page.keyboard.press('ArrowLeft');
    expect(Number(await inspector.getAttribute('aria-valuenow'))).toBe(initialInspector + 10);
    expect(await ruler.getAttribute('aria-valuenow')).toBe(initialTime);
    expect(
      await page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime)
    ).toBe(initialVideoTime);
    await page.keyboard.press('End');
    expect(await inspector.getAttribute('aria-valuenow')).toBe(
      await inspector.getAttribute('aria-valuemax')
    );
    await page.keyboard.press('Home');
    expect(await inspector.getAttribute('aria-valuenow')).toBe(
      await inspector.getAttribute('aria-valuemin')
    );

    await page.keyboard.press('End');
    await expect(page).toHaveScreenshot('workspace-wide-inspector.png', {
      fullPage: true,
      animations: 'disabled',
      mask: [page.locator('video')],
    });

    const timelineBox = (await timeline.boundingBox())!;
    await page.mouse.move(timelineBox.x + timelineBox.width / 2, timelineBox.y + 3);
    await page.mouse.down();
    await page.mouse.move(timelineBox.x + timelineBox.width / 2, timelineBox.y + 60);
    await page.mouse.up();
    const afterPointer = Number(await timeline.getAttribute('aria-valuenow'));
    expect(afterPointer).toBeGreaterThan(Number(await timeline.getAttribute('aria-valuemin')));
    expect(afterPointer).toBeLessThan(Number(await timeline.getAttribute('aria-valuemax')));
    await timeline.focus();
    await page.keyboard.press('ArrowUp');
    expect(Number(await timeline.getAttribute('aria-valuenow'))).toBe(afterPointer + 10);
    expect(await ruler.getAttribute('aria-valuenow')).toBe(initialTime);
    expect(
      await page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime)
    ).toBe(initialVideoTime);
    await page.keyboard.press('Home');
    expect(await timeline.getAttribute('aria-valuenow')).toBe(
      await timeline.getAttribute('aria-valuemin')
    );
    await expect(page).toHaveScreenshot('workspace-compact-timeline.png', {
      fullPage: true,
      animations: 'disabled',
      mask: [page.locator('video')],
    });

    const cancelStart = Number(await inspector.getAttribute('aria-valuenow'));
    await inspector.evaluate((node) => {
      node.addEventListener(
        'pointerdown',
        (event) =>
          (node as HTMLElement).setAttribute('data-test-pointer-id', String(event.pointerId)),
        { once: true }
      );
    });
    const inspectorBounds = (await inspector.boundingBox())!;
    await page.mouse.move(inspectorBounds.x + 3, inspectorBounds.y + inspectorBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(inspectorBounds.x + 23, inspectorBounds.y + inspectorBounds.height / 2);
    await expect
      .poll(async () => Number(await inspector.getAttribute('aria-valuenow')))
      .toBe(cancelStart - 20);
    const pointerId = Number(await inspector.getAttribute('data-test-pointer-id'));
    expect(pointerId).toBeGreaterThan(0);
    await inspector.dispatchEvent('pointercancel', {
      pointerId,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: 0,
    });
    await expect(inspector).toHaveAttribute('aria-valuenow', String(cancelStart));
    await expect
      .poll(() => inspector.evaluate((node, id) => node.hasPointerCapture(id), pointerId))
      .toBe(false);
    await page.mouse.up();
    await inspector.evaluate((node) => node.removeAttribute('data-test-pointer-id'));
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    const crashAfter = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('openlightfx-studio');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction('crash', 'readonly').objectStore('crash').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return JSON.stringify(record);
    });
    expect(crashAfter).toBe(crashBefore);
    await page.keyboard.press('End');
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('openlightfx.editor.workspace.v1')!)
    );
    expect(saved).toMatchObject({ version: 1 });
    await page.reload();
    await expect(page.getByRole('separator', { name: 'Inspector width' })).toHaveAttribute(
      'aria-valuenow',
      String(saved.inspectorWidth)
    );
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Reset workspace' }).click();
    await expect(page.getByRole('separator', { name: 'Inspector width' })).toHaveAttribute(
      'aria-valuenow',
      '340'
    );
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await page.evaluate(() => localStorage.setItem('openlightfx.editor.workspace.v1', '{broken'));
    await page.reload();
    await expect(page.getByRole('separator', { name: 'Inspector width' })).toHaveAttribute(
      'aria-valuenow',
      '340'
    );
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Reset workspace' }).click();
    const leftLane = active.lane('left');
    await leftLane.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('textbox', { name: 'Keyframe time' })).toHaveValue('00:07.000');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('textbox', { name: 'Keyframe time' })).toHaveValue('00:07.300');
    await expect(page.getByRole('textbox', { name: 'Keyframe time' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Keyframe time' }).focus();
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
      'Keyframe time'
    );
    await active.exportTrack();

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflow, `document horizontal overflow at ${viewport.width}x${viewport.height}`).toBe(
        false
      );
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
      await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
      if (viewport.width === 1024)
        await expect(page).toHaveScreenshot('workspace-1024x768.png', {
          fullPage: true,
          animations: 'disabled',
          mask: [page.locator('video')],
        });
      if (viewport.width === 390) {
        await page.getByRole('textbox', { name: 'Keyframe time' }).focus();
        await expect(page.getByRole('textbox', { name: 'Keyframe time' })).toBeFocused();
        await expect(page).toHaveScreenshot('workspace-narrow.png', {
          fullPage: true,
          animations: 'disabled',
          mask: [page.locator('video')],
        });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect(page).toHaveScreenshot('workspace-reduced-motion.png', {
          fullPage: true,
          animations: 'disabled',
          mask: [page.locator('video')],
        });
      }
    }

    const browser = page.context().browser();
    if (!browser) throw new Error('Expected browser-backed context');
    for (const deviceScaleFactor of [1, 2]) {
      const context = await browser.newContext({
        baseURL:
          process.env.OLFX_STUDIO_URL ??
          `http://127.0.0.1:${process.env.OLFX_STUDIO_PREVIEW_PORT ?? '4173'}`,
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor,
      });
      try {
        const geometryPage = await context.newPage();
        await openFixtureEditor(geometryPage, { track: trackWithNeighboringKeys('LAYOUT_2_0') });
        await geometryPage.getByRole('separator', { name: 'Inspector width' }).focus();
        await geometryPage.keyboard.press('ArrowLeft');
        await geometryPage.setViewportSize({ width: 980, height: 768 });
        const activeGeometry = new ActiveEditorPage(geometryPage);
        const leftLane = activeGeometry.lane('left');
        await leftLane.focus();
        await geometryPage.keyboard.press('ArrowDown');
        await geometryPage.keyboard.press('ArrowDown');
        await expect(geometryPage.getByLabel('Keyframe time', { exact: true })).toHaveValue(
          '00:07.300'
        );
        await expect
          .poll(async () => {
            const rulerBox = (await geometryPage
              .getByRole('slider', { name: 'Timeline ruler' })
              .boundingBox())!;
            const markerBox = (await geometryPage.locator('.diamond').boundingBox())!;
            const expectedX = rulerBox.x + (7300 / 10000) * rulerBox.width;
            return Math.abs(markerBox.x + markerBox.width / 2 - expectedX);
          })
          .toBeLessThanOrEqual(1);
        expect(await geometryPage.evaluate(() => devicePixelRatio)).toBe(deviceScaleFactor);
      } finally {
        await context.close();
      }
    }
  }
);
