import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const browser = process.env.OLFX_LAB_BROWSER ?? 'chromium';
if (!['chromium', 'firefox'].includes(browser)) throw new Error('Invalid browser');
test.use({ browserName: browser as 'chromium' | 'firefox' });

function receipts() {
  return readFileSync(process.env.OLFX_NDJSON!, 'utf8')
    .split('\n')
    .flatMap((line) => {
      try {
        const event = JSON.parse(line);
        return event.event === 'command_received' ? [event] : [];
      } catch {
        return [];
      }
    });
}

test('LAB- active track and None control actual Emby playback', async ({ page, request }) => {
  test.setTimeout(120_000);
  if (process.env.OLFX_LAB !== '1') throw new Error('Isolated lab required');
  const base = process.env.OLFX_EMBY_URL!;
  const control = process.env.OLFX_SIMULATOR_CONTROL_URL!;
  const headers = { 'X-Emby-Token': process.env.OLFX_API_KEY! };
  const authorization =
    'MediaBrowser Client="OpenLightFX Tests", Device="Active Track TV", DeviceId="active-track-tv", Version="1.0"';
  const login = await request.post(`${base}/emby/Users/AuthenticateByName`, {
    headers: { 'X-Emby-Authorization': authorization },
    data: { Username: 'admin', Pw: 'openlightfx-test' },
  });
  expect(login.ok()).toBeTruthy();
  const sessionHeaders = {
    'X-Emby-Token': (await login.json()).AccessToken,
    'X-Emby-Authorization': authorization,
  };
  const items = await (await request.get(`${base}/OpenLightFX/Studio/Items`, { headers })).json();
  const movie = items.find((item: { name: string }) => item.name === 'clip-a');
  expect(movie).toBeTruthy();
  const existingRooms = await (
    await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers })
  ).json();
  for (const room of existingRooms)
    expect(
      (await request.delete(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, { headers })).ok()
    ).toBeTruthy();

  const room = await request.post(`${base}/OpenLightFX/Studio/Rooms`, {
    headers,
    data: {
      name: 'Selection lab',
      screenDeviceId: 'active-track-tv',
      bulbs: [
        { id: 'left', position: 'left', follows: null },
        { id: 'right', position: 'right', follows: null },
      ],
    },
  });
  expect(room.ok(), await room.text()).toBeTruthy();
  const createdRoom = await room.json();
  const roomId = createdRoom.id;
  await page.goto(`${base}/web/index.html`);
  await page.getByText('admin', { exact: true }).click();
  await page.locator('input[type=password]').fill('openlightfx-test');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/#!\/home/, { timeout: 15000 });
  const webDeviceId = await page.evaluate(() => localStorage.getItem('_deviceId2'));
  expect(webDeviceId).toBeTruthy();
  const trackId = `active-track-${Date.now()}`;
  const save = await request.put(
    `${base}/OpenLightFX/Studio/Tracks/${trackId}?itemId=${movie.itemId}`,
    {
      headers: { ...headers, 'Content-Type': 'application/octet-stream' },
      data: readFileSync('tests/fixtures/sampling/roundtrip.lightfx'),
    }
  );
  expect(save.ok(), await save.text()).toBeTruthy();
  await page.goto(`${base}/emby/OpenLightFX/studio/#/movie/${movie.itemId}`);
  const selector = page.getByLabel('Active Track');
  await expect(selector).toBeEnabled();
  await selector.selectOption('none');
  await expect(page.getByRole('status')).toContainText('Lighting is off for this movie.');
  await page.reload();
  await expect(selector).toHaveValue('none');
  const embyLink = page.getByRole('link', { name: 'Go To Emby' });
  await expect(embyLink).toHaveAttribute(
    'href',
    new RegExp(`/web/index.html#!/item\\?id=${movie.itemId}`)
  );
  const embyResponse = await request.get(`${base}/emby/web/index.html`);
  expect(embyResponse.ok()).toBeTruthy();

  const info = await request.post(`${base}/emby/Items/${movie.itemId}/PlaybackInfo`, {
    headers: sessionHeaders,
    data: {},
  });
  expect(info.ok()).toBeTruthy();
  const source = (await info.json()).MediaSources[0].Id;
  const playing = {
    ItemId: movie.itemId,
    MediaSourceId: source,
    PlaySessionId: `lab-none-${Date.now()}`,
    PositionTicks: 0,
    CanSeek: true,
    PlayMethod: 'DirectPlay',
  };
  const reset = await request.post(`${control}/reset`);
  expect(reset.ok()).toBeTruthy();
  const noneCursor = (await reset.json()).event_id;
  const before = receipts().length;
  const start = await request.post(`${base}/emby/Sessions/Playing`, {
    headers: sessionHeaders,
    data: playing,
  });
  expect(start.ok()).toBeTruthy();
  await page.waitForTimeout(3000); // Observation window: prove no commands during active playback.
  const sessions = await (await request.get(`${base}/emby/Sessions`, { headers })).json();
  expect(
    sessions.some(
      (session: { DeviceId: string; NowPlayingItem?: { Id: string } }) =>
        session.DeviceId === 'active-track-tv' && session.NowPlayingItem?.Id === movie.itemId
    )
  ).toBeTruthy();
  expect(receipts().slice(before)).toEqual([]);
  const noneSamples = await (await request.get(`${control}/events?after=${noneCursor}`)).json();
  expect(noneSamples.length).toBeGreaterThan(5);
  for (const sample of noneSamples) {
    expect(sample.bulbs.left.power).toBe(false);
    expect(sample.bulbs.right.power).toBe(false);
  }
  expect(
    (
      await request.post(`${base}/emby/Sessions/Playing/Stopped`, {
        headers: sessionHeaders,
        data: playing,
      })
    ).ok()
  ).toBeTruthy();

  await selector.selectOption(`track:${trackId}`);
  await expect(page.getByRole('status')).toContainText('Active track saved.');
  await page.reload();
  await expect(selector).toHaveValue(`track:${trackId}`);
  const forbidden = await request.post(
    `${base}/OpenLightFX/Studio/Items/${movie.itemId}/ActiveTrack`,
    {
      headers: { 'X-Emby-Token': process.env.OLFX_VIEWER_TOKEN! },
      data: { disabled: true },
    }
  );
  expect([401, 403]).toContain(forbidden.status());
  const selected = await (
    await request.get(`${base}/OpenLightFX/Tracks/ByItem?ItemId=${movie.itemId}`, { headers })
  ).json();
  expect(selected.globalSelectedTrack).toContain(`${trackId}.lightfx`);
  const cursor = receipts().length;
  const observationCursor = (await (await request.get(`${control}/state`)).json()).event_id;
  const playingSelected = { ...playing, PlaySessionId: `lab-selected-${Date.now()}` };
  try {
    expect(
      (
        await request.post(`${base}/emby/Sessions/Playing`, {
          headers: sessionHeaders,
          data: playingSelected,
        })
      ).ok()
    ).toBeTruthy();
    await expect
      .poll(
        () =>
          receipts()
            .slice(cursor)
            .some((event) => {
              const p = event.params;
              return (
                event.bulb_id === 'left' &&
                Number(p?.r) === 10 &&
                Number(p?.g) === 20 &&
                Number(p?.b) === 30 &&
                Number(p?.brightness) === 40
              );
            }),
        { timeout: 10000 }
      )
      .toBeTruthy();
    await expect
      .poll(
        async () => {
          const samples = await (
            await request.get(`${control}/events?after=${observationCursor}`)
          ).json();
          return samples.some((sample: any) => {
            const left = sample.bulbs.left;
            const right = sample.bulbs.right;
            return (
              left.power &&
              Math.abs(left.r - 10) <= 2 &&
              Math.abs(left.g - 20) <= 2 &&
              Math.abs(left.b - 30) <= 2 &&
              Math.abs(left.brightness - 40) <= 2 &&
              !right.power
            );
          });
        },
        { timeout: 10000 }
      )
      .toBeTruthy();
  } finally {
    await request.post(`${base}/emby/Sessions/Playing/Stopped`, {
      headers: sessionHeaders,
      data: playingSelected,
    });
  }
  const webRoom = await request.put(`${base}/OpenLightFX/Studio/Rooms/${roomId}`, {
    headers: { ...headers, 'If-Match': createdRoom.updatedAt },
    data: {
      name: 'Selection lab',
      screenDeviceId: webDeviceId,
      bulbs: [
        { id: 'left', position: 'left', follows: null },
        { id: 'right', position: 'right', follows: null },
      ],
    },
  });
  expect(webRoom.ok(), await webRoom.text()).toBeTruthy();
  const webReset = await request.post(`${control}/reset`);
  expect(webReset.ok()).toBeTruthy();
  const webObservationCursor = (await webReset.json()).event_id;
  const webCursor = receipts().length;
  await embyLink.click();
  await expect(page).toHaveURL(new RegExp(`/web/index.html#!/item\\?id=${movie.itemId}`));
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeVisible({ timeout: 15000 });
  try {
    await play.click();
    const video = page.locator('video:visible');
    await expect(video).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), {
        timeout: 15000,
      })
      .toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          receipts()
            .slice(webCursor)
            .some(
              (event) =>
                event.bulb_id === 'left' &&
                Number(event.params?.r) === 10 &&
                Number(event.params?.g) === 20 &&
                Number(event.params?.b) === 30 &&
                Number(event.params?.brightness) === 40
            ),
        { timeout: 10000 }
      )
      .toBeTruthy();
    await expect
      .poll(
        async () => {
          const samples = await (
            await request.get(`${control}/events?after=${webObservationCursor}`)
          ).json();
          return samples.some((sample: any) => {
            const left = sample.bulbs.left;
            return (
              left.power &&
              Math.abs(left.r - 10) <= 2 &&
              Math.abs(left.g - 20) <= 2 &&
              Math.abs(left.b - 30) <= 2 &&
              Math.abs(left.brightness - 40) <= 2 &&
              !sample.bulbs.right.power
            );
          });
        },
        { timeout: 10000 }
      )
      .toBeTruthy();
  } finally {
    await page.keyboard.press('Control+Shift+s');
  }
});
