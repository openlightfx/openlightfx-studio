import { test, expect } from '@playwright/test';
import { decodeTrack } from '../../src/lib/domain/encode';
import { assertObservation, waitForObservation } from '../../scripts/fullstack/observations.mjs';

const channels = ['left', 'center', 'right', 'surround-left', 'surround-right'];
const frames = [
  { channel: 'left', timeMs: 1340, hex: '00ff00' },
  { channel: 'right', timeMs: 2330, hex: 'ff0000' },
];
const dark = { r: 0, g: 0, b: 0, brightness: 0, power: false };
const green = {
  r: 0,
  g: 255,
  b: 0,
  brightness: 100,
  power: true,
  display_color: { r: 0, g: 255, b: 0 },
};
const red = {
  r: 255,
  g: 0,
  b: 0,
  brightness: 100,
  power: true,
  display_color: { r: 255, g: 0, b: 0 },
};

test('LAB-FIVE 5.0: left green at 1.340s, right red at 2.330s in actual Emby Web playback', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  const base = process.env.OLFX_EMBY_URL!;
  const control = process.env.OLFX_SIMULATOR_CONTROL_URL!;
  expect(control, 'Use the isolated lab runner').toBeTruthy();
  const headers = { 'X-Emby-Token': process.env.OLFX_API_KEY! };
  const reset = await request.post(`${control}/reset`);
  expect(reset.ok()).toBeTruthy();
  const cursor = (await reset.json()).event_id;
  const loginPage = await page.context().newPage();
  await loginPage.goto(`${base}/web/index.html`);
  await loginPage.getByText('admin', { exact: true }).click();
  await loginPage.locator('input[type=password]').fill('openlightfx-test');
  await loginPage.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(loginPage).toHaveURL(/#!\/home/, { timeout: 15000 });
  const deviceId = (await loginPage.evaluate(() => localStorage.getItem('_deviceId2')))!;
  await loginPage.close();
  const rooms = await (await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers })).json();
  for (const room of rooms) {
    expect(
      (await request.delete(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, { headers })).ok()
    ).toBeTruthy();
  }
  const studio = `${base}/emby/OpenLightFX/studio/`;
  // Use the Emby Web credential already in same-origin storage; no token in the URL.
  await page.goto(`${studio}#/rooms`);
  await page.getByLabel('Room name').fill('Five channel timing lab');
  await page.getByLabel('Screen (the Emby app in this room)').selectOption(deviceId);
  for (const name of ['Left', 'Right']) {
    const row = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name, exact: true }) });
    await row.locator('summary').click();
    await row.getByRole('button', { name, exact: true }).last().click();
  }
  await page.getByRole('button', { name: 'Save room', exact: true }).click();
  await expect(page.getByText('Room saved.', { exact: true })).toBeVisible();
  const items = await (await request.get(`${base}/OpenLightFX/Studio/Items`, { headers })).json();
  const movie = (Array.isArray(items) ? items : items.Items).find((item: { name: string }) =>
    /clip-a/i.test(item.name)
  );
  expect(movie).toBeTruthy();
  await page.goto(`${studio}#/movie/${movie.itemId}`);
  await page.getByLabel('Title', { exact: true }).fill(`5.0 Green 1.340 Red 2.330 ${Date.now()}`);
  await page.getByRole('button', { name: /5\.0/ }).click();
  await page.getByRole('button', { name: 'Create track', exact: true }).click();
  await expect(page.locator('.lane')).toHaveCount(5);
  for (const frame of frames) {
    await page
      .locator('.lane')
      .nth(channels.indexOf(frame.channel))
      .click({ position: { x: 10 + frame.timeMs / 10, y: 20 } });
    await page
      .getByLabel('Keyframe time', { exact: true })
      .fill(`0:00:${(frame.timeMs / 1000).toFixed(3).padStart(6, '0')}`);
    await page.getByLabel('Keyframe time', { exact: true }).press('Tab');
    await page.getByLabel('Hex', { exact: true }).fill(frame.hex);
    await page.getByLabel('Hex', { exact: true }).press('Tab');
    await page.getByLabel('Brightness value', { exact: true }).fill('100');
    await page.getByLabel('Brightness value', { exact: true }).press('Tab');
    await page.getByLabel('Fade type', { exact: true }).selectOption('STEP');
  }
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().includes('/Studio/Tracks/')
  );
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Watch in Emby', exact: true }).click();
  const saveResponse = await saved;
  expect(saveResponse.ok()).toBeTruthy();
  const trackId = new URL(saveResponse.url()).pathname.split('/').at(-1)!;
  const player = await popup;
  const binary = await request.get(
    `${base}/OpenLightFX/Studio/Tracks/${trackId}?itemId=${movie.itemId}`,
    { headers }
  );
  expect(binary.ok()).toBeTruthy();
  const bytes = await binary.body();
  await testInfo.attach('five-channel.lightfx', {
    body: bytes,
    contentType: 'application/octet-stream',
  });
  const track = decodeTrack(bytes);
  expect(track.metadata.channelLayout).toBe('LAYOUT_5_0');
  expect(track.channels.map((channel) => channel.id)).toEqual(channels);
  expect(track.keyframes).toHaveLength(2);
  expect(track.effects).toHaveLength(0);
  for (const channel of track.channels) expect(channel.defaultBrightness).toBe(0);
  for (const frame of frames) {
    const keyframe = track.keyframes.find((entry) => entry.channelId === frame.channel)!;
    expect(keyframe.timestampMs).toBe(frame.timeMs);
    expect(keyframe.brightness).toBe(100);
    expect(keyframe.interpolation).toBe('STEP');
    expect([keyframe.color.r, keyframe.color.g, keyframe.color.b]).toEqual(
      frame.channel === 'left' ? [0, 255, 0] : [255, 0, 0]
    );
  }
  await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeVisible({
    timeout: 15000,
  });
  try {
    await player.getByRole('button', { name: 'Play', exact: true }).click();
    const video = player.locator('video:visible');
    await expect(video).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), {
        timeout: 15000,
      })
      .toBeGreaterThan(0);
    const clock = await video.evaluate((element: HTMLVideoElement) => ({
      now: Date.now(),
      timeMs: element.currentTime * 1000,
    }));
    const epoch = clock.now - clock.timeMs;
    const first = await waitForObservation(
      control,
      { after: cursor, bulbs: { left: green, right: dark } },
      5000
    );
    const second = await waitForObservation(
      control,
      { after: first.event_id, bulbs: { left: green, right: red } },
      5000
    );
    const samples = await (await request.get(`${control}/events?after=${cursor}`)).json();
    const elapsed = (sample: { ts: string }) => Date.parse(sample.ts) - epoch;
    await testInfo.attach('timing-observed.json', {
      body: Buffer.from(
        JSON.stringify(
          {
            trackId,
            frames,
            clock,
            firstElapsedMs: elapsed(first),
            secondElapsedMs: elapsed(second),
            first,
            second,
            samples,
          },
          null,
          2
        )
      ),
      contentType: 'application/json',
    });
    // REST driver enforces a 250ms fade; allow another 200ms for scheduling/clock skew,
    // but prove the lights do not illuminate before the authored cues.
    const early = samples.filter(
      (sample: { ts: string }) => elapsed(sample) >= 0 && elapsed(sample) < 1190
    );
    expect(early.length).toBeGreaterThan(5);
    for (const sample of early) {
      expect(sample.bulbs.left.brightness).toBe(0);
      expect(sample.bulbs.right.brightness).toBe(0);
    }
    const beforeRight = samples.filter(
      (sample: { ts: string }) => elapsed(sample) >= 1700 && elapsed(sample) < 2180
    );
    expect(beforeRight.length).toBeGreaterThan(5);
    for (const sample of beforeRight) expect(sample.bulbs.right.brightness).toBe(0);
    expect(elapsed(first)).toBeGreaterThanOrEqual(1190);
    expect(elapsed(first)).toBeLessThan(1790);
    expect(elapsed(second)).toBeGreaterThanOrEqual(2180);
    expect(elapsed(second)).toBeLessThan(2780);
    expect(() =>
      assertObservation([second], { after: cursor, bulbs: { left: red, right: green } })
    ).toThrow();
    await testInfo.attach('expected-observed.json', {
      body: Buffer.from(
        JSON.stringify(
          {
            trackId,
            channels,
            frames,
            clock,
            first,
            second,
            firstElapsedMs: elapsed(first),
            secondElapsedMs: elapsed(second),
            earlySamples: early.length,
            beforeRightSamples: beforeRight.length,
            samples,
          },
          null,
          2
        )
      ),
      contentType: 'application/json',
    });
  } finally {
    const beforeStop = await (await request.get(`${control}/state`)).json();
    await player.keyboard.press('Control+Shift+s');
    await waitForObservation(
      control,
      { after: beforeStop.event_id, bulbs: { left: dark, right: dark } },
      15000
    );
    await player.close();
  }
});
