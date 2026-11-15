import { expect } from '@playwright/test';
import { ActiveEditorPage } from '../pages/active-editor-page';
import { openFixtureEditor } from '../harness/browser';
import {
  DOCUMENT_ONLY_MEDIA,
  TWO_HOUR_10K_DOCUMENT,
  trackWithNeighboringKeys,
} from '../fixtures/editor';
import { requirement } from '../harness/requirement';

requirement(
  'ED2-002 @browser timeline ruler and lane insertion share the visible time axis after scroll and zoom',
  async ({ page }) => {
    const backend = await openFixtureEditor(page, { empty: true });
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
    const scroll = page.locator('.timeline-scroll');
    await scroll.evaluate(
      (node) =>
        new Promise<void>((resolve) => {
          node.addEventListener('scroll', () => resolve(), { once: true });
          node.scrollLeft = 260;
          node.scrollTop = 0;
        })
    );
    const lane = page.locator('.lane').first();
    const box = (await lane.boundingBox())!;
    const x = Math.max(box.x + 20, Math.min(box.x + box.width - 20, 430));
    const rulerBox = (await ruler.boundingBox())!;
    const laneWidth = rulerBox.width;
    const durationMs = backend.track.metadata.durationMs;
    // The ruler's content origin is already translated by horizontal scrolling.
    // Adding scroll again here (as the old lane handler did) tests a double-counted axis.
    const seekExpected = Math.min(
      durationMs,
      Math.max(0, ((x - rulerBox.x) / laneWidth) * durationMs)
    );
    await page.mouse.click(x, box.y + 20);
    const exported = await new ActiveEditorPage(page).exportTrack();
    expect(exported.keyframes).toHaveLength(1);
    expect(Math.abs(exported.keyframes[0].timestampMs - seekExpected)).toBeLessThanOrEqual(42);

    const visibleRuler = await ruler.boundingBox();
    const seekX = Math.max(visibleRuler!.x, 250);
    await page.mouse.click(seekX, visibleRuler!.y + 12);
    const seekTime = ((seekX - visibleRuler!.x) / visibleRuler!.width) * durationMs;
    await expect
      .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
      .toBeCloseTo(seekTime, -1);
  }
);

requirement(
  'ED2-002 @browser two-hour dense document ruler seeks to its actual midpoint',
  async ({ page }) => {
    await openFixtureEditor(page, { track: TWO_HOUR_10K_DOCUMENT, media: DOCUMENT_ONLY_MEDIA });
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    const box = (await ruler.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect
      .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
      .toBeCloseTo(3600000, -1);
  }
);

requirement(
  'ED2-004 @browser selected marker and ruler remain aligned at device pixel ratios one and two',
  async ({ page }) => {
    const browser = page.context().browser();
    if (!browser) throw new Error('Expected a browser-backed Playwright context');
    for (const deviceScaleFactor of [1, 2]) {
      const context = await browser.newContext({
        baseURL:
          process.env.OLFX_STUDIO_URL ??
          `http://127.0.0.1:${process.env.OLFX_STUDIO_PREVIEW_PORT ?? '4173'}`,
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor,
      });
      try {
        const page = await context.newPage();
        await openFixtureEditor(page, { track: trackWithNeighboringKeys('LAYOUT_2_0') });
        const active = new ActiveEditorPage(page);
        await page.getByRole('button', { name: 'Zoom in' }).click();
        await active.selectKeyframe('left', 7300);
        expect(await page.evaluate(() => window.devicePixelRatio)).toBe(deviceScaleFactor);
        const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
        const rulerBox = (await ruler.boundingBox())!;
        const diamondBox = (await page.locator('.diamond').boundingBox())!;
        const expectedX =
          rulerBox.x + (7300 / Number(await ruler.getAttribute('aria-valuemax'))) * rulerBox.width;
        expect(Math.abs(diamondBox.x + diamondBox.width / 2 - expectedX)).toBeLessThanOrEqual(1);
        expect(
          (await active.exportTrack()).keyframes.find((frame) => frame.id === 'left-target')
            ?.timestampMs
        ).toBe(7300);
      } finally {
        await context.close();
      }
    }
  }
);

requirement(
  'ED2-002 @browser selected DOM target aligns to its canvas-authored time after viewport resize and pan',
  async ({ page }) => {
    await openFixtureEditor(page, { track: trackWithNeighboringKeys('LAYOUT_2_0') });
    const active = new ActiveEditorPage(page);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.setViewportSize({ width: 1024, height: 768 });
    await active.selectKeyframe('left', 7300);
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    const rulerBox = (await ruler.boundingBox())!;
    const laneBox = (await page.locator('.lane').first().boundingBox())!;
    const diamond = page.locator('.diamond');
    const diamondBox = (await diamond.boundingBox())!;
    const durationMs = Number(await ruler.getAttribute('aria-valuemax'));
    const expectedX = rulerBox.x + (7300 / durationMs) * rulerBox.width;
    expect(Math.abs(diamondBox.x + diamondBox.width / 2 - expectedX)).toBeLessThanOrEqual(1);
    expect(laneBox.y).toBeLessThan(diamondBox.y + diamondBox.height);
    const exported = await active.exportTrack();
    expect(exported.keyframes.find((frame) => frame.id === 'left-target')?.timestampMs).toBe(7300);
  }
);
