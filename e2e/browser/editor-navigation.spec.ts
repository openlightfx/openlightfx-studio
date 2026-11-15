import { expect } from '@playwright/test';
import { requirement } from '../harness/requirement';
import { openFixtureEditor } from '../harness/browser';

requirement(
  'ED2-010 @browser real short-proxy playback respects pan, Reveal resumes follow, and explicit Follow off persists',
  async ({ page }) => {
    await openFixtureEditor(page);
    for (let i = 0; i < 8; i++)
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const viewport = page.locator('.timeline-scroll');
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
      .toBeGreaterThan(200);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    const box = (await viewport.boundingBox())!;
    await page.mouse.move(box.x + box.width - 80, box.y + 80);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box.x + box.width - 180, box.y + 80);
    await page.mouse.up({ button: 'middle' });
    const pannedScroll = await viewport.evaluate((el) => el.scrollLeft);
    const pannedPlayhead = Number(await ruler.getAttribute('aria-valuenow'));
    expect(pannedScroll).toBeGreaterThan(0);
    await expect
      .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
      .toBeGreaterThan(pannedPlayhead + 100);
    expect(await viewport.evaluate((el) => el.scrollLeft)).toBe(pannedScroll);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(pannedScroll);

    await page.getByRole('button', { name: 'Reveal playhead' }).click();
    await expect(page.getByRole('button', { name: 'Follow playhead' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const playheadBox = (await page.locator('.playhead').boundingBox())!;
    const viewportBox = (await viewport.boundingBox())!;
    expect(playheadBox.x).toBeGreaterThanOrEqual(viewportBox.x);
    expect(playheadBox.x).toBeLessThan(viewportBox.x + viewportBox.width);

    await page.getByRole('button', { name: 'Follow playhead' }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Follow playhead' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    const offScroll = await viewport.evaluate((el) => el.scrollLeft);
    const offTime = Number(await ruler.getAttribute('aria-valuenow'));
    await expect
      .poll(async () => Number(await ruler.getAttribute('aria-valuenow')))
      .toBeGreaterThan(offTime + 100);
    expect(await viewport.evaluate((el) => el.scrollLeft)).toBe(offScroll);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  }
);

requirement(
  'ED2-010 @browser middle-button pan and Shift-wheel preserve timeline alignment',
  async ({ page }) => {
    await openFixtureEditor(page, { layout: 'LAYOUT_5_0' });
    for (let i = 0; i < 8; i++)
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const viewport = page.locator('.timeline-scroll');
    const axis = page.getByRole('slider', { name: 'Timeline ruler' });
    const headers = page.locator('.lane-header');
    const headerXs = await headers.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().x)
    );
    const axisBefore = (await axis.boundingBox())!.x;
    const box = (await viewport.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 80);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box.x + box.width / 2 - 160, box.y + 80);
    await page.mouse.up({ button: 'middle' });
    await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    const scroll = await viewport.evaluate((el) => el.scrollLeft);
    expect(Math.abs((await axis.boundingBox())!.x - (axisBefore - scroll))).toBeLessThanOrEqual(1);
    expect(
      await headers.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().x))
    ).toEqual(headerXs);

    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 120);
    await page.keyboard.up('Shift');
    await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(scroll);
    const follow = page.getByRole('button', { name: 'Follow playhead' });
    await expect(follow).toHaveAttribute('aria-pressed', 'true');
    await follow.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Reveal playhead' })).toBeFocused();
    await page.mouse.move(box.x + box.width / 2, box.y + 80);
    await page.mouse.down({ button: 'middle' });
    await page.keyboard.press('Escape');
    const stoppedAt = await viewport.evaluate((el) => el.scrollLeft);
    await page.mouse.move(box.x + box.width / 2 - 100, box.y + 80);
    expect(await viewport.evaluate((el) => el.scrollLeft)).toBe(stoppedAt);
    await page.mouse.up({ button: 'middle' });

    await page.mouse.move(box.x + box.width / 2, box.y + 80);
    await page.mouse.down({ button: 'middle' });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const blurredAt = await viewport.evaluate((el) => el.scrollLeft);
    await page.mouse.move(box.x + box.width / 2 - 100, box.y + 80);
    expect(await viewport.evaluate((el) => el.scrollLeft)).toBe(blurredAt);
    await page.mouse.up({ button: 'middle' });
  }
);

requirement(
  'ED2-010 @browser Follow, Reveal, and Fit remain reachable at 390px with pinned lane alignment',
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixtureEditor(page, { layout: 'LAYOUT_5_0' });
    for (let i = 0; i < 8; i++)
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const fit = page.getByRole('button', { name: 'Fit movie' });
    const follow = page.getByRole('button', { name: 'Follow playhead' });
    const reveal = page.getByRole('button', { name: 'Reveal playhead' });
    for (const control of [fit, follow, reveal]) {
      await expect(control).toBeVisible();
      const bounds = (await control.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    const viewport = page.locator('.timeline-scroll');
    const headers = page.locator('.lane-header');
    const before = await headers.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().x)
    );
    await viewport.evaluate((node) => (node.scrollLeft = 200));
    await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBe(200);
    const after = await headers.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().x)
    );
    expect(after.every((x, index) => Math.abs(x - before[index]) <= 1)).toBe(true);
    await expect(fit).toBeVisible();
    await expect(follow).toBeVisible();
    await expect(reveal).toBeVisible();
  }
);
