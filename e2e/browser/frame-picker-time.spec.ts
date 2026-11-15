import { expect, type Page } from '@playwright/test';
import { requirement } from '../harness/requirement';
import { installJ1Backend, openFixtureEditor } from '../harness/j1-browser';

async function prepare(page: Page) {
  await openFixtureEditor(page);
  const lane = page.getByRole('button', { name: /^Left timeline lane/ });
  const box = (await lane.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.1, box.y + 19);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 1, 1);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(png, 'base64');
}
async function seek(page: Page, fraction: number) {
  const box = (await page.getByRole('slider', { name: 'Timeline ruler' }).boundingBox())!;
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
}

requirement(
  'PROP-004 @browser a forward scrub invalidates a source frame still loading at the previous position',
  async ({ page }) => {
    const png = await prepare(page);
    let release!: () => void;
    let finish!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const completed = new Promise<void>((resolve) => (finish = resolve));
    await page.route('**/OpenLightFX/Studio/Items/42/Frame?*', async (route) => {
      await held;
      // The old fetch is deliberately aborted by navigation.
      await route.fulfill({ contentType: 'image/png', body: png }).catch(() => {});
      finish();
    });
    await seek(page, 0.3);
    const request = page.waitForRequest((request) => request.url().includes('/Frame?'));
    await page.getByRole('button', { name: 'Pick color from movie' }).click();
    const requested = new URL((await request).url()).searchParams.get('timeMs');
    const nativeTime = await page
      .locator('video')
      .evaluate((node) => (node as HTMLVideoElement).currentTime * 1000);
    expect(Math.abs(Number(requested) - nativeTime)).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(requested) - 3000)).toBeLessThanOrEqual(42);
    await seek(page, 0.7);
    release();
    await completed;
    // Let the old request finish: it must not cover the newly scrubbed movie.
    await expect(page.getByText('Loading source frame…')).toHaveCount(0);
    await expect(page.getByAltText('Source frame')).toHaveCount(0);
  }
);

requirement(
  'PROP-004 @browser forward navigation closes an old picked frame and the next pick requests the new position',
  async ({ page }) => {
    const png = await prepare(page);
    await page.route('**/OpenLightFX/Studio/Items/42/Frame?*', (route) =>
      route.fulfill({ contentType: 'image/png', body: png })
    );
    await seek(page, 0.3);
    await page.getByRole('button', { name: 'Pick color from movie' }).click();
    await expect(page.getByAltText('Source frame')).toBeVisible();
    await page.getByRole('button', { name: 'Skip forward 5 seconds' }).click();
    await expect(page.getByAltText('Source frame')).toHaveCount(0);
    const request = page.waitForRequest((request) => request.url().includes('/Frame?'));
    await page.getByRole('button', { name: 'Pick color from movie' }).click();
    const requested = new URL((await request).url()).searchParams.get('timeMs');
    const nativeTime = await page
      .locator('video')
      .evaluate((node) => (node as HTMLVideoElement).currentTime * 1000);
    expect(Math.abs(Number(requested) - nativeTime)).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(requested) - 8000)).toBeLessThanOrEqual(42);
    await expect(page.getByAltText('Source frame')).toBeVisible();
  }
);

requirement(
  'PROP-004 @browser a queued future seek does not block picking the movie frame currently displayed',
  async ({ page }) => {
    const backend = await installJ1Backend(page);
    backend.media.proxy.state = 'building';
    backend.media.proxy.encodedThroughMs = 1000;
    let frameTime = -1;
    await page.route('**/OpenLightFX/Studio/Items/42/Frame?*', (route) => {
      frameTime = Number(new URL(route.request().url()).searchParams.get('timeMs'));
      return route.fulfill({ status: 500 });
    });
    await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/edit/42/proxy-fixture');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    const lane = (await page.getByRole('button', { name: /^Left timeline lane/ }).boundingBox())!;
    await page.mouse.click(lane.x + lane.width * 0.1, lane.y + 19);
    await seek(page, 0.7);
    const picker = page.getByRole('button', { name: 'Pick color from movie' });
    await expect(picker).toBeEnabled();
    await picker.click();
    await expect.poll(() => frameTime).toBe(0);
    await expect(page.getByRole('alert')).toContainText('The frame could not be sampled');
    await expect(picker).toBeEnabled();
    backend.media.proxy.state = 'ready';
    backend.media.proxy.encodedThroughMs = 10000;
    await expect(picker).toBeEnabled();
    await expect
      .poll(async () =>
        Math.abs(
          (await page
            .locator('video')
            .evaluate((node) => (node as HTMLVideoElement).currentTime * 1000)) - 7000
        )
      )
      .toBeLessThanOrEqual(42);
  }
);

requirement(
  'PROP-004 @browser a completed adjusted seek reconciles the paused position and does not leave the picker blocked',
  async ({ page }) => {
    const png = await prepare(page);
    await page.locator('video').evaluate((node) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLMediaElement.prototype,
        'currentTime'
      )!;
      Object.defineProperty(node, 'currentTime', {
        get() {
          return descriptor.get!.call(this);
        },
        set(seconds) {
          descriptor.set!.call(this, Math.min(seconds, 2.75));
        },
      });
    });
    await seek(page, 0.3);
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveAttribute(
      'aria-valuenow',
      '2750'
    );
    await expect
      .poll(() => page.locator('video').evaluate((node) => (node as HTMLVideoElement).seeking))
      .toBe(false);
    await page.route('**/OpenLightFX/Studio/Items/42/Frame?*', (route) =>
      route.fulfill({ contentType: 'image/png', body: png })
    );
    const request = page.waitForRequest((request) => request.url().includes('/Frame?'));
    await page.getByRole('button', { name: 'Pick color from movie' }).click();
    expect(new URL((await request).url()).searchParams.get('timeMs')).toBe('2750');
    await expect(page.getByAltText('Source frame')).toBeVisible();
  }
);

requirement(
  'PROP-004 @browser paused native time updates are used for picking rather than a stale playhead',
  async ({ page }) => {
    const png = await prepare(page);
    await page.locator('video').evaluate((node) => {
      (node as HTMLVideoElement).currentTime = 4.123;
    });
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveAttribute(
      'aria-valuenow',
      '4123'
    );
    await page.route('**/OpenLightFX/Studio/Items/42/Frame?*', (route) =>
      route.fulfill({ contentType: 'image/png', body: png })
    );
    const request = page.waitForRequest((request) => request.url().includes('/Frame?'));
    await page.getByRole('button', { name: 'Pick color from movie' }).click();
    expect(new URL((await request).url()).searchParams.get('timeMs')).toBe('4123');
    await expect(page.getByAltText('Source frame')).toBeVisible();
  }
);
