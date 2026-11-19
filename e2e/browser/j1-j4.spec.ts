import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { blackKeyframe, decodeTrack, encodeTrack, newTrackFromMovie } from '../../src/lib/domain';
import { requirement } from '../harness/requirement';
import {
  installBackend,
  openFixtureEditor,
  lanePoint,
  menu,
  seekFraction,
  reloadWithUnsaved,
} from '../harness/browser';
import { StudioPage } from '../pages/studio-page';
import {
  DOCUMENT_ONLY_MEDIA,
  SHORT_PLAYABLE_MEDIA,
  twoHourDocumentFixture,
} from '../fixtures/editor';

// Keep transport/performance measurements sequential within each browser. A failure
// still runs the remaining tests; this is not Playwright's skip-on-failure serial mode.
test.describe.configure({ mode: 'default' });
const room = {
  id: 'living',
  name: 'Living Room',
  screen: { deviceId: 'tv', deviceName: 'TV' },
  bulbs: [
    { id: 'lamp-left', position: 'left' },
    { id: 'lamp-right', position: 'right' },
  ],
  updatedAt: 'v1',
};
async function exported(page: Page) {
  const download = page.waitForEvent('download');
  await menu(page, 'File', '^Export');
  return decodeTrack(fs.readFileSync((await (await download).path())!));
}
const time = (page: Page) =>
  page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime);
const total = (page: Page) =>
  page
    .locator('.lane-canvas')
    .evaluateAll((nodes) =>
      nodes.reduce((sum, node) => sum + Number((node as HTMLElement).dataset.keyframeCount), 0)
    );
async function crashRows(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('openlightfx-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<any[]>((resolve, reject) => {
      const request = db.transaction('crash').objectStore('crash').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows;
  });
}

requirement(
  'SHELL-001 @browser hosted Studio loads and reloads its editor route with working assets',
  async ({ page }) => {
    await openFixtureEditor(page);
    await expect(page).toHaveURL(/\/emby\/OpenLightFX\/studio\/\?.*#\/edit\/42\/proxy-fixture$/);
    await page.reload();
    await expect(page.getByLabel('Track title')).toHaveValue('Proxy Fixture');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  }
);
requirement(
  'SHELL-002 @browser local development requires Emby and never offers source-video playback',
  async ({ page }) => {
    await installBackend(page);
    await page.route('**/OpenLightFX/Studio/Items?*', (route) =>
      route.fulfill({ status: 503, json: { message: 'Emby is unreachable' } })
    );
    await page.goto('/?api_key=browser-test#/library');
    await expect(page.getByLabel('Local development')).toContainText('Local dev');
    await expect(page.getByRole('alert')).toContainText(/can't reach.*plugin/i);
    await expect(page.locator('input[accept*="video"], input[accept*="mp4"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Proxy Fixture/ })).toHaveCount(0);
  }
);
requirement(
  'SHELL-003 @browser desktop transport is in view and a narrow viewport has no horizontal page overflow',
  async ({ page }) => {
    await openFixtureEditor(page);
    for (const locator of [
      page.getByRole('button', { name: 'Play', exact: true }),
      page.getByRole('slider', { name: 'Timeline ruler' }),
      page.locator('.transport time'),
    ]) {
      await expect(locator).toBeVisible();
      const box = (await locator.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(720);
    }
    await expect(page.locator('video')).toHaveCSS('object-fit', 'contain');
    await page.setViewportSize({ width: 375, height: 700 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      )
    ).toBe(true);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  }
);
requirement('SHELL-004 @browser a fresh editor opens in the dark theme', async ({ page }) => {
  await openFixtureEditor(page);
  expect(await new StudioPage(page).backgroundLuminance()).toBeLessThan(0.2);
});
requirement(
  'SHELL-005 @browser Save Undo Redo and Play are directly visible and File Open chooses another movie',
  async ({ page }) => {
    await openFixtureEditor(page);
    for (const name of ['Save', 'Undo', 'Redo', 'Play'])
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await menu(page, 'File', '^Open…$');
    await expect(page).toHaveURL(/#\/movie\/42$/);
  }
);
requirement(
  'SHELL-006 @browser title and unsaved state stay visible through editing and Save',
  async ({ page }) => {
    await openFixtureEditor(page);
    await expect(page.getByLabel('Track title')).toHaveValue('Proxy Fixture');
    await lanePoint(page, 'Left', 0.3);
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  }
);
requirement(
  'LIB-001 @browser plugin movie names years and missing-poster fallbacks appear on Library cards',
  async ({ page }) => {
    const backend = await installBackend(page);
    backend.items.push({ itemId: '43', name: '', year: 0, runtimeMs: 0, posterUrl: '' });
    await page.goto('/?api_key=browser-test#/library');
    const card = page.getByRole('link', { name: /Proxy Fixture/ });
    await expect(card).toContainText('2020');
    await expect(card.locator('img')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Untitled/ })).toBeVisible();
  }
);
requirement(
  'LIB-002 @browser searching the standalone Library filters actual plugin results',
  async ({ page }) => {
    await installBackend(page);
    await page.goto('/?api_key=browser-test#/library');
    await expect(page.getByRole('link', { name: /Proxy Fixture/ })).toBeVisible();
    await page.getByRole('searchbox').fill('nothing-matches');
    await expect(page.getByRole('link', { name: /Proxy Fixture/ })).toHaveCount(0);
    await expect(page.getByText(/No movies match/)).toBeVisible();
  }
);
requirement(
  'MEDIA-002 @browser movie duration is displayed and cannot be hand-entered',
  async ({ page }) => {
    await openFixtureEditor(page);
    await expect(page.locator('.transport time')).toContainText('00:10.000');
    await new StudioPage(page).expectNoDurationField();
  }
);
requirement(
  'MEDIA-003 @browser the editor uses the plugin edit-proxy URL without source-video controls',
  async ({ page }) => {
    const backend = await openFixtureEditor(page);
    expect(await page.locator('video').getAttribute('src')).toBe(backend.media.proxy.editUrl);
    await expect(page.locator('video')).not.toHaveAttribute('controls');
  }
);
requirement('MEDIA-004 @browser Play advances actual proxy time', async ({ page }) => {
  await openFixtureEditor(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => time(page)).toBeGreaterThan(0.2);
});
requirement('MEDIA-005 @browser Pause holds the decoded proxy frame', async ({ page }) => {
  await openFixtureEditor(page);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => time(page)).toBeGreaterThan(0.2);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const before = await time(page);
  await page.waitForTimeout(400);
  expect(Math.abs((await time(page)) - before)).toBeLessThan(0.05);
});
requirement(
  'MEDIA-006 @browser ruler seeking changes the real video within a GOP',
  async ({ page }) => {
    await openFixtureEditor(page);
    await seekFraction(page, 0.4);
    await expect.poll(async () => Math.abs((await time(page)) - 4)).toBeLessThanOrEqual(0.5);
  }
);
requirement(
  'MEDIA-017 @browser chapter seek followed by Play starts at the selected chapter',
  async ({ page }) => {
    const media = {
      ...structuredClone(SHORT_PLAYABLE_MEDIA),
      chapters: [{ title: 'Later', timeMs: 6000 }],
    };
    await openFixtureEditor(page, { media });
    await page.locator('video').evaluate((node) => {
      Object.defineProperty(node, 'seekable', {
        configurable: true,
        get: () => ({ length: 1, start: () => 0, end: () => 1 }),
      });
    });
    await page.getByRole('button', { name: 'Next chapter' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => time(page)).toBeGreaterThan(6.2);
  }
);
requirement(
  'MEDIA-018 @browser ruler scrub followed by Play starts at the scrubbed position',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.locator('video').evaluate((node) => {
      Object.defineProperty(node, 'seekable', {
        configurable: true,
        get: () => ({ length: 1, start: () => 0, end: () => 1 }),
      });
    });
    await seekFraction(page, 0.6);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => time(page)).toBeGreaterThan(6.2);
  }
);
requirement('MEDIA-007 @browser 24 proxy frame steps land on 1000 ms', async ({ page }) => {
  await openFixtureEditor(page);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  for (let index = 0; index < 24; index++) await page.keyboard.press('ArrowRight');
  await expect.poll(() => time(page)).toBeCloseTo(1, 3);
  for (let index = 0; index < 24; index++) await page.keyboard.press('ArrowLeft');
  await expect.poll(() => time(page)).toBeCloseTo(0, 3);
});
requirement(
  'MEDIA-008 @browser keyboard skips five seconds and clamps at movie boundaries',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(() => time(page)).toBeCloseTo(5, 2);
    await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(() => time(page)).toBe(0);
  }
);
requirement(
  'MEDIA-009 @browser Space toggles transport but typing spaces does not',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.getByLabel('Track title').focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  }
);
requirement(
  'MEDIA-010 @browser transport exists only after a movie is opened in the editor',
  async ({ page }) => {
    await installBackend(page);
    await page.goto('/?api_key=browser-test#/library');
    await expect(page.getByRole('link', { name: /Proxy Fixture/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
    await page.goto('/?api_key=browser-test#/edit/42/proxy-fixture');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await new StudioPage(page).expectNoDurationField();
  }
);
requirement(
  'MEDIA-012 @browser drawn playhead stays within 50 ms of decoded proxy time',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => time(page)).toBeGreaterThan(0.5);
    const delta = await page.evaluate(() =>
      Math.abs(
        Number(
          document
            .querySelector('[role="slider"][aria-label="Timeline ruler"]')!
            .getAttribute('aria-valuenow')
        ) -
          (document.querySelector('video') as HTMLVideoElement).currentTime * 1000
      )
    );
    expect(delta).toBeLessThanOrEqual(50);
  }
);
requirement(
  'MEDIA-013 @browser reload restores the movie track and route without a picker',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.reload();
    await expect(page.getByLabel('Track title')).toHaveValue('Proxy Fixture');
    await expect(page).toHaveURL(/#\/edit\/42\/proxy-fixture$/);
    await expect(page.locator('input[accept*="video"]')).toHaveCount(0);
  }
);
requirement(
  'MEDIA-016 @browser building media plays and queues past-horizon seeks until ready',
  async ({ page }) => {
    const backend = await installBackend(page);
    backend.media.proxy.state = 'building';
    backend.media.proxy.encodedThroughMs = 1000;
    await page.goto('/?api_key=browser-test#/edit/42/proxy-fixture');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => time(page)).toBeGreaterThan(0.2);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await seekFraction(page, 0.9);
    await expect(page.getByText(/Still encoding to/)).toBeVisible();
    backend.media.proxy.state = 'ready';
    backend.media.proxy.encodedThroughMs = 10000;
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await expect
      .poll(async () => Math.abs((await time(page)) - 9), { timeout: 10000 })
      .toBeLessThanOrEqual(0.042);
  }
);
requirement(
  'TRACK-001 @browser saved tracks are chosen from the Movie screen rather than an editor movie dropdown',
  async ({ page }) => {
    await installBackend(page);
    await page.goto('/?api_key=browser-test#/movie/42');
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page).toHaveURL(/#\/edit\/42\/proxy-fixture$/);
  }
);
requirement(
  'TIME-001 @browser keyframe marks are correctly positioned RGB canvas pixels with no node per keyframe',
  async ({ page }) => {
    await openFixtureEditor(page);
    const canvases = page.locator('.lane-canvas');
    await expect(canvases).toHaveCount(2);
    expect(await total(page)).toBe(4);
    await expect(page.locator('.diamond')).toHaveCount(0);
    const pixels = await canvases.first().evaluate((node) => {
      const canvas = node as HTMLCanvasElement;
      const ratio = canvas.width / canvas.clientWidth;
      const context = canvas.getContext('2d')!;
      return [0.1, 0.6].map((fraction) =>
        Array.from(
          context.getImageData(Math.round(canvas.width * fraction), Math.round(19 * ratio), 1, 1)
            .data
        )
      );
    });
    expect(pixels).toEqual([
      [255, 0, 0, 255],
      [0, 255, 0, 255],
    ]);
  }
);
requirement(
  'TIME-002 @browser buttons and bracket keys zoom while browser chords never edit the track',
  async ({ page }) => {
    await openFixtureEditor(page);
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    const initial = (await ruler.boundingBox())!.width;
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    expect((await ruler.boundingBox())!.width).toBeGreaterThan(initial);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press(']');
    const enlarged = (await ruler.boundingBox())!.width;
    await page.keyboard.press('[');
    expect((await ruler.boundingBox())!.width).toBeLessThan(enlarged);
    const count = await total(page);
    await page.keyboard.press('Control+k');
    await page.keyboard.press('Escape');
    expect(await total(page)).toBe(count);
  }
);
requirement(
  'TIME-003 @browser Shift wheel pans a zoomed timeline without scrolling the page',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.locator('.lane-canvas').first().hover();
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 120);
    await page.keyboard.up('Shift');
    await expect
      .poll(() => page.locator('.timeline-scroll').evaluate((node) => node.scrollLeft))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
);
requirement(
  'TIME-004 @browser the visible playhead line sits at the sought movie time',
  async ({ page }) => {
    await openFixtureEditor(page);
    await seekFraction(page, 0.5);
    const ruler = (await page.getByRole('slider', { name: 'Timeline ruler' }).boundingBox())!;
    const line = (await page.locator('.playhead').boundingBox())!;
    expect(Math.abs(line.x - ruler.x - ruler.width * 0.5)).toBeLessThan(5);
  }
);
requirement(
  'TIME-005 @browser playback follows the playhead while paused keyframe edits preserve user scroll',
  async ({ page }) => {
    await openFixtureEditor(page);
    for (let index = 0; index < 3; index++)
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await seekFraction(page, 0.4);
    await page.locator('.timeline-scroll').evaluate((node) => {
      node.scrollLeft = 0;
    });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(() => page.locator('.timeline-scroll').evaluate((node) => node.scrollLeft))
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const scroll = await page.locator('.timeline-scroll').evaluate((node) => node.scrollLeft);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('k');
    expect(await page.locator('.timeline-scroll').evaluate((node) => node.scrollLeft)).toBe(scroll);
  }
);
requirement(
  'EDIT-001 @browser no minimap overview or video seek bar duplicates the ruler',
  async ({ page }) => {
    await openFixtureEditor(page);
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveCount(1);
    await expect(page.locator('[data-minimap], [data-overview]')).toHaveCount(0);
    await expect(page.locator('video')).not.toHaveAttribute('controls');
  }
);
requirement(
  'TIME-010 @browser minimum spacing prevents duplicate lane insertion and Undo retains the original frames',
  async ({ page }) => {
    await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.3);
    const count = await total(page);
    await lanePoint(page, 'Left', 0.305);
    expect(await total(page)).toBe(count);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await total(page)).toBe(4);
  }
);
requirement(
  'TIME-011 @browser Fit shows the complete movie inside the lane viewport',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.getByRole('button', { name: 'Fit movie', exact: true }).click();
    expect(
      (await page.getByRole('slider', { name: 'Timeline ruler' }).boundingBox())!.width
    ).toBeCloseTo(
      (await page.locator('.timeline-scroll').boundingBox())!.width -
        (await page.locator('.lane-header').first().boundingBox())!.width,
      0
    );
  }
);
requirement(
  'KEY-001 @browser a single lane click inserts and selects a frame with the current channel value',
  async ({ page }) => {
    await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.3);
    await expect(page.getByRole('heading', { name: 'Keyframe', exact: true })).toBeVisible();
    const track = await exported(page);
    const frame = track.keyframes.find(
      (frame) => frame.channelId === 'left' && Math.abs(frame.timestampMs - 3000) <= 42
    )!;
    expect(frame).toMatchObject({ color: { r: 255, g: 0, b: 0 }, brightness: 100 });
    expect(track.keyframes).toHaveLength(5);
  }
);
requirement('KEY-002 @browser K adds to the active channel at the playhead', async ({ page }) => {
  await openFixtureEditor(page);
  await seekFraction(page, 0.4);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press('k');
  const track = await exported(page);
  expect(
    track.keyframes.filter(
      (frame) => frame.channelId === 'left' && Math.abs(frame.timestampMs - 4000) <= 42
    )
  ).toHaveLength(1);
});
requirement('KEY-004 @browser deleting selected frames is one undoable edit', async ({ page }) => {
  await openFixtureEditor(page);
  await lanePoint(page, 'Left', 0.1);
  await page.keyboard.press('Delete');
  expect(await total(page)).toBe(3);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await total(page)).toBe(4);
});
requirement(
  'KEY-007 @browser mixed brightness displays a dash and an edit applies to every selected frame',
  async ({ page }) => {
    await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.1);
    await page.keyboard.down('Shift');
    await lanePoint(page, 'Right', 0.2);
    await page.keyboard.up('Shift');
    await expect(page.getByRole('heading', { name: '2 selected keyframes' })).toBeVisible();
    await expect(page.getByLabel('Brightness value')).toHaveValue('—');
    await page.getByLabel('Brightness value').fill('55');
    const track = await exported(page);
    expect(
      track.keyframes
        .filter((frame) => ['left-red', 'right-blue'].includes(frame.id))
        .map((frame) => frame.brightness)
    ).toEqual([55, 55]);
    await expect(page.getByLabel('Brightness value')).toHaveValue('55');
  }
);
requirement(
  'MODEL-001 @browser a layout fixes channel identity and order instead of free-form templates',
  async ({ page }) => {
    await openFixtureEditor(page, { empty: true });
    await page
      .getByRole('combobox', { name: 'Track layout', exact: true })
      .selectOption('LAYOUT_5_0');
    expect((await exported(page)).channels.map((channel) => channel.id)).toEqual([
      'left',
      'center',
      'right',
      'surround-left',
      'surround-right',
    ]);
    await expect(page.getByRole('button', { name: /Add channel|Rename channel/ })).toHaveCount(0);
  }
);
requirement(
  'EDIT-014 @browser layouts add dark channels without exposing arbitrary channel creation',
  async ({ page }) => {
    await openFixtureEditor(page, { empty: true });
    await page
      .getByRole('combobox', { name: 'Track layout', exact: true })
      .selectOption('LAYOUT_3_0');
    const track = await exported(page);
    expect(track.channels.map((channel) => channel.id)).toEqual(['left', 'center', 'right']);
    expect(track.keyframes).toHaveLength(0);
  }
);
requirement(
  'CHAN-004 @browser header and context menu mute and solo change the preview channel states',
  async ({ page }) => {
    const backend = await openFixtureEditor(page, { rooms: [room] });
    await seekFraction(page, 0.3);
    await page.getByRole('switch', { name: 'Lights', exact: true }).click();
    await expect.poll(() => backend.previewFrames.length).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Solo Left', exact: true }).click();
    await expect
      .poll(
        () =>
          backend.previewFrames.at(-1)?.states.find((state: any) => state.channelId === 'right')
            ?.brightness
      )
      .toBe(0);
    await page.getByRole('group', { name: 'Right channel controls' }).click({ button: 'right' });
    await page.getByRole('menuitemcheckbox', { name: 'Mute Right' }).click();
    await expect(page.getByRole('button', { name: 'Mute Right', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.getByRole('switch', { name: 'Lights on', exact: true }).click();
  }
);
requirement(
  'CHAN-006 @browser editor mute and solo are not serialized into the track',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.getByRole('button', { name: 'Mute Right', exact: true }).click();
    await page.getByRole('button', { name: 'Solo Left', exact: true }).click();
    const track = await exported(page);
    expect(track).not.toHaveProperty('mute');
    expect(track).not.toHaveProperty('solo');
    expect(track.keyframes.find((frame) => frame.id === 'right-blue')?.brightness).toBe(40);
  }
);
requirement(
  'PROP-001 @browser the selected-frame inspector edits color brightness and transition',
  async ({ page }) => {
    await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.1);
    for (const name of ['Hex', 'Brightness value', 'Fade type', 'Fade length', 'Keyframe time'])
      await expect(page.getByLabel(name, { exact: true })).toBeVisible();
  }
);
requirement(
  'PROP-002 @browser valid hex sets exact RGB while invalid hex preserves the last valid color',
  async ({ page }) => {
    await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.1);
    await page.getByLabel('Hex', { exact: true }).fill('00FF00');
    await expect(page.getByLabel('G', { exact: true })).toHaveValue('255');
    await page.getByLabel('Hex', { exact: true }).fill('GG0000');
    await expect(page.getByRole('alert')).toContainText('six-digit');
    expect(
      (await exported(page)).keyframes.find((frame) => frame.id === 'left-red')?.color
    ).toEqual({ r: 0, g: 255, b: 0 });
  }
);
requirement(
  'PROP-003 @browser Kelvin bounds reject invalid values without corrupting authored temperature',
  async ({ page }) => {
    await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.1);
    await page.getByRole('radio', { name: 'Kelvin', exact: true }).check();
    await page.getByRole('spinbutton', { name: 'Kelvin', exact: true }).fill('4200');
    await page.getByRole('spinbutton', { name: 'Kelvin', exact: true }).fill('500');
    await expect(page.getByRole('alert')).toContainText('1000 and 10000');
    expect((await exported(page)).keyframes.find((frame) => frame.id === 'left-red')).toMatchObject(
      { colorMode: 'COLOR_TEMPERATURE', colorTemperature: 4200 }
    );
  }
);
requirement(
  'PROP-004 @browser picking a movie color requests the plugin frame at the paused playhead',
  async ({ page }) => {
    await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.1);
    await seekFraction(page, 0.25);
    const request = page.waitForRequest((request) => request.url().includes('/Frame?timeMs='));
    await page.getByRole('button', { name: 'Pick color from movie', exact: true }).click();
    expect(
      Math.abs(Number(new URL((await request).url()).searchParams.get('timeMs')) - 2500)
    ).toBeLessThanOrEqual(42);
    expect(await page.locator('video').evaluate((node) => (node as HTMLVideoElement).paused)).toBe(
      true
    );
  }
);
requirement(
  'PROP-006 @browser recent colors keep sixteen actual picks and a swatch reapplies its RGB',
  async ({ page }) => {
    await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.1);
    for (let index = 1; index <= 20; index++)
      await page.getByLabel('Hex', { exact: true }).fill(index.toString(16).padStart(6, '0'));
    const swatches = page.getByLabel('Recent colors').getByRole('button');
    await expect(swatches).toHaveCount(16);
    const color = await swatches.last().getAttribute('title');
    await swatches.last().click();
    await expect(page.getByLabel('Hex', { exact: true })).toHaveValue(color!.slice(1));
  }
);
requirement(
  'PROP-007 @browser channel defaults are editable but layout identity has no free-form inputs',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.locator('.lane-name').first().click();
    await page.getByLabel('Channel default color').evaluate((node) => {
      const input = node as HTMLInputElement;
      input.value = '#00ff00';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByLabel('Channel default brightness').focus();
    await page.keyboard.press('Home');
    for (let index = 0; index < 40; index++) await page.keyboard.press('ArrowRight');
    const track = await exported(page);
    expect(track.channels[0]).toMatchObject({
      id: 'left',
      spatialHint: 'SPATIAL_LEFT',
      defaultColor: { r: 0, g: 255, b: 0 },
      defaultBrightness: 40,
    });
    await expect(page.getByLabel('Channel identity')).toContainText('left');
    await expect(page.getByLabel('Channel identity')).toContainText('Left');
    await expect(page.getByRole('textbox', { name: /^id$|spatial hint/i })).toHaveCount(0);
  }
);
requirement('PROP-009 @browser a new track takes the current movie name', async ({ page }) => {
  await openFixtureEditor(page, { empty: true, newTrack: true });
  await expect(page.getByLabel('Track title')).toHaveValue('Proxy Fixture lighting');
});
requirement(
  'UNDO-001 @browser Undo and Redo restore the exact authored keyframe set',
  async ({ page }) => {
    await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.3);
    expect(await total(page)).toBe(5);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await total(page)).toBe(4);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    expect(await total(page)).toBe(5);
  }
);
requirement(
  'UNDO-004 @browser reload restores authored crash data but never its Undo history',
  async ({ page }) => {
    await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.3);
    await expect.poll(async () => (await crashRows(page)).some((row) => row.dirty)).toBe(true);
    await reloadWithUnsaved(page);
    expect(await total(page)).toBe(5);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  }
);
requirement(
  'KEYB-001 @browser supported shortcuts act while reserved browser chords do not add frames',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('k');
    expect(await total(page)).toBe(5);
    await page.keyboard.press('Control+z');
    expect(await total(page)).toBe(4);
    await page.keyboard.press('Control+Shift+z');
    expect(await total(page)).toBe(5);
    await page.keyboard.press('Control+k');
    await page.keyboard.press('Escape');
    expect(await total(page)).toBe(5);
    await page.keyboard.press('Shift+/');
    await expect(page.getByRole('dialog')).toContainText(/eyedropper/i);
    await page.keyboard.press('Escape');
  }
);
requirement(
  'KEYB-003 @browser unavailable Delete explains why without changing the saved track',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('Delete');
    await expect(page.getByRole('status', { name: 'Editor feedback' })).toHaveText(
      'Nothing selected'
    );
    expect(await total(page)).toBe(4);
  }
);
requirement(
  'SAVE-005 @browser authored crash copies are in IndexedDB and not localStorage',
  async ({ page }) => {
    await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.3);
    await expect.poll(async () => (await crashRows(page)).some((row) => row.dirty)).toBe(true);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((key) => key !== 'olfx-last-route')
      )
    ).toEqual([]);
  }
);
requirement(
  'SAVE-006 @browser a successful track and sidecar Save supersedes the dirty crash copy',
  async ({ page }) => {
    const backend = await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.3);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(backend.projects).toHaveLength(1);
    await page.reload();
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toBeVisible();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    expect(await total(page)).toBe(5);
    expect((await crashRows(page)).every((row) => !row.dirty)).toBe(true);
  }
);
requirement(
  'SAVE-007 @browser newer crash edits restore while a newer server revision wins',
  async ({ page }) => {
    const backend = await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.3);
    await expect.poll(async () => (await crashRows(page)).some((row) => row.dirty)).toBe(true);
    await reloadWithUnsaved(page);
    expect(await total(page)).toBe(5);
    await expect(page.getByRole('status', { name: 'Crash recovery' })).toContainText('restored');
    backend.updatedAt = new Date(Date.now() + 5000).toISOString();
    backend.track.metadata.title = 'Newer server revision';
    await reloadWithUnsaved(page);
    await expect(page.getByLabel('Track title')).toHaveValue('Newer server revision');
    expect(await total(page)).toBe(4);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  }
);
requirement(
  'SAVE-008 @browser Export downloads the current protobuf without pretending it was saved to Emby',
  async ({ page }) => {
    const backend = await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.3);
    const track = await exported(page);
    expect(track.keyframes).toHaveLength(5);
    expect(backend.writes).toHaveLength(0);
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  }
);
requirement(
  'IO-001 @browser confirmed file import replaces layout and preserves the current movie association',
  async ({ page }) => {
    await openFixtureEditor(page);
    const track = newTrackFromMovie('42', 'Proxy Fixture', 10000, 'LAYOUT_3_0');
    const chooser = page.waitForEvent('filechooser');
    await menu(page, 'File', '^Open a');
    await (
      await chooser
    ).setFiles({
      name: 'import.lightfx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(encodeTrack(track)),
    });
    await expect(page.getByRole('combobox', { name: 'Track layout', exact: true })).toHaveValue(
      'LAYOUT_3_0'
    );
    expect((await exported(page)).channels.map((channel) => channel.id)).toEqual([
      'left',
      'center',
      'right',
    ]);
    await expect(page).toHaveURL(/#\/edit\/42\//);
  }
);
requirement(
  'IO-004 @browser runtime mismatch requires explicit confirmation before replacing a track',
  async ({ page }) => {
    await openFixtureEditor(page);
    const track = newTrackFromMovie('42', 'Proxy Fixture', 6000);
    const chooser = page.waitForEvent('filechooser');
    await menu(page, 'File', '^Open a');
    const dialog = page.waitForEvent('dialog');
    await (
      await chooser
    ).setFiles({
      name: 'mismatch.lightfx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(encodeTrack(track)),
    });
    const prompt = await dialog;
    expect(prompt.message()).toContain('10 seconds');
    expect(prompt.message()).toContain('6 seconds');
    await prompt.dismiss();
    expect(await total(page)).toBe(4);
  }
);
requirement(
  'PREV-008 @browser takeover is offered only after the server reports real playback ownership',
  async ({ page }) => {
    const backend = await openFixtureEditor(page, { rooms: [room] });
    await page.route('**/OpenLightFX/Studio/Preview/Start', (route) =>
      route.request().postDataJSON().takeover
        ? route.fulfill({ json: { active: true } })
        : route.fulfill({ status: 409, json: { message: 'playback_active' } })
    );
    const dialog = page.waitForEvent('dialog');
    const clicked = page.getByRole('switch', { name: 'Lights', exact: true }).click();
    const prompt = await dialog;
    expect(prompt.message()).toContain('Take over');
    await prompt.dismiss();
    await clicked;
    expect(backend.previewFrames).toHaveLength(0);
  }
);
requirement(
  'PREV-010 @browser non-admin authoring and Export work while bulb controls are explicitly disabled',
  async ({ page }) => {
    await openFixtureEditor(page, { admin: false, rooms: [room] });
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toBeDisabled();
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toHaveAttribute(
      'title',
      /administrator/
    );
    await lanePoint(page, 'Left', 0.3);
    expect((await exported(page)).keyframes).toHaveLength(5);
  }
);
requirement(
  'PREV-012 @browser photosensitivity notice never changes authored protobuf brightness',
  async ({ page }) => {
    await installBackend(page, { rooms: [room] });
    await page.route('**/OpenLightFX/Settings', (route) =>
      route.fulfill({ json: { photosensitivityMode: true } })
    );
    await page.goto('/?api_key=browser-test#/edit/42/proxy-fixture');
    await expect(page.getByRole('switch', { name: 'Lights', exact: true })).toBeEnabled();
    await page.getByRole('switch', { name: 'Lights', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Photosensitivity' })).toContainText('softer');
    expect(
      (await exported(page)).keyframes.find((frame) => frame.id === 'left-red')?.brightness
    ).toBe(100);
    await page.getByRole('switch', { name: 'Lights on', exact: true }).click();
  }
);
requirement(
  'SAFE-002 @browser computed intensity and flashing are visible read-only text',
  async ({ page }) => {
    const backend = await installBackend(page, { empty: true });
    backend.track.keyframes = Array.from({ length: 8 }, (_, index) => ({
      ...blackKeyframe('left'),
      id: `flash-${index}`,
      timestampMs: index * 200,
      brightness: index % 2 ? 100 : 0,
    }));
    await page.goto('/?api_key=browser-test#/edit/42/proxy-fixture');
    await expect(page.getByText('Intense', { exact: true })).toBeVisible();
    await expect(page.getByText('Flashing', { exact: true })).toBeVisible();
  }
);
requirement(
  'PERF-001 @browser the standalone movie Library is ready within two seconds',
  async ({ page }) => {
    await installBackend(page);
    const started = Date.now();
    await page.goto('/?api_key=browser-test#/library');
    await expect(page.getByRole('link', { name: /Proxy Fixture/ })).toBeVisible();
    expect(Date.now() - started).toBeLessThan(2000);
  }
);
requirement(
  'PERF-002 @browser five-channel two-hour 10000-keyframe zoom obeys the frame budget',
  async ({ page, browserName }) => {
    await openFixtureEditor(page, {
      track: twoHourDocumentFixture(),
      itemRuntimeMs: 0,
      media: DOCUMENT_ONLY_MEDIA,
    });
    const canvases = page.locator('.lane-canvas');
    await expect(canvases).toHaveCount(5);
    expect(await total(page)).toBe(10000);
    await expect(page.locator('.diamond')).toHaveCount(0);
    const measurements = await page.evaluate(async () => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const zoomIn = buttons.find((button) => button.getAttribute('aria-label') === 'Zoom in')!;
      const zoomOut = buttons.find((button) => button.getAttribute('aria-label') === 'Zoom out')!;
      const times: number[] = [];
      let previous = 0,
        first = 0,
        index = 0;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(function frame(time) {
          if (!first) first = time;
          if (previous) times.push(time - previous);
          previous = time;
          (index++ % 2 ? zoomOut : zoomIn).click();
          if (time - first >= 3000) resolve();
          else requestAnimationFrame(frame);
        })
      );
      times.sort((a, b) => a - b);
      return {
        p95: times[Math.floor(times.length * 0.95)],
        frames: times.length,
        cores: navigator.hardwareConcurrency,
        ratio: devicePixelRatio,
      };
    });
    expect(measurements.cores).toBeGreaterThanOrEqual(4);
    expect(measurements.ratio).toBeLessThanOrEqual(2);
    expect(measurements.frames).toBeGreaterThan(100);
    if (browserName === 'chromium') expect(measurements.p95).toBeLessThanOrEqual(16.7);
  }
);
requirement(
  'PERF-003 @browser each of five playback seconds presents at least 22 actual proxy frames',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => time(page)).toBeGreaterThan(0.2);
    const counts = await page.locator('video').evaluate(
      (node) =>
        new Promise<number[]>((resolve) => {
          const video = node as HTMLVideoElement;
          const counts = [0, 0, 0, 0, 0];
          let first = 0;
          const frame = (now: number) => {
            if (!first) first = now;
            const second = Math.floor((now - first) / 1000);
            if (second >= 5) {
              resolve(counts);
              return;
            }
            counts[second]++;
            video.requestVideoFrameCallback(frame);
          };
          video.requestVideoFrameCallback(frame);
        })
    );
    for (const count of counts) expect(count).toBeGreaterThanOrEqual(22);
  }
);
requirement(
  'PERF-004 @browser playback positively fetches only the edit proxy rather than source-media routes',
  async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (request) => urls.push(request.url()));
    const backend = await openFixtureEditor(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => time(page)).toBeGreaterThan(0.2);
    expect(urls.some((url) => new URL(url).pathname === backend.media.proxy.editUrl)).toBe(true);
    expect(urls.some((url) => /\/Videos\/|\/Download\b|\.mkv(?:\?|$)/i.test(url))).toBe(false);
  }
);
requirement(
  'A11Y-001 @browser transport has accessible names and the sole time ruler has its range',
  async ({ page }) => {
    await openFixtureEditor(page);
    for (const name of [
      'Play',
      'Previous frame',
      'Next frame',
      'Skip back 5 seconds',
      'Skip forward 5 seconds',
    ])
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveAttribute(
      'aria-valuemin',
      '0'
    );
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveAttribute(
      'aria-valuemax',
      '10000'
    );
  }
);
requirement(
  'A11Y-002 @browser canvas selection has a keyboard focus target and explicit inspector time',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.locator('.lane-canvas').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Keyframe', exact: true })).toBeVisible();
    await expect(page.getByLabel('Keyframe time')).toHaveValue('00:01.000');
    await expect(page.getByRole('button', { name: /Left keyframe at/ })).toHaveCount(1);
  }
);
requirement(
  'A11Y-003 @browser question mark opens keyboard help and Escape returns to editing',
  async ({ page }) => {
    await openFixtureEditor(page);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('Shift+/');
    await expect(page.getByRole('dialog')).toContainText(/eyedropper/i);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
);
requirement(
  'ERR-001 @browser a failed proxy leaves authoring available and Retry requests a replacement',
  async ({ page }) => {
    const backend = await installBackend(page);
    backend.media.proxy.state = 'failed';
    backend.media.proxy.reason = 'ffmpeg exited with code 1';
    await page.goto('/?api_key=browser-test#/edit/42/proxy-fixture');
    await expect(page.getByText('ffmpeg exited with code 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    await lanePoint(page, 'Left', 0.3);
    expect(await total(page)).toBe(5);
    await page.getByRole('button', { name: /Retry/ }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  }
);
requirement(
  'ERR-002 @browser an unreachable plugin never fabricates movie cards',
  async ({ page }) => {
    await installBackend(page);
    await page.route('**/OpenLightFX/Studio/Items?*', (route) =>
      route.fulfill({ status: 503, json: { message: 'Plugin is unreachable' } })
    );
    await page.goto('/emby/OpenLightFX/studio/?api_key=browser-test#/library');
    await expect(page.getByRole('alert')).toContainText(/can't reach.*plugin/i);
    await expect(page.getByRole('link', { name: /Proxy Fixture/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  }
);
requirement(
  'ERR-003 @browser server validation text identifies the offending frame and preserves dirty work',
  async ({ page }) => {
    const backend = await openFixtureEditor(page);
    await lanePoint(page, 'Left', 0.3);
    backend.saveError = {
      status: 400,
      message: 'V-007: Keyframe left-red brightness must be between 0 and 100',
    };
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('V-007');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    expect(backend.writes).toHaveLength(0);
  }
);
requirement(
  'ERR-004 @browser forbidden Save is disabled with an administrator reason while Export still works',
  async ({ page }) => {
    await openFixtureEditor(page, { admin: false });
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveAttribute(
      'title',
      /administrator/
    );
    expect((await exported(page)).keyframes).toHaveLength(4);
  }
);
requirement(
  'ERR-006 @browser unknown movie duration blocks creation instead of inventing a duration field',
  async ({ page }) => {
    await installBackend(page, { durationMs: 0, empty: true });
    await page.goto('/?api_key=browser-test#/movie/42');
    await expect(page.getByRole('button', { name: /Create track/ })).toBeDisabled();
    await new StudioPage(page).expectNoDurationField();
  }
);
requirement(
  'ERR-007 @browser failed plugin-frame sampling leaves authored color unchanged',
  async ({ page }) => {
    const backend = await openFixtureEditor(page);
    backend.frameError = true;
    await lanePoint(page, 'Left', 0.1);
    await page.getByRole('button', { name: 'Pick color from movie', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('could not be sampled');
    expect(
      (await exported(page)).keyframes.find((frame) => frame.id === 'left-red')?.color
    ).toEqual({ r: 255, g: 0, b: 0 });
  }
);
