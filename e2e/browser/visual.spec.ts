import { expect } from '@playwright/test';
import { requirement } from '../harness/requirement';
import { installJ1Backend, openFixtureEditor } from '../harness/j1-browser';

requirement(
  'FLOW-001 @browser first run visually explains room setup and the no-lights authoring path',
  async ({ page }) => {
    await installJ1Backend(page);
    await page.route('**/OpenLightFX/Studio/Devices', (route) =>
      route.fulfill({ json: [{ deviceId: 'tv', name: 'Living room TV', appName: 'Emby Theater' }] })
    );
    await page.route('**/OpenLightFX/Studio/Bulbs', (route) => route.fulfill({ json: [] }));
    await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test');
    await expect(page).toHaveURL(/#\/rooms$/);
    await expect(page.getByRole('heading', { name: 'Welcome to OpenLightFX' })).toBeVisible();
    await expect(page.getByLabel('Room name')).toBeVisible();
    await expect(page.getByRole('option', { name: 'Living room TV · Emby Theater' })).toHaveCount(
      1
    );
    await expect(
      page.getByRole('button', { name: 'Skip — write a track without lights' })
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page).toHaveScreenshot('first-room.png', {
      maxDiffPixelRatio: 0.03,
      animations: 'disabled',
    });
  }
);

requirement(
  'EDIT-001 @browser an open movie visually retains the named track transport inspector and only one scrubber',
  async ({ page }) => {
    await openFixtureEditor(page);
    await expect(page.getByRole('textbox', { name: 'Track title' })).toHaveValue('Proxy Fixture');
    await expect(page.getByRole('button', { name: 'File', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveAttribute(
      'aria-valuemax',
      '10000'
    );
    await expect(page.getByRole('slider')).toHaveCount(2); // ruler plus channel-default brightness, not a second seek bar
    await expect(
      page.getByRole('button', { name: /^Left timeline lane, 2 keyframes/ })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Right timeline lane, 2 keyframes/ })
    ).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Set up a room to preview on your lights.' })
    ).toBeVisible();
    await expect(page).toHaveScreenshot('j1-editor.png', {
      maxDiffPixelRatio: 0.03,
      animations: 'disabled',
      mask: [page.locator('video')],
    });
  }
);
