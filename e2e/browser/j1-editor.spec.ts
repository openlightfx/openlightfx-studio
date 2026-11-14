import { expect } from '@playwright/test';
import { requirement } from '../harness/requirement';

const movie = {
  itemId: 'm1',
  name: 'Clip Short',
  year: 2020,
  runtimeMs: 10_000,
  posterUrl: '',
};
const mediaInfo = {
  runtimeMs: 10_000,
  width: 320,
  height: 180,
  videoCodec: 'h264',
  hdr: false,
  colorTransfer: 'bt709',
  audioCodec: 'aac',
  proxy: {
    state: 'ready',
    encodedThroughMs: 10_000,
    fps: 24,
    keyframeIntervalMs: 500,
    width: 320,
    height: 180,
    editUrl: '/media/clip-a-h264.mp4',
  },
};

async function openEditor(page, rooms: unknown[] = [], bulbs: unknown[] = []) {
  await page.route('**/OpenLightFX/Studio/Session', (route) =>
    route.fulfill({ json: { accessToken: 'browser-test' } })
  );
  await page.route('**/OpenLightFX/Settings', (route) =>
    route.fulfill({ json: { photosensitivityMode: false } })
  );
  await page.route('**/OpenLightFX/Studio/Bulbs', (route) => route.fulfill({ json: bulbs }));
  await page.route('**/OpenLightFX/Studio/Items?*', (route) => route.fulfill({ json: [movie] }));
  await page.route('**/OpenLightFX/Studio/Items/m1/MediaInfo', (route) =>
    route.fulfill({ json: mediaInfo })
  );
  await page.route('**/OpenLightFX/Studio/Tracks?*', (route) => route.fulfill({ json: [] }));
  await page.route('**/OpenLightFX/Studio/Rooms', (route) => route.fulfill({ json: rooms }));
  await page.route('**/OpenLightFX/Studio/Setup', (route) =>
    route.fulfill({ json: { roomCount: rooms.length } })
  );
  await page.route('**/OpenLightFX/Studio/CanManageRooms', (route) =>
    route.fulfill({ json: { canManageRooms: true } })
  );
  await page.route('**/OpenLightFX/Studio/Rooms/*/Routing', async (route) => {
    const requestChannels = route.request().postDataJSON().channels as Array<{
      id: string;
      spatialHint: string;
    }>;
    const bulbRows = bulbs as Array<{ id: string; position: string }>;
    const channels = requestChannels.map((channel) => {
      const position = channel.spatialHint
        .replace('SPATIAL_', '')
        .toLowerCase()
        .replaceAll('_', '-');
      return {
        channelId: channel.id,
        position,
        bulbIds: bulbRows.filter((bulb) => bulb.position === position).map((bulb) => bulb.id),
        foldedInto: [],
      };
    });
    return route.fulfill({ json: { channels, bulbs: [] } });
  });
  await page.route('**/OpenLightFX/Studio/Projects/*', (route) => route.fulfill({ json: {} }));
  await page.route('**/OpenLightFX/Studio/Tracks/*', async (route) => {
    if (route.request().method() === 'PUT') return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 404, body: 'not found' });
  });
  await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/edit/m1/new');
  await expect(page.getByLabel('Track title')).toHaveValue('Clip Short lighting');
  await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
  await page.locator('video').evaluate(
    (node) =>
      new Promise<void>((resolve) => {
        const video = node as HTMLVideoElement;
        if (video.readyState >= 2) resolve();
        else video.addEventListener('loadeddata', () => resolve(), { once: true });
      })
  );
}

async function addKeyframe(page, channel = 'Left') {
  const lane = page.locator('.lane-row').filter({ hasText: channel }).locator('.lane');
  const box = await lane.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width * 0.3, box!.y + box!.height / 2);
  await expect(
    page.getByRole('button', { name: new RegExp(`${channel} keyframe at`) })
  ).toBeVisible();
}

requirement(
  'EDIT-001 @browser the timeline ruler is the only time slider and moves the playhead',
  async ({ page }) => {
    await openEditor(page);
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveCount(1);
    await expect(page.locator('[data-minimap]')).toHaveCount(0);
    await expect(page.locator('video')).not.toHaveAttribute('controls', '');
    const box = await ruler.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height / 2);
    await expect(ruler).toHaveAttribute('aria-valuenow', '2500');
    await expect
      .poll(() => page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(2.5, 1);
  }
);

requirement('EDIT-002 @browser dragging the ruler scrubs continuously', async ({ page }) => {
  await openEditor(page);
  const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
  const box = await ruler.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width * 0.1, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.2, box!.y + box!.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(ruler).toHaveAttribute('aria-valuenow', '2000');
});

requirement(
  'EDIT-003 @browser clicking empty lane adds and selects a keyframe',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    await expect(page.getByRole('heading', { name: 'Keyframe' })).toBeVisible();
    await expect(page.locator('.diamond')).toHaveCount(1);
  }
);

requirement(
  'EDIT-004 @browser lane headers use the selected room routing and bulb names',
  async ({ page }) => {
    const room = {
      id: 'room-1',
      name: 'Living Room',
      screen: { deviceId: 'screen-1', deviceName: 'TV', appName: 'Emby' },
      bulbs: [{ id: 'lamp-1', position: 'left', follows: null }],
      updatedAt: 'v1',
    };
    await openEditor(page, [room], [{ id: 'lamp-1', name: 'Desk lamp', position: 'left' }]);
    await expect(page.locator('.lane-name').filter({ hasText: 'Left — Desk lamp' })).toBeVisible();
    await expect(
      page.locator('.lane-name').filter({ hasText: 'Right — no bulbs reached' })
    ).toBeVisible();
  }
);

requirement(
  'EDIT-005 @browser File Close asks before leaving an unsaved track',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toContainText('Save changes to Clip Short lighting?');
    await page.getByRole('button', { name: /Don’t save|Don't save/ }).click();
    await expect(page).toHaveURL(/#\/movie\/m1$/);
  }
);

requirement(
  'EDIT-006 @browser Edit menu undo and redo reverse a keyframe insertion',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('menuitem', { name: /Undo/ }).click();
    await expect(page.locator('.diamond')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('menuitem', { name: 'Redo' }).click();
    await expect(page.locator('.diamond')).toHaveCount(1);
  }
);

requirement(
  'EDIT-007 @browser transport controls play pause skip and step the movie',
  async ({ page }) => {
    await openEditor(page);
    const video = page.locator('video');
    await page.getByRole('button', { name: 'Skip forward 5 seconds' }).click();
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(5, 0);
    await page.getByRole('button', { name: 'Next frame' }).click();
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeGreaterThan(5);
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  }
);

requirement('EDIT-008 @browser inspector edits the selected keyframe values', async ({ page }) => {
  await openEditor(page);
  await addKeyframe(page);
  await page.getByLabel('Brightness value').fill('40');
  await expect(page.getByLabel('Brightness value')).toHaveValue('40');
  await page.getByLabel('Fade type').selectOption('LINEAR');
  await page.getByLabel('Fade length').fill('500');
  await expect(page.getByLabel('Fade type')).toHaveValue('LINEAR');
  await expect(page.getByLabel('Fade length')).toHaveValue('500');
});

requirement(
  'EDIT-010 @browser without a room authoring and saving remain available while preview is disabled',
  async ({ page }) => {
    await openEditor(page);
    await expect(page.getByRole('status')).toContainText('Set up a room to preview on your lights');
    await expect(page.getByRole('button', { name: 'Preview on ▾' })).toBeDisabled();
    await expect(page.getByRole('switch', { name: 'Lights' })).toBeDisabled();
    await addKeyframe(page);
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /^Save/ }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  }
);

requirement(
  'EDIT-011 @browser the save state reflects edits and successful save',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /^Save/ }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  }
);

requirement(
  'WATCH-001 @browser Watch in Emby saves a dirty track, activates it, and opens the movie',
  async ({ page }) => {
    const room = {
      id: 'room-1',
      name: 'Living Room',
      screen: { deviceId: 'screen-1', deviceName: 'Theater TV', appName: 'Emby' },
      bulbs: [],
      updatedAt: 'v1',
    };
    await openEditor(page, [room]);
    await addKeyframe(page);
    let saved = false;
    let activated = false;
    page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().includes('/OpenLightFX/Studio/Tracks/'))
        saved = true;
      if (request.method() === 'POST' && request.url().includes('/ActiveTrack')) activated = saved;
    });
    await page.route('**/OpenLightFX/Studio/Items/m1/ActiveTrack', (route) =>
      route.fulfill({
        json: {
          trackId: 'clip-short-lighting',
          embyUrl: `${new URL(page.url()).origin}/web/index.html#!/item?id=m1`,
        },
      })
    );
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Watch in Emby' }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/\/web\/index\.html/);
    await expect(page.getByText(/Start Clip Short on Theater TV/)).toBeVisible();
    expect(saved).toBe(true);
    expect(activated).toBe(true);
  }
);

requirement(
  'EDIT-014 @browser changing layout adds channels and confirms removal with keyframes',
  async ({ page }) => {
    await openEditor(page);
    await page.getByLabel('Track layout').selectOption('LAYOUT_3_0');
    await expect(page.locator('.lane-name', { hasText: 'Center' })).toBeVisible();
    await addKeyframe(page, 'Center');
    page.on('dialog', (dialog) => dialog.dismiss());
    await page.getByLabel('Track layout').selectOption('LAYOUT_2_0');
    await expect(page.getByLabel('Track layout')).toHaveValue('LAYOUT_3_0');
  }
);
