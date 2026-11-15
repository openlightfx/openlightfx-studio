import { expect } from '@playwright/test';
import { requirement } from '../harness/requirement';
import { openFixtureEditor } from '../harness/browser';

for (const width of [1280, 390]) {
  requirement(
    `TIME-003 @browser EDIT-004 lane labels and controls stay pinned while panning at ${width}px`,
    async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await openFixtureEditor(page, { layout: 'LAYOUT_5_0' });
      for (let i = 0; i < 8; i++)
        await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      const viewport = page.locator('.timeline-scroll');
      const headers = page.locator('.lane-header');
      await expect(headers).toHaveCount(5);
      const before = await headers.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().x)
      );
      const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
      const rulerBefore = (await ruler.boundingBox())!.x;
      await viewport.evaluate((node) => (node.scrollLeft = 400));
      await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBe(400);
      await expect.poll(async () => (await ruler.boundingBox())!.x).toBe(rulerBefore - 400);
      expect(
        await headers.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().x))
      ).toEqual(before);

      await expect(page.locator('.timeline')).toHaveScreenshot(`sticky-labels-${width}.png`, {
        animations: 'disabled',
      });
      await viewport.evaluate((node) => (node.scrollLeft = node.scrollWidth - node.clientWidth));
      await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(400);
      expect(
        await headers.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().x))
      ).toEqual(before);
      await viewport.evaluate((node) => (node.scrollLeft = 400));
      await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBe(400);

      // Hit testing proves the opaque pinned labels sit above scrolled lane content,
      // not merely that the labels still have coordinates inside the viewport.
      const right = headers.filter({
        has: page.getByRole('button', { name: 'Right', exact: true }),
      });
      const name = right.locator('.lane-name');
      const bounds = (await name.boundingBox())!;
      expect(
        await page.evaluate(
          ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.lane-header')),
          { x: bounds.x + 8, y: bounds.y + bounds.height / 2 }
        )
      ).toBe(true);
      await name.click();
      await expect(
        page
          .getByRole('complementary', { name: 'Inspector' })
          .getByRole('heading', { name: 'Right', exact: true })
      ).toBeVisible();
      for (const action of ['Solo Right', 'Mute Right']) {
        const control = right.getByRole('button', { name: action, exact: true });
        await control.click();
        await expect(control).toHaveAttribute('aria-pressed', 'true');
      }
      const counts = await page
        .locator('.lane-canvas')
        .evaluateAll((nodes) =>
          nodes.reduce((sum, node) => sum + Number((node as HTMLElement).dataset.keyframeCount), 0)
        );
      expect(counts).toBe(4);

      // The unpinned time axis must retain its true scrolled coordinates for seeking.
      const view = (await viewport.boundingBox())!;
      const header = (await headers.first().boundingBox())!;
      const axis = (await ruler.boundingBox())!;
      const x = view.x + header.width + 70;
      await page.mouse.click(x, axis.y + axis.height / 2);
      const expected = ((x - axis.x) / axis.width) * 10000;
      await expect
        .poll(async () => Math.abs(Number(await ruler.getAttribute('aria-valuenow')) - expected))
        .toBeLessThanOrEqual(42);
    }
  );
}
