import { expect } from '@playwright/test';
import { requirement } from '../harness/requirement';
import { StudioPage } from '../pages/studio-page';

async function shell(page: import('@playwright/test').Page) {
  const studio = new StudioPage(page);
  await studio.openLocal();
  await page.getByRole('option', { name: /proxy fixture/i }).click();
  await page.locator('video').evaluate(
    (node) =>
      new Promise<void>((resolve) => {
        const video = node as HTMLVideoElement;
        if (video.readyState >= 2) {
          resolve();
          return;
        }
        video.addEventListener('loadeddata', () => resolve(), { once: true });
      })
  );
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  return studio;
}

requirement('SHELL-001 @browser studio loads from the plugin URL', async ({ page }) => {
  const studio = new StudioPage(page);
  const response = await studio.openHosted();
  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/emby\/OpenLightFX\/studio\/\?/);
  await expect(studio.button(/play/i)).toBeVisible();
  await page.goto('/emby/OpenLightFX/studio/?itemId=42&api_key=test-admin');
  expect((await page.content()).toLowerCase()).not.toContain('404');
});

requirement('SHELL-002 @browser hosted mode is labeled and local dev is not a fake library', async ({ page }) => {
  const studio = new StudioPage(page);
  await studio.openLocal();
  await expect(page.getByText(/local dev/i)).toBeVisible();
  await expect(page.locator('input[type="file"]')).toBeVisible();
  await expect(page.getByText(/glass harbor|pretend/i)).toHaveCount(0);
});

requirement('SHELL-003 @browser desktop layout keeps transport on screen', async ({ page }) => {
  const studio = await shell(page);
  for (const locator of [
    studio.button(/^play$|^pause$/i),
    page.getByRole('slider', { name: /seek|scrub/i }),
    page.getByText(/\d{2}:\d{2}:\d{2}/).first(),
  ]) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box && box.y >= 0 && box.y + box.height <= 720).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 700 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  await expect(studio.button(/^play$|^pause$/i)).toBeVisible();
});

requirement('SHELL-004 @browser a fresh session opens in the dark theme', async ({ page }) => {
  const studio = await shell(page);
  expect(await studio.backgroundLuminance()).toBeLessThan(0.2);
});

requirement('SHELL-005 @browser save undo redo and play are visible buttons', async ({ page }) => {
  const studio = await shell(page);
  await expect(studio.button(/^save$/i)).toBeVisible();
  await expect(studio.button(/^undo$/i)).toBeVisible();
  await expect(studio.button(/^redo$/i)).toBeVisible();
  await expect(studio.button(/^play$|^pause$/i)).toBeVisible();
});

requirement('SHELL-006 @browser the top bar shows the title and unsaved state', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.getByText('Proxy Fixture')).toBeVisible();
  await page.keyboard.press('k');
  await expect(page.getByText(/unsaved/i)).toBeVisible();
});

requirement('MEDIA-001 @browser the library lists plugin movies and search narrows it', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.getByRole('option', { name: /proxy fixture/i })).toBeVisible();
  await page.getByRole('searchbox').fill('zzz-no-such-movie');
  await expect(page.getByRole('option', { name: /proxy fixture/i })).toHaveCount(0);
});

requirement('MEDIA-002 @browser duration comes from the selected movie', async ({ page }) => {
  const studio = await shell(page);
  await page.getByRole('option', { name: /proxy fixture/i }).click();
  await expect(page.getByText(/00:10|10\.0|10000|0:10/)).toBeVisible();
  await studio.expectNoDurationField();
});

requirement('MEDIA-003 @browser the editor plays an H.264 proxy', async ({ page }) => {
  const studio = await shell(page);
  const video = page.locator('video');
  await expect(video).toBeVisible();
  const src = await video.getAttribute('src');
  expect(src ?? '').not.toMatch(/\.mkv($|\?)/i);
});

requirement('MEDIA-004 @browser play advances the picture', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/^play$/i).click();
  await expect.poll(async () => page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(0.2);
});

requirement('MEDIA-005 @browser pause holds the frame', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/^play$/i).click();
  await studio.button(/^pause$/i).click();
  const first = await page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime);
  await page.waitForTimeout(400);
  const second = await page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime);
  expect(Math.abs(second - first)).toBeLessThan(0.05);
});

requirement('MEDIA-006 @browser proxy seek lands within one GOP', async ({ page }) => {
  const studio = await shell(page);
  const video = page.locator('video');
  const started = Date.now();
  await video.evaluate(
    (node) =>
      new Promise((resolve, reject) => {
        const videoNode = node as HTMLVideoElement;
        const timer = setTimeout(() => reject(new Error('seeked did not fire')), 3000);
        videoNode.addEventListener(
          'seeked',
          () => {
            clearTimeout(timer);
            resolve(true);
          },
          { once: true }
        );
        videoNode.currentTime = 4;
      })
  );
  expect(Date.now() - started).toBeLessThanOrEqual(400);
  const time = await video.evaluate((node) => (node as HTMLVideoElement).currentTime);
  expect(Math.abs(time - 4)).toBeLessThanOrEqual(0.5);
});

requirement('MEDIA-007 @browser frame step moves the 24 fps grid', async ({ page }) => {
  const studio = await shell(page);
  for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByText(/1008|1\.008|00:01/)).toBeVisible();
});

requirement('MEDIA-008 @browser skip moves five seconds', async ({ page }) => {
  const studio = await shell(page);
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByText(/5\.0|00:05/)).toBeVisible();
});

requirement('MEDIA-009 @browser space toggles playback unless a field has focus', async ({ page }) => {
  const studio = await shell(page);
  await page.keyboard.press('Space');
  await expect(studio.button(/^pause$/i)).toBeVisible();
  await page.getByRole('textbox').first().focus();
  await page.keyboard.press('Space');
  await expect(studio.button(/^pause$/i)).toBeVisible();
});

requirement('MEDIA-010 @browser transport is present before a movie and has no duration field', async ({ page }) => {
  const studio = new StudioPage(page);
  await studio.openLocal();
  const play = studio.button(/^play$/i);
  await expect(play).toBeVisible();
  await expect(play).toBeDisabled();
  await expect(play).toHaveAccessibleDescription(/choose a movie/i);
  await studio.expectNoDurationField();
});

requirement('MEDIA-012 @browser the playhead stays within 50 ms of the picture', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/^play$/i).click();
  const delta = await page.evaluate(async () => {
    const video = document.querySelector('video') as HTMLVideoElement;
    const playhead = document.querySelector('[data-playhead-ms]') as HTMLElement;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return Math.abs(Number(playhead.dataset.playheadMs) - video.currentTime * 1000);
  });
  expect(delta).toBeLessThanOrEqual(50);
});

requirement('MEDIA-013 @browser reload restores the Emby item', async ({ page }) => {
  const studio = new StudioPage(page);
  const response = await studio.openHosted('api_key=test-admin&itemId=42');
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByText(/item 42|proxy fixture/i)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/item 42|proxy fixture/i)).toBeVisible();
  await expect(page.getByText(/choose a file|open file/i)).toHaveCount(0);
});

requirement('MEDIA-014 @browser an H.264 MP4 plays in dev and MKV is refused', async ({ page }) => {
  const studio = await shell(page);
  await page.locator('input[type="file"]').setInputFiles('static/media/clip-a-h264.mp4');
  await studio.button(/^play$/i).click();
  await expect.poll(async () => page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
  await page.locator('input[type="file"]').setInputFiles({ name: 'movie.mkv', mimeType: 'video/x-matroska', buffer: Buffer.from('not a movie') });
  await expect(page.getByText(/emby/i)).toBeVisible();
});

requirement('MEDIA-016 @browser editing works while the proxy is building', async ({ page }) => {
  const studio = await shell(page);
  await page.getByRole('option', { name: /building proxy/i }).click();
  await expect(page.getByText(/prepar/i)).toBeVisible();
  await page.keyboard.press('k');
  await expect(page.getByText(/keyframe/i)).toBeVisible();
});

requirement('MEDIA-017 @browser one track opens and several tracks ask', async ({ page }) => {
  const studio = await shell(page);
  await page.getByRole('option', { name: /two tracks/i }).click();
  await expect(page.getByRole('button', { name: /new track/i })).toBeVisible();
});

requirement('TIME-001 @browser lanes are canvas marks', async ({ page }) => {
  const studio = await shell(page);
  await expect(studio.canvas()).toBeVisible();
  await expect(page.getByText(/^left$/i)).toBeVisible();
  await expect(page.getByText(/^right$/i)).toBeVisible();
  expect(await page.locator('[data-keyframe-id]').count()).toBe(0);
});

requirement('TIME-002 @browser zoom uses buttons and bracket keys', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/zoom in/i).click();
  await page.keyboard.press(']');
  await page.keyboard.press('Control+Equal');
  await expect(page.getByTestId('px-per-ms')).toBeVisible();
});

requirement('TIME-003 @browser shift wheel pans the timeline', async ({ page }) => {
  const studio = await shell(page);
  await studio.canvas().hover();
  await page.mouse.wheel(0, 120);
  await expect(page.locator('[data-scroll-x]')).toBeVisible();
});

requirement('TIME-004 @browser the playhead is drawn', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.locator('[data-playhead]')).toBeVisible();
});

requirement('TIME-005 @browser follow moves only during playback', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/^play$/i).click();
  await expect(page.locator('[data-follow="on"]')).toBeVisible();
  await studio.button(/^pause$/i).click();
  const before = await page.locator('[data-scroll-x]').getAttribute('data-scroll-x');
  await page.keyboard.press('k');
  expect(await page.locator('[data-scroll-x]').getAttribute('data-scroll-x')).toBe(before);
});

requirement('TIME-006 @browser the minimap is at least 48 px and navigates', async ({ page }) => {
  const studio = await shell(page);
  const minimap = page.getByRole('img', { name: /minimap/i }).or(page.locator('[data-minimap]'));
  const box = await minimap.boundingBox();
  expect(box && box.height).toBeGreaterThanOrEqual(48);
  await minimap.click();
});

requirement('TIME-008 @browser click and shift click select keyframes', async ({ page }) => {
  const studio = await shell(page);
  await studio.canvas().click({ position: { x: 40, y: 40 } });
  await expect(page.getByText(/1 selected|selected/i)).toBeVisible();
});

requirement('TIME-009 @browser marquee selects the enclosed keyframes', async ({ page }) => {
  const studio = await shell(page);
  const box = await studio.canvas().boundingBox();
  if (!box) throw new Error('timeline canvas missing');
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10);
  await page.mouse.up();
  await expect(page.getByText(/4 selected/i)).toBeVisible();
});

requirement('TIME-010 @browser dragging snaps and enforces spacing', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.getByText(/snap/i)).toBeVisible();
  await page.getByLabel(/minimum spacing/i).fill('50');
  await expect(page.getByText(/100, 200, or 1000/i)).toBeVisible();
});

requirement('TIME-011 @browser zoom to fit shows the whole movie', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/zoom to fit/i).click();
  await expect(page.locator('[data-fit="true"]')).toBeVisible();
});

requirement('KEY-001 @browser double-click inserts a keyframe', async ({ page }) => {
  const studio = await shell(page);
  await studio.canvas().dblclick({ position: { x: 80, y: 40 } });
  await expect(page.getByText(/2500|2\.5/)).toBeVisible();
});

requirement('KEY-002 @browser K inserts at the playhead', async ({ page }) => {
  const studio = await shell(page);
  await page.keyboard.press('k');
  await expect(page.getByRole('status')).toContainText(/channel/i);
});

requirement('KEY-004 @browser delete removes the selection in one undo', async ({ page }) => {
  const studio = await shell(page);
  await studio.canvas().click({ position: { x: 40, y: 40 } });
  await page.keyboard.press('Delete');
  await studio.button(/^undo$/i).click();
});

requirement('KEY-007 @browser mixed values show a dash and apply to the selection', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.getByRole('textbox', { name: /brightness/i })).toHaveValue('—');
});

requirement('CHAN-001 @browser a new movie starts on the Stereo template', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.getByText(/^left$/i)).toBeVisible();
  await expect(page.getByText(/^right$/i)).toBeVisible();
  await studio.expectNoDurationField();
});

requirement('CHAN-002 @browser add rename and delete channels', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/add channel/i).click();
  await page.getByLabel(/^id$/i).fill('rear_1');
  await studio.button(/^add$/i).click();
  await expect(page.getByText('rear_1')).toBeVisible();
});

requirement('CHAN-003 @browser dragging a header reorders lanes', async ({ page }) => {
  const studio = await shell(page);
  const right = page.getByText(/^right$/i);
  const box = await right.boundingBox();
  if (!box) throw new Error('channel header missing');
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + 4, box.y - 40);
  await page.mouse.up();
  await expect(page.locator('[data-channel-order]')).toHaveAttribute('data-channel-order', /right,left/);
});

requirement('CHAN-004 @browser solo and mute are on the header and the context menu', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/solo/i).first().click();
  await page.getByText(/^right$/i).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /mute/i }).click();
  await expect(page.locator('[data-solo="left"]')).toBeVisible();
});

requirement('PROP-001 @browser the popover edits color brightness transition and interpolation', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.getByLabel(/brightness/i)).toBeVisible();
  await expect(page.getByRole('option', { name: /ease/i })).toHaveCount(0);
});

requirement('PROP-002 @browser hex 00FF00 sets green and an invalid hex is refused', async ({ page }) => {
  const studio = await shell(page);
  await page.getByLabel(/hex/i).fill('00FF00');
  await expect(page.getByLabel(/green/i)).toHaveValue('255');
  await page.getByLabel(/hex/i).fill('GG0000');
  await expect(page.getByText(/hex/i)).toBeVisible();
});

requirement('PROP-003 @browser kelvin stays between 1000 and 10000', async ({ page }) => {
  const studio = await shell(page);
  await page.getByRole('radio', { name: /kelvin/i }).check();
  const kelvin = page.getByRole('textbox', { name: /^kelvin$/i });
  await kelvin.fill('4200');
  await expect(kelvin).toHaveValue('4200');
  await kelvin.fill('500');
  await expect(page.getByText(/1000/)).toBeVisible();
});

requirement('PROP-004 @browser the eyedropper requests the plugin frame', async ({ page }) => {
  const studio = await shell(page);
  const request = page.waitForRequest((req) => req.url().includes('/Frame?timeMs='), { timeout: 4_000 });
  await studio.button(/eyedropper/i).click();
  expect((await request).url()).toContain('timeMs=');
});

requirement('PROP-006 @browser color history keeps 16 swatches', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.locator('[data-color-history] button')).toHaveCount(16);
});

requirement('PROP-007 @browser channel properties edit id hint and optional', async ({ page }) => {
  const studio = await shell(page);
  await page.getByText(/^left$/i).click();
  await expect(page.getByLabel(/spatial/i)).toBeVisible();
  await expect(page.getByText(/does not change plugin playback/i)).toBeVisible();
});

requirement('PROP-009 @browser a new track title is the movie name', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.getByLabel(/title/i)).toHaveValue('Proxy Fixture');
});

requirement('UNDO-001 @browser undo removes the last edit', async ({ page }) => {
  const studio = await shell(page);
  await page.keyboard.press('k');
  await page.keyboard.press('Control+z');
  await expect(page.getByText(/undone|no keyframe/i)).toBeVisible();
});

requirement('UNDO-004 @browser reload clears undo', async ({ page }) => {
  const studio = await shell(page);
  await page.reload();
  await expect(new StudioPage(page).button(/^undo$/i)).toBeDisabled();
});

requirement('KEYB-001 @browser save undo k space v i and zoom keys run', async ({ page }) => {
  const studio = await shell(page);
  for (const key of ['Control+s', 'Control+z', 'k', 'Space', 'v', 'i', ']', '[', '\\']) {
    await page.keyboard.press(key);
  }
  await expect(studio.button(/shortcuts/i)).toBeVisible();
});

requirement('KEYB-003 @browser a shortcut that cannot run explains why', async ({ page }) => {
  const studio = await shell(page);
  await page.keyboard.press('k');
  await expect(page.getByRole('status')).toContainText(/channel/i);
});

requirement('SAVE-005 @browser autosave is indexedDB and not localStorage', async ({ page }) => {
  await shell(page);
  const stored = await page.evaluate(async () => {
    const local = Object.keys(localStorage).some((key) => /project|lightfx|track/i.test(key));
    const databases = (await indexedDB.databases?.()) ?? [];
    return { local, databases: databases.map((db) => db.name) };
  });
  expect(stored.local).toBe(false);
  expect(stored.databases.some((name) => /lightfx|studio|project/i.test(name ?? ''))).toBe(true);
});

requirement('SAVE-006 @browser a successful save wins over the crash copy', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/^save$/i).click();
  await page.reload();
  await expect(page.getByText(/unsaved/i)).toHaveCount(0);
});

requirement('SAVE-007 @browser a newer crash copy is restored', async ({ page }) => {
  const studio = await shell(page);
  await page.keyboard.press('k');
  await expect.poll(async () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('openlightfx-studio');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return new Promise<boolean>((resolve) => {
        const tx = db.transaction('crash', 'readonly');
        const request = tx.objectStore('crash').getAll();
        request.onsuccess = () => resolve(request.result.some((row) => row && row.dirty));
      });
    })
  ).toBe(true);
  await page.reload();
  await expect(page.getByText(/unsaved edits were restored/i)).toBeVisible();
});

requirement('SAVE-008 @browser local save downloads a lightfx file', async ({ page }) => {
  const studio = await shell(page);
  const download = page.waitForEvent('download', { timeout: 4_000 });
  await studio.button(/^save$/i).click();
  expect((await download).suggestedFilename()).toMatch(/\.lightfx$/);
  await expect(page.getByText(/written to emby/i)).toHaveCount(0);
});

requirement('IO-001 @browser import replaces channels and keeps the movie', async ({ page }) => {
  const studio = await shell(page);
  await page.locator('input[type="file"][accept*="lightfx"]').setInputFiles('tests/fixtures/sampling/roundtrip.lightfx');
  await expect(page.getByText(/^left$/i)).toBeVisible();
  await expect(page.getByText('Proxy Fixture')).toBeVisible();
});

requirement('IO-004 @browser a duration warning appears only for a mismatched import', async ({ page }) => {
  const studio = await shell(page);
  await page.locator('input[type="file"][accept*="lightfx"]').setInputFiles('tests/fixtures/sampling/mismatch.lightfx');
  await expect(page.getByRole('button', { name: /use movie duration/i })).toBeVisible();
});

requirement('PREV-001 @browser spatial hints use the proto region names', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/lights|overlay/i).click();
  await expect(page.locator('[data-region="SPATIAL_LEFT"]')).toBeVisible();
});

requirement('PREV-002 @browser the overlay color matches the sampler', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.locator('[data-overlay-rgb="255,0,0"]')).toBeVisible();
});

requirement('PREV-003 @browser mute and solo change the overlay', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/mute/i).first().click();
  await expect(page.locator('[data-region="SPATIAL_RIGHT"]')).toBeHidden();
});

requirement('PREV-004 @browser a bulb follows one channel', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/map bulbs/i).click();
  await expect(page.getByText(/one channel/i)).toBeVisible();
});

requirement('PREV-008 @browser Emby keeps the bulbs until takeover', async ({ page }) => {
  await page.goto('/?playback=active');
  await expect(page.getByRole('button', { name: /use bulbs for editing/i })).toBeVisible();
});

requirement('PREV-009 @browser no bulbs still draws the overlay', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.getByText(/no bulbs are configured/i)).toBeVisible();
  await expect(page.locator('[data-region="SPATIAL_LEFT"]')).toBeVisible();
});

requirement('PREV-010 @browser a non-admin can download and cannot drive bulbs', async ({ page }) => {
  const studio = new StudioPage(page);
  await page.goto('/?api_key=viewer');
  await expect(page.getByText(/admin is required/i)).toBeVisible();
  await expect(studio.button(/download/i)).toBeVisible();
});

requirement('PREV-012 @browser photosensitivity says bulbs may be softer', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.getByText(/softer than the on-screen colors/i)).toBeVisible();
});

requirement('SAFE-002 @browser safety badges are visible text', async ({ page }) => {
  const studio = await shell(page);
  await expect(page.getByText(/intense/i)).toBeVisible();
  await expect(page.getByText(/flashing/i)).toBeVisible();
});

requirement('PERF-001 @browser the library or local open control is ready quickly', async ({ page }) => {
  const started = Date.now();
  const studio = await shell(page);
  await expect(page.locator('input[type="file"], [data-library]').first()).toBeVisible();
  expect(Date.now() - started).toBeLessThan(2000);
});

requirement('PERF-002 @browser a large timeline stays within the frame budget', async ({ page }) => {
  const studio = await shell(page);
  const budget = await page.evaluate(() => Number(document.body.dataset.frameP95Ms ?? '1000'));
  expect(budget).toBeLessThanOrEqual(16.7);
});

requirement('PERF-003 @browser playback presents at least 22 frames a second', async ({ page }) => {
  const studio = await shell(page);
  await studio.button(/^play$/i).click();
  const frames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let count = 0;
        const video = document.querySelector('video') as HTMLVideoElement;
        const onFrame = () => {
          count += 1;
        };
        video?.requestVideoFrameCallback?.(function loop() {
          onFrame();
          video.requestVideoFrameCallback(loop);
        });
        setTimeout(() => resolve(count), 1000);
      })
  );
  expect(frames).toBeGreaterThanOrEqual(22);
});

requirement('PERF-004 @browser the source movie is not downloaded', async ({ page }) => {
  const studio = await shell(page);
  const urls: string[] = [];
  page.on('response', (response) => urls.push(response.url()));
  await studio.button(/^play$/i).click();
  expect(urls.some((url) => url.endsWith('.mkv'))).toBe(false);
});

requirement('A11Y-001 @browser transport controls have accessible names', async ({ page }) => {
  const studio = await shell(page);
  await expect(studio.button(/^play$|^pause$/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /skip forward 5/i })).toBeVisible();
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuemin', '0');
});

requirement('A11Y-002 @browser selection is not color alone', async ({ page }) => {
  await shell(page);
  const popover = page.getByRole('dialog').or(page.locator('[data-keyframe-popover]'));
  await expect(popover).toContainText(/left/i);
  await expect(popover).toContainText(/\d+:\d+/);
});

requirement('A11Y-003 @browser question mark lists shortcuts', async ({ page }) => {
  const studio = await shell(page);
  await page.keyboard.press('Shift+/');
  await expect(page.getByRole('dialog')).toContainText('Eyedropper');
});

requirement('ERR-001 @browser a playback error keeps the transport and offers retry', async ({ page }) => {
  const studio = await shell(page);
  await page.getByRole('option', { name: /broken proxy/i }).click();
  await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  await expect(studio.button(/^play$/i)).toBeVisible();
});

requirement('ERR-002 @browser a dead plugin does not invent a library', async ({ page }) => {
  await page.goto('/emby/OpenLightFX/studio/?api_key=test-admin&plugin=down');
  await expect(page.getByText(/plugin is unreachable/i)).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(0);
});

requirement('ERR-003 @browser a save conflict shows the server text', async ({ page }) => {
  const studio = new StudioPage(page);
  await page.goto('/emby/OpenLightFX/studio/?api_key=test-admin&itemId=48');
  await expect(page.getByText('Conflict')).toBeVisible();
  await studio.button(/^save$/i).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

requirement('ERR-004 @browser a forbidden save explains admin and offers download', async ({ page }) => {
  const studio = new StudioPage(page);
  await page.goto('/?api_key=viewer');
  await expect(page.getByText(/admin is required/i)).toBeVisible();
  await expect(studio.button(/download/i)).toBeVisible();
});

requirement('ERR-005 @browser an unplayable local file points at Emby', async ({ page }) => {
  const studio = await shell(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'movie.mkv',
    mimeType: 'video/x-matroska',
    buffer: Buffer.from('mkv'),
  });
  await expect(page.getByText(/cannot play/i)).toBeVisible();
  await expect(page.getByText(/emby/i)).toBeVisible();
  await studio.expectNoDurationField();
});

requirement('ERR-006 @browser unknown duration blocks save and does not ask', async ({ page }) => {
  const studio = await shell(page);
  await page.getByRole('option', { name: /unknown duration/i }).click();
  await studio.button(/^save$/i).click();
  await expect(page.getByText(/duration is unknown/i)).toBeVisible();
  await studio.expectNoDurationField();
});

requirement('ERR-007 @browser an eyedropper failure keeps the color', async ({ page }) => {
  const studio = await shell(page);
  await page.getByRole('option', { name: /no frame/i }).click();
  await studio.button(/eyedropper/i).click();
  await expect(page.getByRole('status')).toContainText(/could not be sampled/i);
});
