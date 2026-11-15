import { expect } from '@playwright/test';
import { openFixtureEditor } from '../harness/browser';
import {
  TWO_HOUR_10K_DOCUMENT,
  DOCUMENT_ONLY_MEDIA,
  trackWithNeighboringKeys,
} from '../fixtures/editor';
import { requirement } from '../harness/requirement';

requirement(
  'ED2-008 @browser adaptive ruler ticks stay bounded, readable and viewport aligned',
  async ({ page }) => {
    await openFixtureEditor(page, { track: trackWithNeighboringKeys('LAYOUT_5_0') });
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.setViewportSize({ width: 1024, height: 768 });
    const scroll = page.locator('.timeline-scroll');
    await scroll.evaluate(
      (element) =>
        new Promise<void>((resolve) => {
          element.addEventListener('scroll', () => resolve(), { once: true });
          element.scrollLeft = 80;
        })
    );

    const labels = page.locator('.tick.major').filter({ hasText: /\S/ });
    const boxes = await labels.evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const text = element.firstChild?.textContent ?? '';
          const range = document.createRange();
          range.selectNodeContents(element);
          const textRect = range.getBoundingClientRect();
          return { x: textRect.left, right: textRect.right, text, y: rect.y };
        })
        .sort((a, b) => a.x - b.x)
    );
    for (let index = 1; index < boxes.length; index++) {
      expect(boxes[index].x - boxes[index - 1].right).toBeGreaterThanOrEqual(8);
    }
    expect(await page.getByRole('slider', { name: 'Timeline ruler' }).count()).toBe(1);
    expect(await page.locator('.tick').count()).toBeLessThan(1000);
    const rulerBox = (await ruler.boundingBox())!;
    const firstLane = (await page.locator('.lane').first().boundingBox())!;
    const lastLane = (await page.locator('.lane').last().boundingBox())!;
    const line = page.locator('.playhead');
    await ruler.click({ position: { x: rulerBox.width * 0.35, y: 15 } });
    const lineBox = (await line.boundingBox())!;
    expect(Math.abs(lineBox.y - rulerBox.y)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(lineBox.y + lineBox.height - (lastLane.y + lastLane.height))
    ).toBeLessThanOrEqual(1);
    expect(lineBox.x).toBeGreaterThanOrEqual(rulerBox.x - 1);
    expect(lineBox.x).toBeLessThan(rulerBox.x + rulerBox.width + 1);
    expect(firstLane.y).toBeGreaterThan(rulerBox.y);
    await expect(page).toHaveScreenshot('editor-ruler-adaptive.png');
  }
);

requirement(
  'ED2-008 @browser long document renders only viewport ticks and hour-bearing labels',
  async ({ page }) => {
    await openFixtureEditor(page, { track: TWO_HOUR_10K_DOCUMENT, media: DOCUMENT_ONLY_MEDIA });
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    await ruler.click({ position: { x: (await ruler.boundingBox())!.width * 0.5, y: 15 } });
    await expect
      .poll(() =>
        page
          .locator('.tick.major')
          .filter({ hasText: /\d+:\d{2}:\d{2}/ })
          .count()
      )
      .toBeGreaterThan(0);
    expect(await page.locator('.tick').count()).toBeLessThan(1000);
    await expect(page).toHaveScreenshot('editor-ruler-long-document.png');
  }
);
