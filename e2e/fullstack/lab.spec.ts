import { test, expect } from '@playwright/test';
import { waitForObservation } from '../../scripts/fullstack/observations.mjs';
import scenario from '../../tests/fixtures/lab/stereo.json' with { type: 'json' };
import { decodeTrack } from '../../src/lib/domain/encode';

const mode = process.env.OLFX_LAB_PLAYBACK ?? 'controlled';
test(`LAB- ${mode} Emby playback: UI authors, saves, activates and lights both bulbs`, async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const base = process.env.OLFX_EMBY_URL!;
  const control = process.env.OLFX_SIMULATOR_CONTROL_URL;
  expect(control, 'Run through scripts/fullstack/lab.mjs').toBeTruthy();
  const headers = { 'X-Emby-Token': process.env.OLFX_API_KEY! };
  const reset = await request.post(`${control}/reset`);
  expect(reset.ok()).toBeTruthy();
  const cursor = (await reset.json()).event_id;
  const items = await (await request.get(`${base}/OpenLightFX/Studio/Items`, { headers })).json();
  const movie = (Array.isArray(items) ? items : items.Items).find((item: { name: string }) =>
    /clip-a/i.test(item.name)
  );
  if (movie) movie.id = movie.itemId;
  expect(movie).toBeTruthy();
  let screenDeviceId = 'openlightfx-fullstack-play';
  if (mode === 'web') {
    const loginPage = await page.context().newPage();
    await loginPage.goto(`${base}/web/index.html`);
    await loginPage.getByText('admin', { exact: true }).click();
    await loginPage.locator('input[type=password]').fill('openlightfx-test');
    await loginPage.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(loginPage).toHaveURL(/#!\/home/, { timeout: 15000 });
    screenDeviceId = (await loginPage.evaluate(() => localStorage.getItem('_deviceId2')))!;
    await loginPage.close();
  } else {
    const registered = await request.post(`${base}/emby/Users/AuthenticateByName`, {
      headers: {
        'X-Emby-Authorization':
          'MediaBrowser Client="OpenLightFX Tests", Device="fullstack-play", DeviceId="openlightfx-fullstack-play", Version="1.0.0"',
      },
      data: { Username: 'admin', Pw: 'openlightfx-test' },
    });
    expect(registered.ok()).toBeTruthy();
  }
  const roomsBefore = await (
    await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers })
  ).json();
  for (const room of roomsBefore) {
    expect(
      (await request.delete(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, { headers })).ok()
    ).toBeTruthy();
  }
  await page.goto(`${base}/emby/OpenLightFX/studio/?api_key=${process.env.OLFX_API_KEY}#/rooms`);
  await page.getByLabel('Room name').fill('Fullstack Room');
  await page.getByLabel('Screen (the Emby app in this room)').selectOption(screenDeviceId);
  for (const name of ['Left', 'Right']) {
    const row = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name, exact: true }) });
    await row.locator('summary').click();
    await row.getByRole('button', { name, exact: true }).last().click();
  }
  await page.getByRole('button', { name: 'Save room', exact: true }).click();
  await expect(page.getByText('Room saved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Placed bulb' })).toHaveCount(2);
  await page.goto(
    `${base}/emby/OpenLightFX/studio/?api_key=${process.env.OLFX_API_KEY}#/movie/${movie.id}`
  );
  await page.getByLabel('Title', { exact: true }).fill(`Lab ${Date.now()}`);
  await page.getByRole('button', { name: /2\.0/ }).click();
  await page.getByRole('button', { name: 'Create track', exact: true }).click();
  await expect(page.locator('.lane')).toHaveCount(2);
  for (const frame of scenario.keyframes) {
    const lane = page.locator('.lane').nth(frame.channel === 'left' ? 0 : 1);
    await lane.click({ position: { x: 10 + frame.timeMs / 10, y: 20 } });
    await page
      .getByLabel('Keyframe time', { exact: true })
      .fill(`0:00:${(frame.timeMs / 1000).toFixed(3).padStart(6, '0')}`);
    await page.getByLabel('Keyframe time', { exact: true }).press('Tab');
    await page.getByLabel('Hex', { exact: true }).fill(frame.hex.slice(1));
    await page.getByLabel('Hex', { exact: true }).press('Tab');
    await page.getByLabel('Brightness value', { exact: true }).fill(String(frame.brightness));
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
  const embyPage = await popup;
  await expect(embyPage).toHaveURL(/web\/index.html.*item/);
  const binary = await request.get(
    `${base}/OpenLightFX/Studio/Tracks/${trackId}?itemId=${movie.id}`,
    { headers }
  );
  expect(binary.ok()).toBeTruthy();
  const bytes = await binary.body();
  await testInfo.attach('authored.lightfx', {
    body: bytes,
    contentType: 'application/octet-stream',
  });
  const track = decodeTrack(bytes);
  expect(track.keyframes).toHaveLength(scenario.keyframes.length);
  for (const frame of scenario.keyframes) {
    const channel = track.channels.find((entry) => entry.id === frame.channel)!;
    const authored = track.keyframes.find(
      (entry) => entry.channelId === channel.id && Math.abs(entry.timestampMs - frame.timeMs) < 42
    )!;
    expect(authored).toBeTruthy();
    expect(authored.brightness).toBe(frame.brightness);
    expect(
      '#' +
        [authored.color.r, authored.color.g, authored.color.b]
          .map((component) => component.toString(16).padStart(2, '0'))
          .join('')
    ).toBe(frame.hex);
  }
  const off = {
    left: { r: 0, g: 0, b: 0, brightness: 0, power: false },
    right: { r: 0, g: 0, b: 0, brightness: 0, power: false },
  };
  if (mode === 'web') {
    await expect(embyPage.getByRole('button', { name: 'Play', exact: true })).toBeVisible({
      timeout: 15000,
    });
    const deviceId = await embyPage.evaluate(() => localStorage.getItem('_deviceId2'));
    expect(deviceId).toBeTruthy();
    const rooms = await (await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers })).json();
    const room = rooms.find((entry: { name: string }) => entry.name === 'Fullstack Room');
    expect(room.screen.deviceId).toBe(deviceId);
    try {
      const play = embyPage.getByRole('button', { name: 'Play', exact: true });
      await play.click();
      const video = embyPage.locator('video:visible');
      await expect(video).toBeVisible({ timeout: 15000 });
      await expect
        .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), {
          timeout: 15000,
        })
        .toBeGreaterThan(0);
      const first = await waitForObservation(
        control!,
        { after: cursor, bulbs: scenario.expectedAtStart },
        5000
      );
      const changed = await waitForObservation(
        control!,
        { after: first.event_id, bulbs: scenario.expectedAfterChange },
        7000
      );
      await testInfo.attach('expected-observed.json', {
        body: Buffer.from(JSON.stringify({ mode, scenario, first, changed }, null, 2)),
        contentType: 'application/json',
      });
    } finally {
      const beforeStop = await (await request.get(`${control}/state`)).json();
      // Emby Web's Stop shortcut: closing a tab does not reliably report playback stopped.
      await embyPage.keyboard.press('Control+Shift+s');
      await waitForObservation(control!, { after: beforeStop.event_id, bulbs: off }, 15000);
      await embyPage.close();
    }
    return;
  }
  expect(mode).toBe('controlled');
  const authHeader =
    'MediaBrowser Client="OpenLightFX Tests", Device="fullstack-play", DeviceId="openlightfx-fullstack-play", Version="1.0.0"';
  const login = await request.post(`${base}/emby/Users/AuthenticateByName`, {
    headers: { 'X-Emby-Authorization': authHeader },
    data: { Username: 'admin', Pw: 'openlightfx-test' },
  });
  expect(login.ok()).toBeTruthy();
  const sessionHeaders = {
    'X-Emby-Token': (await login.json()).AccessToken,
    'X-Emby-Authorization': authHeader,
  };
  const playback = await request.post(`${base}/emby/Items/${movie.id}/PlaybackInfo`, {
    headers: sessionHeaders,
    data: {},
  });
  const source = (await playback.json()).MediaSources[0].Id;
  const playing = {
    ItemId: movie.id,
    MediaSourceId: source,
    PlaySessionId: `lab-${Date.now()}`,
    PositionTicks: 0,
    CanSeek: true,
    PlayMethod: 'DirectPlay',
  };
  try {
    const start = await request.post(`${base}/emby/Sessions/Playing`, {
      headers: sessionHeaders,
      data: playing,
    });
    expect(start.ok()).toBeTruthy();
    const first = await waitForObservation(
      control!,
      { after: cursor, bulbs: scenario.expectedAtStart },
      5000
    );
    const changed = await waitForObservation(
      control!,
      { after: first.event_id, bulbs: scenario.expectedAfterChange },
      7000
    );
    await testInfo.attach('expected-observed.json', {
      body: Buffer.from(JSON.stringify({ scenario, first, changed }, null, 2)),
      contentType: 'application/json',
    });
  } finally {
    const beforeStop = await (await request.get(`${control}/state`)).json();
    await request.post(`${base}/emby/Sessions/Playing/Stopped`, {
      headers: sessionHeaders,
      data: playing,
    });
    await embyPage.close();
    await waitForObservation(control!, { after: beforeStop.event_id, bulbs: off }, 15000);
  }
});
