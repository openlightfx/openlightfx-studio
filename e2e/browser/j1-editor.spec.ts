import { expect } from '@playwright/test';
import fs from 'node:fs';
import { decodeTrack, encodeTrack } from '../../src/lib/domain';
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

async function openEditor(
  page,
  rooms: unknown[] = [],
  bulbs: unknown[] = [],
  media: typeof mediaInfo = mediaInfo
) {
  await page.route('**/OpenLightFX/Studio/Session', (route) =>
    route.fulfill({ json: { accessToken: 'browser-test' } })
  );
  await page.route('**/OpenLightFX/Settings', (route) =>
    route.fulfill({ json: { photosensitivityMode: false } })
  );
  await page.route('**/OpenLightFX/Studio/Bulbs', (route) => route.fulfill({ json: bulbs }));
  await page.route('**/OpenLightFX/Studio/Items?*', (route) => route.fulfill({ json: [movie] }));
  await page.route('**/OpenLightFX/Studio/Items/m1', (route) => route.fulfill({ json: movie }));
  await page.route('**/OpenLightFX/Studio/Items/m1/MediaInfo', (route) =>
    route.fulfill({ json: media })
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
  await page.route('**/OpenLightFX/Studio/Projects/*', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 404, body: 'Project sidecar not found' })
      : route.fulfill({ status: 204 })
  );
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
  'ED2-022 @browser a continuous brightness gesture previews and commits one undo action',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    const initial = await page.getByLabel('Brightness value').inputValue();
    const slider = page.getByRole('slider', { name: 'Brightness', exact: true });
    await slider.focus();
    await slider.evaluate((node) => {
      const input = node as HTMLInputElement;
      for (let value = 0; value < 100; value++) {
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await expect(page.getByLabel('Brightness value')).toHaveValue('99');
    await slider.blur();
    await page.keyboard.press('Control+z');
    await expect(page.getByLabel('Brightness value')).toHaveValue(initial);
    await expect(page.getByRole('heading', { name: 'Keyframe', exact: true })).toBeVisible();
  }
);

requirement(
  'ED2-022 @browser invalid brightness draft cannot serialize and Escape restores the committed value',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    const field = page.getByLabel('Brightness value');
    const before = await field.inputValue();
    await field.fill('12.5');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert')).toContainText('whole number');
    await field.press('Escape');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(field).toHaveValue(before);
  }
);

requirement(
  'ED2-021 @browser mixed RGB and Kelvin selection brightness edit preserves unrelated properties',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    await page.getByLabel('Hex', { exact: true }).fill('ff0011');
    await page.getByLabel('Hex', { exact: true }).blur();
    await addKeyframe(page, 'Right');
    await page.getByRole('radio', { name: 'Kelvin', exact: true }).check();
    await page.getByRole('spinbutton', { name: 'Kelvin', exact: true }).fill('4100');
    await page.getByRole('spinbutton', { name: 'Kelvin', exact: true }).blur();
    await page.locator('.diamond.selected').focus();
    await page.keyboard.press('Control+a');
    await expect(page.getByRole('heading', { name: '2 selected keyframes' })).toBeVisible();
    await expect(page.getByLabel('Keyframe time')).toBeDisabled();
    await expect(page.getByText('Mixed RGB and Kelvin modes')).toBeVisible();
    await page.getByLabel('Brightness value').fill('37');
    await page.getByLabel('Brightness value').blur();
    const downloaded = page.waitForEvent('download');
    await fileMenu(page, '^Export');
    const file = await downloaded;
    const track = decodeTrack(fs.readFileSync((await file.path())!));
    expect(track.keyframes).toHaveLength(2);
    expect(track.keyframes.find((key) => key.channelId === 'left')).toMatchObject({
      brightness: 37,
      colorMode: 'RGB',
      color: { r: 255, g: 0, b: 17 },
    });
    expect(track.keyframes.find((key) => key.channelId === 'right')).toMatchObject({
      brightness: 37,
      colorMode: 'COLOR_TEMPERATURE',
      colorTemperature: 4100,
    });
  }
);

requirement(
  'ED2-018 @browser repeated nudge is one undoable action with unchanged values',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    const before = await page.getByLabel('Keyframe time').inputValue();
    await page.locator('.diamond.selected').focus();
    await page.keyboard.down('.');
    await page.keyboard.down('.');
    await page.keyboard.down('.');
    await page.keyboard.up('.');
    await expect(page.getByLabel('Keyframe time')).not.toHaveValue(before);
    await page.keyboard.press('Control+z');
    await expect(page.getByLabel('Keyframe time')).toHaveValue(before);
    await expect(page.locator('.diamond.selected')).toHaveCount(1);
  }
);

requirement(
  'ED2-018 @browser Add at an occupied playhead selects the existing key instead of searching another gap',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    const time = await page.getByLabel('Keyframe time').inputValue();
    await page.getByLabel('Go to time').fill(`00:${time}`);
    await page.getByLabel('Go to time').press('Enter');
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveAttribute(
      'aria-valuenow',
      '3000'
    );
    await expect
      .poll(() => page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(3, 2);
    await page.getByRole('button', { name: 'Add keyframe', exact: true }).click();
    const downloaded = page.waitForEvent('download');
    await fileMenu(page, '^Export');
    const file = await downloaded;
    const track = decodeTrack(fs.readFileSync((await file.path())!));
    expect(track.keyframes).toHaveLength(1);
    await expect(page.locator('.diamond.selected')).toHaveCount(1);
  }
);

requirement(
  'ED2-028 @browser manual marker add rename time and delete use sidecar history',
  async ({ page }) => {
    await openEditor(page);
    await page.getByRole('slider', { name: 'Timeline ruler' }).focus();
    await page.keyboard.press('m');
    await page.getByText('Scene markers (1)', { exact: true }).click();
    const name = page.getByRole('textbox', { name: /^Marker name/ });
    await name.fill('Opening');
    await name.blur();
    const time = page.getByRole('textbox', { name: /^Marker time/ });
    await time.fill('00:00:02.500');
    await time.blur();
    await expect(
      page.getByRole('button', { name: 'Marker Opening at 00:02.500', exact: true })
    ).toBeVisible();
    let sidecar: any;
    await page.route('**/OpenLightFX/Studio/Projects/*', async (route) => {
      if (route.request().method() === 'PUT') {
        sidecar = route.request().postDataJSON();
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ status: 404 });
    });
    await fileMenu(page, '^Save');
    await expect.poll(() => sidecar?.sceneMarkers?.length).toBe(1);
    expect(sidecar.sceneMarkers[0]).toMatchObject({
      label: 'Opening',
      timeMs: 2500,
      kind: 'manual',
    });
    await page.getByRole('button', { name: 'Delete marker Opening', exact: true }).click();
    await expect(page.getByText('Scene markers (0)', { exact: true })).toBeVisible();
    await page.getByRole('slider', { name: 'Timeline ruler' }).focus();
    await page.keyboard.press('Control+z');
    await expect(
      page.getByRole('button', { name: 'Marker Opening at 00:02.500', exact: true })
    ).toBeVisible();
  }
);

requirement(
  'ED2-029 @browser audition range validates boundaries loops decoded playback and stays paused after stepping',
  async ({ page }) => {
    await openEditor(page);
    await page.getByText('Audition range', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Loop', exact: true })).toBeDisabled();
    await page.getByLabel('Range start', { exact: true }).fill('00:00:01.000');
    await page.getByLabel('Range start', { exact: true }).blur();
    await page.getByLabel('Range end', { exact: true }).fill('00:00:00.500');
    await page.getByLabel('Range end', { exact: true }).blur();
    await expect(page.getByRole('button', { name: 'Loop', exact: true })).toBeDisabled();
    await page.getByLabel('Range end', { exact: true }).fill('00:00:01.500');
    await page.getByLabel('Range end', { exact: true }).blur();
    await page.getByRole('button', { name: 'Loop', exact: true }).click();
    await page.getByLabel('Go to time').fill('00:00:01.000');
    await page.getByLabel('Go to time').press('Enter');
    await expect
      .poll(() => page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(1, 2);
    await page.locator('video').evaluate((node) => {
      (window as any).__loopReturns = 0;
      node.addEventListener('seeked', () => {
        if (
          (node as HTMLVideoElement).currentTime >= 0.99 &&
          (node as HTMLVideoElement).currentTime < 1.15
        )
          (window as any).__loopReturns++;
      });
    });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__loopReturns), { timeout: 10000 })
      .toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Next frame', exact: true }).click();
    await expect
      .poll(() => page.locator('video').evaluate((node) => (node as HTMLVideoElement).paused))
      .toBe(true);
    await page.getByRole('button', { name: 'Clear range', exact: true }).click();
    await expect(page.getByLabel('Range start', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Loop', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  }
);

requirement(
  'ED2-024 @browser incoming fade handle previews duration preserves arrival and supports Undo and Escape',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    await page.getByLabel('Fade type').selectOption('LINEAR');
    await page.getByLabel('Fade length').fill('500');
    await page.getByLabel('Fade length').blur();
    const arrival = await page.getByLabel('Keyframe time').inputValue();
    const ruler = await page.getByRole('slider', { name: 'Timeline ruler' }).boundingBox();
    const handle = page.getByRole('button', { name: 'Incoming fade start', exact: true });
    let box = await handle.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(ruler!.x + ruler!.width * 0.2, box!.y + box!.height / 2, { steps: 4 });
    await expect(page.getByLabel('Fade length')).toHaveValue('1000');
    await expect(page.getByLabel('Keyframe time')).toHaveValue(arrival);
    await page.mouse.up();
    await handle.focus();
    await page.keyboard.press('Control+z');
    await expect(page.getByLabel('Fade length')).toHaveValue('500');
    box = await handle.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(ruler!.x + ruler!.width * 0.2, box!.y + box!.height / 2);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.getByLabel('Fade length')).toHaveValue('500');
  }
);

requirement(
  'EDIT-001 @browser the timeline ruler is the only time slider, shows proxy progress and moves the playhead',
  async ({ page }) => {
    const buildingMedia = structuredClone(mediaInfo);
    buildingMedia.proxy.state = 'building';
    buildingMedia.proxy.encodedThroughMs = 5000;
    await openEditor(page, [], [], buildingMedia);
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveCount(1);
    await expect(page.locator('[data-minimap]')).toHaveCount(0);
    await expect(page.locator('video')).not.toHaveAttribute('controls', '');
    const horizon = page.locator('.ruler');
    const processedWidth = async () =>
      Number.parseFloat(
        await horizon.evaluate((node) => getComputedStyle(node).getPropertyValue('--proxy-horizon'))
      );
    await expect.poll(processedWidth).toBeGreaterThan(0);
    await expect(page.locator('.timeline')).toHaveScreenshot('timeline-proxy-half-processed.png');
    const before = await processedWidth();
    buildingMedia.proxy.encodedThroughMs = 7500;
    await expect.poll(processedWidth).toBeGreaterThan(before);
    const box = await ruler.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height / 2);
    await expect
      .poll(async () => Math.abs(Number(await ruler.getAttribute('aria-valuenow')) - 2500))
      .toBeLessThanOrEqual(42);
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
  await expect
    .poll(async () => Math.abs(Number(await ruler.getAttribute('aria-valuenow')) - 2000))
    .toBeLessThanOrEqual(42);
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
    await expect(page.locator('.lane-canvas').first()).toHaveAttribute('data-keyframe-count', '0');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('menuitem', { name: 'Redo' }).click();
    await expect(page.locator('.lane-canvas').first()).toHaveAttribute('data-keyframe-count', '1');
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
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
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
    await expect(
      page.getByRole('status').filter({ hasText: 'Set up a room to preview on your lights' })
    ).toBeVisible();
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
    const center = (await page
      .locator('.lane-row')
      .filter({ hasText: 'Center' })
      .locator('.lane')
      .boundingBox())!;
    for (const fraction of [0.2, 0.3, 0.4, 0.5])
      await page.mouse.click(center.x + center.width * fraction, center.y + center.height / 2);
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Remove Center and its 4 keyframes?');
      await dialog.dismiss();
    });
    await page.getByLabel('Track layout').selectOption('LAYOUT_2_0');
    await expect(page.getByLabel('Track layout')).toHaveValue('LAYOUT_3_0');
  }
);

requirement(
  'MEDIA-016 @browser missing and building proxies queue a seek until the encoded horizon catches up',
  async ({ page }) => {
    await page.route('**/OpenLightFX/Studio/Items/m1/MediaInfo', (route) =>
      route.fulfill({ json: mediaInfo })
    );
    await openEditor(page);
    let reads = 0;
    await page.route('**/OpenLightFX/Studio/Items/m1/MediaInfo', (route) =>
      route.fulfill({
        json: {
          ...mediaInfo,
          proxy: {
            ...mediaInfo.proxy,
            state: reads++ === 0 ? 'missing' : reads < 3 ? 'building' : 'ready',
            encodedThroughMs: reads < 3 ? 1000 : 10000,
          },
        },
      })
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    const box = (await page.getByRole('slider', { name: 'Timeline ruler' }).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
    await expect(page.getByText(/Still encoding to/)).toBeVisible();
    await expect
      .poll(
        () =>
          page
            .locator('video')
            .evaluate((node) => Math.abs((node as HTMLVideoElement).currentTime - 9)),
        { timeout: 10000 }
      )
      .toBeLessThan(0.042);
  }
);

requirement(
  'SAVE-003 @browser failed sidecar writes are retried with the latest token and in-flight edits survive Save',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    let writes = 0;
    let release: (() => Promise<void>) | undefined;
    await page.route('**/OpenLightFX/Studio/Tracks/*', async (route) => {
      writes++;
      if (writes === 2) expect(route.request().headers()['if-match']).toBe('v1');
      if (writes === 3) {
        await new Promise<void>((resolve) => {
          release = async () => {
            await route.fulfill({ json: { updatedAt: 'v3' } });
            resolve();
          };
        });
        return;
      }
      await route.fulfill({ json: { updatedAt: `v${writes}` } });
    });
    let sidecars = 0;
    await page.route('**/OpenLightFX/Studio/Projects/*', (route) => {
      if (route.request().method() === 'GET')
        return route.fulfill({ status: 404, body: 'Project sidecar not found' });
      return sidecars++ === 0
        ? route.fulfill({ status: 500, body: 'Sidecar disk full' })
        : route.fulfill({ status: 204 });
    });
    await fileMenu(page, '^Save');
    await expect(page.getByRole('alert')).toContainText('Sidecar disk full');
    await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0);
    await fileMenu(page, '^Save');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByLabel('Track title').fill('Snapshot title');
    await fileMenu(page, '^Save');
    await expect.poll(() => Boolean(release)).toBe(true);
    await page.getByLabel('Track title').fill('Edited during Save');
    await release!();
    await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Track title')).toHaveValue('Edited during Save');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  }
);

requirement(
  'EDIT-006 @browser channel headers select defaults and Help dialogs trap focus and close with Escape',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    await page.locator('.lane-name').first().click();
    await expect(page.getByLabel('Channel default color')).toBeVisible();
    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await page.getByRole('menuitem', { name: 'How Studio works' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Its layout determines');
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
);

requirement(
  'PREV-008 @browser takeover is explicit and Cancel never starts frame dispatch',
  async ({ page }) => {
    const room = {
      id: 'room-1',
      name: 'Living Room',
      screen: { deviceId: 'screen-1', deviceName: 'TV' },
      bulbs: [{ id: 'lamp-1', position: 'left' }],
      updatedAt: 'v1',
    };
    await openEditor(page, [room], [{ id: 'lamp-1', name: 'Desk lamp', position: 'left' }]);
    const starts: boolean[] = [];
    let frames = 0;
    await page.route('**/OpenLightFX/Studio/Preview/Start', (route) => {
      const takeover = route.request().postDataJSON().takeover;
      starts.push(takeover);
      return takeover
        ? route.fulfill({ json: { active: true } })
        : route.fulfill({ status: 409, json: { message: 'playback_active' } });
    });
    await page.route('**/OpenLightFX/Studio/Preview/Frame', (route) => {
      frames++;
      return route.fulfill({ json: { active: true } });
    });
    await page.route('**/OpenLightFX/Studio/Preview/Stop', (route) => route.fulfill({ json: {} }));
    const first = page.waitForEvent('dialog');
    const cancelled = page.getByRole('switch', { name: 'Lights', exact: true }).click();
    await (await first).dismiss();
    await cancelled;
    expect(starts).toEqual([false]);
    expect(frames).toBe(0);
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    const second = page.waitForEvent('dialog');
    const accepted = page.getByRole('switch', { name: 'Lights', exact: true }).click();
    await (await second).accept();
    await accepted;
    await expect.poll(() => frames).toBeGreaterThan(0);
    expect(starts).toEqual([false, false, true]);
    await page.getByRole('switch', { name: 'Lights on', exact: true }).click();
  }
);

requirement(
  'EDIT-009 @browser a named preview failure turns Lights off and keeps authoring available',
  async ({ page }) => {
    const room = {
      id: 'room-1',
      name: 'Living Room',
      screen: { deviceId: 'screen-1', deviceName: 'TV' },
      bulbs: [{ id: 'lamp-1', position: 'left' }],
      updatedAt: 'v1',
    };
    await openEditor(page, [room], [{ id: 'lamp-1', name: 'Desk lamp', position: 'left' }]);
    await page.route('**/OpenLightFX/Studio/Preview/Start', (route) =>
      route.fulfill({ json: { active: true } })
    );
    await page.route('**/OpenLightFX/Studio/Preview/Frame', (route) =>
      route.fulfill({ status: 500, json: { message: "Bulb 'lamp-1' did not answer" } })
    );
    await page.route('**/OpenLightFX/Studio/Preview/Stop', (route) => route.fulfill({ json: {} }));
    await page.getByRole('switch', { name: 'Lights', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      "Living Room's bulbs didn't answer: Desk lamp"
    );
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    await addKeyframe(page);
    await expect(page.locator('.diamond')).toHaveCount(1);
  }
);

async function fileMenu(page, item: string) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: new RegExp(item) }).click();
}

requirement(
  'PROP-004 @browser eyedropper applies an original PNG pixel and records it in recent colors',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ff0000';
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = '#0000ff';
      context.fillRect(1, 0, 1, 1);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.route('**/OpenLightFX/Studio/Items/m1/Frame?*', (route) =>
      route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') })
    );
    const response = page.waitForResponse((response) => response.url().includes('/Frame?'));
    await page.getByRole('button', { name: 'Pick color from movie' }).click();
    expect((await response).status()).toBe(200);
    const image = page.getByAltText('Source frame');
    await expect(image).toBeVisible();
    const bounds = (await image.boundingBox())!;
    const scale = Math.min(bounds.width / 2, bounds.height);
    await page.mouse.click(
      bounds.x + (bounds.width - 2 * scale) / 2 + scale * 1.5,
      bounds.y + bounds.height / 2
    );
    await expect(page.getByLabel('Hex', { exact: true })).toHaveValue('0000ff');
    await expect(page.getByRole('button', { name: 'Recent color 1', exact: true })).toHaveAttribute(
      'title',
      '#0000ff'
    );
    await expect(image).toHaveCount(0);
    expect(await page.locator('video').evaluate((node) => (node as HTMLVideoElement).paused)).toBe(
      true
    );
  }
);

requirement(
  'PROP-004 @browser frame failure is recoverable without changing the keyframe',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    await page.route('**/OpenLightFX/Studio/Items/m1/Frame?*', (route) =>
      route.fulfill({ status: 500, body: 'ffmpeg failed' })
    );
    await page.getByRole('button', { name: 'Pick color from movie' }).click();
    await expect(page.getByRole('alert')).toContainText('The frame could not be sampled');
    await expect(page.getByRole('button', { name: 'Pick color from movie' })).toBeEnabled();
    await expect(page.getByLabel('Hex', { exact: true })).toHaveValue('000000');
  }
);

requirement(
  'TIME-002 @browser zoom anchors the playhead and wheel zoom and pan work',
  async ({ page }) => {
    await openEditor(page);
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    const bounds = (await ruler.boundingBox())!;
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    const startX = (await page.locator('.playhead').boundingBox())!.x;
    await ruler.dispatchEvent('wheel', {
      clientX: bounds.x + bounds.width / 2,
      clientY: bounds.y + bounds.height / 2,
      ctrlKey: true,
      deltaY: -100,
      bubbles: true,
      cancelable: true,
    });
    await expect.poll(async () => (await ruler.boundingBox())!.width).toBeGreaterThan(bounds.width);
    await expect
      .poll(async () => Math.abs((await page.locator('.playhead').boundingBox())!.x - startX))
      .toBeLessThan(2);
    await ruler.dispatchEvent('wheel', {
      clientX: bounds.x + bounds.width / 2,
      clientY: bounds.y + bounds.height / 2,
      shiftKey: true,
      deltaY: 20,
      bubbles: true,
      cancelable: true,
    });
    await expect
      .poll(() => page.locator('.timeline-scroll').evaluate((node) => node.scrollLeft))
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Fit movie', exact: true }).click();
    await expect
      .poll(() => page.locator('.timeline-scroll').evaluate((node) => node.scrollLeft))
      .toBe(0);
    const fitted = (await ruler.boundingBox())!;
    expect(fitted.width).toBeCloseTo(
      (await page.locator('.timeline-scroll').boundingBox())!.width -
        (await page.locator('.lane-header').first().boundingBox())!.width,
      0
    );
  }
);

requirement(
  'TIME-010 @browser dragging clamps before unselected neighbors in both directions and is undoable',
  async ({ page }) => {
    await openEditor(page);
    const lane = page.locator('.lane').first();
    const bounds = (await lane.boundingBox())!;
    for (const fraction of [0.2, 0.4])
      await page.mouse.click(bounds.x + bounds.width * fraction, bounds.y + bounds.height / 2);
    async function positions() {
      const download = page.waitForEvent('download');
      await fileMenu(page, '^Export');
      const file = await download;
      return decodeTrack(fs.readFileSync((await file.path())!)).keyframes.map(
        (frame) => frame.timestampMs
      );
    }
    const before = await positions();
    expect(before).toHaveLength(2);
    async function drag(from: number, fraction: number) {
      await page.mouse.move(bounds.x + bounds.width * from, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * fraction, bounds.y + bounds.height / 2);
      await page.mouse.up();
    }
    await drag(0.2, 0.8);
    expect(await positions()).toEqual([3792, 4000]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await positions()).toEqual(before);
    await drag(0.4, 0.1);
    expect(await positions()).toEqual([2000, 2208]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await positions()).toEqual(before);
    await drag(0.2, 0.3);
    expect(await positions()).toEqual([3000, 4000]);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
    expect(await positions()).toEqual(before);
  }
);

requirement(
  'EDIT-011 @browser save shortcut works while the title input is focused and refreshes concurrency tokens',
  async ({ page }) => {
    await openEditor(page);
    const matches: (string | undefined)[] = [];
    await page.route('**/OpenLightFX/Studio/Tracks/*', (route) => {
      matches.push(route.request().headers()['if-match']);
      return route.fulfill({ json: { updatedAt: `v${matches.length}` } });
    });
    await page.getByLabel('Track title').fill('Focused title');
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByLabel('Track title').fill('Focused title again');
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(matches).toEqual([undefined, 'v1']);
  }
);

requirement(
  'ERR-003 @browser a conflict offers server Reload and Save as new without losing local work',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    let stored: Buffer;
    let id: string;
    let conflict = false;
    await page.route('**/OpenLightFX/Studio/Tracks/*', (route) => {
      id = new URL(route.request().url()).pathname.split('/').at(-1)!;
      if (route.request().method() === 'GET')
        return route.fulfill({ body: stored, contentType: 'application/octet-stream' });
      if (conflict) return route.fulfill({ status: 409, body: 'The track changed on the server.' });
      stored = route.request().postDataBuffer()!;
      return route.fulfill({ json: { updatedAt: 'v1' } });
    });
    await fileMenu(page, '^Save');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const original = Buffer.from(stored!);
    conflict = true;
    await page.getByLabel('Track title').fill('My local revision');
    await fileMenu(page, '^Save');
    await expect(page.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save as new track', exact: true })
    ).toBeVisible();
    await page.route('**/OpenLightFX/Studio/Tracks?*', (route) =>
      route.fulfill({
        json: [{ trackId: id!, title: 'Server revision', itemId: 'm1', updatedAt: 'v2' }],
      })
    );
    const server = decodeTrack(original);
    server.metadata.title = 'Server revision';
    stored = Buffer.from(encodeTrack(server));
    const warning = page.waitForEvent('dialog');
    const click = page.getByRole('button', { name: 'Reload', exact: true }).click();
    await (await warning).accept();
    await click;
    await expect(page.getByLabel('Track title')).toHaveValue('Server revision');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const originalId = id!;
    await page.getByLabel('Track title').fill('Keep my work');
    await fileMenu(page, '^Save');
    await expect(
      page.getByRole('button', { name: 'Save as new track', exact: true })
    ).toBeVisible();
    conflict = false;
    await page.getByRole('button', { name: 'Save as new track', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(id!).not.toBe(originalId);
    expect(decodeTrack(stored!).metadata.title).toBe('Keep my work');
    await expect(page).toHaveURL(new RegExp(`/edit/m1/${id!}$`));
  }
);

requirement(
  'SAVE-004 @browser invalid incoming fade drafts block Save and preserve authored values',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    const before = await page.getByLabel('Fade length').inputValue();
    await page.getByLabel('Fade length').fill('999999');
    let writes = 0;
    page.on('request', (request) => {
      if (request.method() === 'PUT') writes++;
    });
    await page.getByLabel('Fade length').press('Control+s');
    await expect(page.getByRole('alert')).toContainText('arrival time');
    await expect(page.getByLabel('Fade length')).toHaveValue('999999');
    await page.getByLabel('Fade length').press('Escape');
    await expect(page.getByLabel('Fade length')).toHaveValue(before);
    await expect(
      page.locator('.lane-row').filter({ hasText: 'Left' }).locator('.diamond.selected')
    ).toHaveCount(1);
    expect(writes).toBe(0);
    await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0);
  }
);

requirement(
  'EDIT-008 @browser brightness changes the lane strip and export has exact inspector values',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    await page.getByLabel('Hex', { exact: true }).fill('ff0000');
    await page.getByLabel('Brightness value').fill('40');
    await page.getByLabel('Fade type').selectOption('LINEAR');
    await page.getByLabel('Fade length').fill('500');
    await page.getByLabel('Fade length').blur();
    await expect
      .poll(() =>
        page
          .locator('.lane-canvas')
          .first()
          .evaluate((node) => {
            const canvas = node as HTMLCanvasElement;
            const ratio = canvas.width / canvas.clientWidth;
            return Math.abs(
              canvas
                .getContext('2d')!
                .getImageData(Math.floor(canvas.width * 0.4), Math.floor(4 * ratio), 1, 1).data[0] -
                102
            );
          })
      )
      .toBeLessThanOrEqual(2);
    const painted = await page
      .locator('.lane-canvas')
      .first()
      .evaluate((node) => {
        const canvas = node as HTMLCanvasElement;
        const ratio = canvas.width / canvas.clientWidth;
        return Array.from(
          canvas
            .getContext('2d')!
            .getImageData(Math.floor(canvas.width * 0.4), Math.floor(4 * ratio), 1, 1).data
        );
      });
    expect(Math.abs(painted[0] - 102)).toBeLessThanOrEqual(2);
    expect(painted.slice(1, 3)).toEqual([0, 0]);
    expect(Math.abs(painted[3] - 77)).toBeLessThanOrEqual(1);
    const downloaded = page.waitForEvent('download');
    await fileMenu(page, '^Export');
    const file = await downloaded;
    const track = decodeTrack(fs.readFileSync((await file.path())!));
    expect(track.keyframes[0]).toMatchObject({
      color: { r: 255, g: 0, b: 0 },
      brightness: 40,
      interpolation: 'LINEAR',
      transitionMs: 500,
    });
  }
);

requirement(
  'EDIT-005 @browser file import asks about unsaved work, warns on mismatch and preserves Cancel',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    await fileMenu(page, '^Open a');
    await expect(page.getByRole('dialog')).toContainText('Save changes');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.diamond')).toHaveCount(1);
    await fileMenu(page, '^Open a');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: "Don't save", exact: true }).click();
    const source = decodeTrack(fs.readFileSync('tests/fixtures/sampling/roundtrip.lightfx'));
    source.metadata.movieTitle = 'Other movie';
    const dialog = page.waitForEvent('dialog');
    await (
      await chooser
    ).setFiles({
      name: 'source.lightfx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(encodeTrack(source)),
    });
    const prompt = await dialog;
    expect(prompt.message()).toContain('Other movie');
    await prompt.dismiss();
    await expect(page.locator('.diamond')).toHaveCount(1);
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  }
);

requirement(
  'EDIT-005 @browser leaving through the no-room link offers Save, discard and Cancel',
  async ({ page }) => {
    await openEditor(page);
    await addKeyframe(page);
    await page.getByRole('link', { name: 'Set up a room', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Save changes');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page).toHaveURL(/#/);
    await page.getByRole('link', { name: 'Set up a room', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveURL(/#\/rooms$/);
  }
);

requirement(
  'EDIT-012 @browser effect blocks have visible names and explain preservation',
  async ({ page }) => {
    await openEditor(page);
    // Import a real protobuf through the same user-facing file control.
    await fileMenu(page, '^Open a');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: "Don't save", exact: true }).click();
    const source = decodeTrack(fs.readFileSync('tests/fixtures/sampling/roundtrip.lightfx'));
    source.metadata.movieTitle = 'Clip Short';
    source.metadata.durationMs = 10000;
    await (
      await chooser
    ).setFiles({
      name: 'effects.lightfx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(encodeTrack(source)),
    });
    await expect(page.locator('.effect-block')).toHaveText('PULSE');
    await page.locator('.effect-block').click();
    await expect(
      page.getByText('Effect editing comes in a later version. This effect is kept as is.', {
        exact: true,
      })
    ).toBeVisible();
  }
);
