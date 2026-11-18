import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { decodeTrack } from '../../src/lib/domain';
import { requirement } from '../harness/requirement';
import { installBackend, openFixtureEditor, lanePoint, menu } from '../harness/browser';

const room = {
  id: 'living',
  name: 'Living Room',
  screen: { deviceId: 'tv', deviceName: 'Living Room TV', appName: 'Emby Theater' },
  bulbs: [
    { id: 'desk', position: 'left', follows: null },
    { id: 'floor', position: 'right', follows: null },
  ],
  updatedAt: '2020-01-01T00:00:00Z',
  suggestedLayout: 'LAYOUT_2_0',
};

async function installVisualFixture(page: Page, admin = true) {
  const backend = await installBackend(page, { rooms: [room], admin });
  backend.items[0].name = 'The Quiet Coast';
  backend.items[0].posterUrl = '/posters/fixture.svg';
  backend.items.push({
    itemId: '43',
    name: 'After the Rain',
    year: 2024,
    runtimeMs: 120000,
    posterUrl: '',
  });
  await page.route('**/OpenLightFX/Studio/Devices', (route) =>
    route.fulfill({ json: [{ deviceId: 'tv', name: 'Living Room TV', appName: 'Emby Theater' }] })
  );
  await page.route('**/OpenLightFX/Studio/Bulbs', (route) =>
    route.fulfill({
      json: [
        {
          id: 'desk',
          name: 'Desk lamp',
          isNamed: true,
          protocol: 'WiZ',
          model: 'A19 Color',
          ipAddress: '192.0.2.10',
          roomId: 'living',
        },
        {
          id: 'floor',
          name: 'Floor lamp',
          isNamed: true,
          protocol: 'LIFX',
          model: 'Color',
          ipAddress: '192.0.2.11',
          roomId: 'living',
        },
        {
          id: 'shelf',
          name: '',
          isNamed: false,
          protocol: 'Govee',
          model: 'Light strip',
          ipAddress: '192.0.2.12',
          roomId: null,
        },
        {
          id: 'reading',
          name: 'Reading light',
          isNamed: true,
          protocol: 'WiZ',
          model: 'A19 Color',
          roomId: null,
        },
      ],
    })
  );
  return backend;
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflows = await page.evaluate(() => {
    const nodes = [
      document.documentElement,
      ...document.querySelectorAll('.studio-page, .workspace, .menubar, .inspector'),
    ];
    return nodes
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => node.className || node.tagName);
  });
  expect(overflows).toEqual([]);
}

for (const screen of ['bulbs', 'rooms', 'library', 'movie/42']) {
  requirement(
    `SHELL-004 @browser ${screen} uses the shared Emby-aligned foundation`,
    async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 1000 });
      await installVisualFixture(page);
      await page.goto(`/emby/OpenLightFX/studio/?api_key=browser-test#/${screen}`);
      if (screen === 'bulbs')
        await expect(page.getByRole('heading', { name: 'Your bulbs' })).toBeVisible();
      if (screen === 'rooms')
        await expect(page.getByLabel('Room name', { exact: true })).toHaveValue('Living Room');
      if (screen === 'library')
        await expect(page.getByRole('link', { name: 'The Quiet Coast, 2020' })).toBeVisible();
      if (screen === 'movie/42') {
        await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Delete Proxy Fixture' })).toBeVisible();
      }
      await expect(page.locator('nav [aria-current="page"]')).toHaveCount(1);
      await assertNoHorizontalOverflow(page);
      await expect(page).toHaveScreenshot(`foundation-${screen.replace('/', '-')}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    }
  );
}

requirement(
  'ED2-003 @browser SHELL-004 editor selection menus and dialogs share the neutral foundation',
  async ({ page }) => {
    await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.3);
    await expect(page.getByLabel('Hex', { exact: true })).toHaveValue('ff0000');
    await expect(page.getByLabel('Keyframe time', { exact: true })).toHaveValue('00:03.000');
    await expect(page.getByLabel('RGB color')).toBeVisible();
    await expect(page.getByLabel('R', { exact: true })).toHaveValue('255');
    await expect(page.getByLabel('G', { exact: true })).toHaveValue('0');
    await expect(page.getByLabel('B', { exact: true })).toHaveValue('0');
    await expect(page).toHaveScreenshot('foundation-keyframe.png', {
      animations: 'disabled',
      mask: [page.locator('video')],
    });
    await page.getByRole('button', { name: 'File', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: /Export/ }).click();
    const file = await download;
    expect(decodeTrack(fs.readFileSync((await file.path())!)).keyframes).toContainEqual(
      expect.objectContaining({
        timestampMs: 3000,
        color: { r: 255, g: 0, b: 0 },
      })
    );
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page).toHaveScreenshot('foundation-file-menu.png', {
      animations: 'disabled',
      mask: [page.locator('video')],
    });
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await menu(page, 'Edit', 'Track settings');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveScreenshot('foundation-settings.png', {
      animations: 'disabled',
      mask: [page.locator('video')],
    });
  }
);

requirement(
  'SHELL-004 @browser bulb read-only and error states use the shared foundation',
  async ({ page }) => {
    await installVisualFixture(page, false);
    await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/bulbs');
    await expect(page.getByRole('button', { name: 'Find bulbs', exact: true })).toBeDisabled();
    await expect(page.getByRole('status')).toContainText('Only an Emby administrator');
    await expect(page).toHaveScreenshot('foundation-readonly.png', {
      fullPage: true,
      animations: 'disabled',
    });
    await page.route('**/OpenLightFX/Studio/Items?*', (route) =>
      route.fulfill({ status: 503, json: { message: 'Server unavailable' } })
    );
    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveScreenshot('foundation-error.png', { animations: 'disabled' });
  }
);

for (const screen of ['bulbs', 'rooms', 'library', 'movie/42', 'edit/42/proxy-fixture']) {
  requirement(`SHELL-003 @browser ${screen} remains usable at narrow widths`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installVisualFixture(page);
    await page.goto(`/emby/OpenLightFX/studio/?api_key=browser-test#/${screen}`);
    if (screen.startsWith('edit/')) {
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeInViewport();
      for (const name of ['Zoom out', 'Zoom in', 'Fit movie', 'Fit selection', 'Frame detail']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeInViewport();
      }
    } else {
      await expect(page.locator('nav [aria-current="page"]')).toBeVisible();
      if (screen === 'rooms')
        await expect(page.getByLabel('Room name', { exact: true })).toHaveValue('Living Room');
      if (screen === 'bulbs')
        await expect(page.getByRole('heading', { name: 'Your bulbs' })).toBeVisible();
      if (screen === 'library')
        await expect(page.getByRole('link', { name: 'The Quiet Coast, 2020' })).toBeVisible();
      if (screen === 'movie/42') {
        await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Delete Proxy Fixture' })).toBeInViewport();
      }
    }
    await assertNoHorizontalOverflow(page);
    await expect(page).toHaveScreenshot(`narrow-${screen.replaceAll('/', '-')}.png`, {
      animations: 'disabled',
      mask: [page.locator('video')],
    });
  });
}

requirement(
  'SHELL-004 @browser shared controls preserve contrast keyboard focus and reduced motion',
  async ({ page }) => {
    await installVisualFixture(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/bulbs');
    const action = page.getByRole('button', { name: 'Find bulbs', exact: true });
    await expect(action).toBeEnabled();
    await page.keyboard.press('Tab');
    await action.focus();
    const appearance = await action.evaluate((node) => {
      const style = getComputedStyle(node);
      function luminance(color: string) {
        const [r, g, b] = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map((value) => {
            const c = Number(value) / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      const a = luminance(style.color);
      const b = luminance(style.backgroundColor);
      return {
        contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        background: style.backgroundColor,
        outline: style.outlineStyle,
        duration: parseFloat(style.transitionDuration),
        focused: node.matches(':focus-visible'),
      };
    });
    expect(appearance.background).not.toContain('rgba');
    expect(appearance.contrast).toBeGreaterThanOrEqual(4.5);
    expect(appearance.outline).toBe('solid');
    expect(appearance.focused).toBe(true);
    expect(appearance.duration).toBeLessThan(0.001);
  }
);
