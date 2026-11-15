import { expect } from '@playwright/test';
import { ActiveEditorPage } from '../pages/active-editor-page';
import { installBackend, openFixtureEditor } from '../harness/browser';
import { requirement } from '../harness/requirement';

const livingRoom = {
  id: 'living',
  name: 'Living Room',
  screen: { deviceId: 'tv-living', deviceName: 'Living Room TV', appName: 'Emby Theater' },
  bulbs: [
    { id: 'lamp-left', position: 'left', follows: null },
    { id: 'lamp-right', position: 'right', follows: null },
  ],
  updatedAt: '2020-01-01T00:00:00Z',
  suggestedLayout: 'LAYOUT_2_0',
};
const bedroom = {
  ...livingRoom,
  id: 'bedroom',
  name: 'Bedroom',
  screen: { deviceId: 'tv-bedroom', deviceName: 'Bedroom TV', appName: 'Emby Theater' },
};

async function snapshot(page: import('@playwright/test').Page, name: string) {
  await expect(page).toHaveScreenshot(`ed2-025-${name}.png`, {
    animations: 'disabled',
    mask: [page.locator('video')],
  });
}

requirement(
  'ED2-025 @browser visual overlay preference is independent of track history and physical preview',
  async ({ page }) => {
    const backend = await openFixtureEditor(page, { rooms: [livingRoom] });
    await expect(page.getByText('Preview off · Living Room')).toBeVisible();
    const overlay = page.getByRole('button', { name: 'Overlay on' });
    const regions = page.locator('.video-stage .region');
    await expect(overlay).toBeEnabled();
    await overlay.focus();
    await expect(overlay).toBeFocused();
    await snapshot(page, 'overlay-on');
    const originalExport = await new ActiveEditorPage(page).exportTrack();

    const beforeRgb = await regions.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-overlay-rgb'))
    );
    await overlay.click();
    await expect(page.getByRole('button', { name: 'Overlay off' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await expect(regions.first()).toBeHidden();
    expect(
      await regions.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-overlay-rgb'))
      )
    ).toEqual(beforeRgb);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(await new ActiveEditorPage(page).exportTrack()).toEqual(originalExport);
    await snapshot(page, 'overlay-off');

    await page.keyboard.press('v');
    await expect(page.getByRole('button', { name: 'Overlay on' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const title = page.getByLabel('Track title');
    const titleValue = await title.inputValue();
    await title.focus();
    // Native paste may insert the OS clipboard (another browser test can populate it).
    // Assert scope without assuming an empty desktop clipboard, then restore the field.
    await title.evaluate((node) => {
      const listener = (event: KeyboardEvent) => {
        if (event.ctrlKey && event.key.toLowerCase() === 'v') {
          node.setAttribute('data-native-paste-prevented', String(event.defaultPrevented));
          window.removeEventListener('keydown', listener);
        }
      };
      window.addEventListener('keydown', listener);
    });
    await page.keyboard.press('Control+v');
    await expect(title).toHaveAttribute('data-native-paste-prevented', 'false');
    await title.fill(titleValue);
    await expect(page.getByRole('button', { name: 'Overlay on' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(title).toHaveValue(titleValue);
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(backend.previewStarts).toHaveLength(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Overlay on' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByText('Preview off · Living Room')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toBeEnabled();

    await page.getByRole('switch', { name: 'Lights', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Lights on', exact: true })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect.poll(() => backend.previewFrames.length).toBeGreaterThan(0);
    const frameCount = backend.previewFrames.length;
    await page.getByRole('button', { name: 'Solo Left', exact: true }).click();
    await expect
      .poll(
        () =>
          backend.previewFrames.at(-1)?.states.find((state: any) => state.channelId === 'right')
            ?.brightness
      )
      .toBe(0);
    const mutedFrame = backend.previewFrames.at(-1);
    await page.getByRole('button', { name: 'Overlay on' }).click();
    await expect(page.getByRole('button', { name: 'Overlay off' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await expect(page.getByRole('switch', { name: 'Lights on', exact: true })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(backend.previewStarts).toHaveLength(1);
    expect(backend.previewFrames.at(-1)).toEqual(mutedFrame);
    expect(backend.previewFrames.length).toBeGreaterThanOrEqual(frameCount);
    expect(await new ActiveEditorPage(page).exportTrack()).toEqual(originalExport);
    await page.getByRole('switch', { name: 'Lights on', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  }
);

requirement(
  'ED2-025 @browser room loading and out-of-order routing preserve only the current selected room',
  async ({ page }) => {
    const backend = await installBackend(page, { rooms: [livingRoom, bedroom] });
    let releaseLiving!: () => void;
    const livingGate = new Promise<void>((resolve) => (releaseLiving = resolve));
    await page.route('**/OpenLightFX/Studio/Rooms/*/Routing', async (route) => {
      const roomId = new URL(route.request().url()).pathname.split('/').at(-2);
      if (roomId === 'living') await livingGate;
      const requested = route.request().postDataJSON().channels as { id: string }[];
      await route.fulfill({
        json: {
          channels: requested.map((channel) => ({
            channelId: channel.id,
            position: null,
            bulbIds: [],
            foldedInto: [],
          })),
          bulbs: [],
        },
      });
    });
    await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/edit/42/proxy-fixture');
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
    await expect(page.getByText('Loading room routing…')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toBeDisabled();
    await snapshot(page, 'routing-loading');

    await page.getByLabel('Preview room').selectOption('bedroom');
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toBeEnabled();
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('olfx-preview-room')))
      .toBe('bedroom');
    releaseLiving();
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('olfx-preview-room')))
      .toBe('bedroom');
    await expect(page.getByText('Preview off · Bedroom')).toBeVisible();
    expect(backend.previewStarts).toHaveLength(0);
  }
);

requirement(
  'ED2-025 @browser no-room and viewer preview controls explain access while overlay remains available',
  async ({ page }) => {
    await openFixtureEditor(page, { rooms: [] });
    await expect(page.getByText('Preview unavailable: set up a room')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toBeDisabled();
    await expect(page.getByText('Set up a room first').last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Overlay on' })).toBeEnabled();
    await snapshot(page, 'no-room');

    await openFixtureEditor(page, { rooms: [livingRoom], admin: false });
    await expect(
      page.getByText('Preview unavailable: administrator access required')
    ).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toBeDisabled();
    await expect(page.getByText('Only an Emby administrator can preview on lights')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Overlay on' })).toBeEnabled();
    await page.getByRole('button', { name: 'Overlay on' }).focus();
    await expect(page.getByRole('button', { name: 'Overlay on' })).toBeFocused();
    await snapshot(page, 'viewer');
  }
);

requirement(
  'ED2-025 @browser routing and playback ownership errors stay visible and cancel without takeover',
  async ({ page }) => {
    await installBackend(page, { rooms: [livingRoom] });
    await page.route('**/OpenLightFX/Studio/Rooms/*/Routing', (route) =>
      route.fulfill({ status: 503, json: { message: 'Routing unavailable' } })
    );
    await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/edit/42/proxy-fixture');
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
    await expect(page.getByRole('alert').last()).toContainText('Routing unavailable');
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toBeDisabled();
    await expect(page.getByText('Routing unavailable').last()).toBeVisible();
    await snapshot(page, 'routing-error');

    const backend = await openFixtureEditor(page, { rooms: [livingRoom] });
    let starts = 0;
    const takeoverRequests: boolean[] = [];
    await page.route('**/OpenLightFX/Studio/Preview/Start', (route) => {
      starts++;
      takeoverRequests.push(Boolean(route.request().postDataJSON().takeover));
      return route.fulfill({ status: 409, json: { message: 'playback_active' } });
    });
    page.on('dialog', (dialog) => dialog.dismiss());
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toBeEnabled();
    await page.getByRole('switch', { name: 'Lights', exact: true }).click();
    await expect(page.locator('#preview-status')).toContainText(
      'Preview cancelled; Emby playback owns the lights'
    );
    await expect(page.getByRole('alert')).toContainText(
      'Preview cancelled. Emby playback still owns the lights.'
    );
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(starts).toBe(1);
    expect(takeoverRequests).toEqual([false]);
    expect(backend.previewFrames).toHaveLength(0);
    await snapshot(page, 'playback-owned');
  }
);

requirement(
  'ED2-025 @browser delayed start and frame lifecycle drains before final off intent and navigation cleanup',
  async ({ page }) => {
    await openFixtureEditor(page, { rooms: [livingRoom, bedroom] });
    const events: string[] = [];
    let serverRoom = '';
    let releaseStart!: () => void;
    const startGate = new Promise<void>((resolve) => (releaseStart = resolve));
    let releaseFrame!: () => void;
    let signalFrameStarted!: () => void;
    const frameGate = new Promise<void>((resolve) => (releaseFrame = resolve));
    const frameStarted = new Promise<void>((resolve) => (signalFrameStarted = resolve));
    let blockNextFrame = false;
    await page.route('**/OpenLightFX/Studio/Preview/Start', async (route) => {
      const roomId = route.request().postDataJSON().roomId as string;
      events.push(`start-request:${roomId}`);
      if (roomId === 'living') await startGate;
      serverRoom = roomId;
      events.push(`start-active:${roomId}`);
      await route.fulfill({ json: { active: true } });
    });
    await page.route('**/OpenLightFX/Studio/Preview/Frame', async (route) => {
      events.push(`frame:${serverRoom}`);
      if (blockNextFrame) {
        blockNextFrame = false;
        signalFrameStarted();
        await frameGate;
      }
      await route.fulfill({ json: { active: true } });
    });
    await page.route('**/OpenLightFX/Studio/Preview/Stop', async (route) => {
      events.push(`stop:${serverRoom}`);
      serverRoom = '';
      await route.fulfill({ json: { active: false } });
    });

    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toBeEnabled();
    await page.getByRole('switch', { name: 'Lights', exact: true }).click();
    await expect(page.locator('#preview-status')).toContainText('Preview starting in Living Room');
    await page.getByRole('switch', { name: 'Lights on', exact: true }).click();
    await expect(page.locator('#preview-status')).toContainText('Stopping room preview');
    releaseStart();
    await expect(page.locator('#preview-status')).toContainText('Preview off · Living Room');
    expect(serverRoom).toBe('');
    expect(events).toEqual(['start-request:living', 'start-active:living', 'stop:living']);

    blockNextFrame = true;
    await page.getByRole('switch', { name: 'Lights', exact: true }).click();
    await expect(page.locator('#preview-status')).toContainText('Preview on in Living Room');
    await frameStarted;
    const stopsBeforeDrain = events.filter((event) => event.startsWith('stop:')).length;
    await page.getByRole('switch', { name: 'Lights on', exact: true }).click();
    await expect(page.locator('#preview-status')).toContainText('Stopping room preview');
    expect(events.filter((event) => event.startsWith('stop:')).length).toBe(stopsBeforeDrain);
    releaseFrame();
    await expect(page.locator('#preview-status')).toContainText('Preview off · Living Room');
    expect(events.at(-1)).toBe('stop:living');

    await page.getByRole('switch', { name: 'Lights', exact: true }).click();
    await expect(page.locator('#preview-status')).toContainText('Preview on in Living Room');
    await page.getByLabel('Preview room').selectOption('bedroom');
    await expect(page.locator('#preview-status')).toContainText('Preview on in Bedroom');
    expect(serverRoom).toBe('bedroom');
    expect(events.filter((event) => event.startsWith('stop:'))).toContain('stop:living');

    await page.evaluate(() => (location.hash = '#/library'));
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveCount(0);
    await expect.poll(() => serverRoom).toBe('');
    expect(events.at(-1)).toBe('stop:bedroom');
  }
);

requirement(
  'ED2-025 @browser failed preview start exposes an error and does not claim Lights are on',
  async ({ page }) => {
    await openFixtureEditor(page, { rooms: [livingRoom] });
    await page.route('**/OpenLightFX/Studio/Preview/Start', (route) =>
      route.fulfill({ status: 503, json: { message: 'Preview service unavailable' } })
    );
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toBeEnabled();
    await page.getByRole('switch', { name: 'Lights', exact: true }).click();
    await expect(page.locator('#preview-status')).toContainText('Room preview error');
    await expect(page.getByRole('alert')).toContainText('Preview service unavailable');
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    await snapshot(page, 'preview-error');
  }
);
