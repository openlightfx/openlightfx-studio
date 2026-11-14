import fs from 'node:fs';
import { expect, type Page, type APIRequestContext, type TestInfo } from '@playwright/test';
import { decodeTrack } from '../../src/lib/domain/encode';
import { layouts, loadScenario } from '../../scripts/fullstack/scenario.mjs';
import { assertObservation, waitForObservation } from '../../scripts/fullstack/observations.mjs';

const labels: Record<string, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
  'surround-left': 'Surround Left',
  'surround-right': 'Surround Right',
  ambient: 'Ambient',
};
function clock(ms: number) {
  return `${Math.floor(ms / 3600000)}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
/** Reusable UI author → save → activate → real playback → commands AND rendered-state check. */
export async function runLabScenario(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
  file = process.env.OLFX_LAB_SCENARIO_FILE!
) {
  const scenario = loadScenario(file);
  const mode = process.env.OLFX_LAB_PLAYBACK ?? 'web';
  expect(['web', 'controlled']).toContain(mode);
  testInfo.setTimeout(
    120000 +
      scenario.expectations.reduce((total, phase) => total + phase.withinMs + phase.holdMs, 0)
  );
  const base = process.env.OLFX_EMBY_URL!;
  const control = process.env.OLFX_SIMULATOR_CONTROL_URL!;
  expect(control, 'Use scripts/fullstack/lab.mjs').toBeTruthy();
  const headers = { 'X-Emby-Token': process.env.OLFX_API_KEY! };
  const health = await (await request.get(`${control}/health`)).json();
  expect(Object.keys(health.bulbs).sort()).toEqual(
    scenario.room.bulbs.map((bulb) => bulb.id).sort()
  );
  const reset = await request.post(`${control}/reset`);
  expect(reset.ok()).toBeTruthy();
  const cursor = (await reset.json()).event_id;
  const loginPage = await page.context().newPage();
  await loginPage.goto(`${base}/web/index.html`);
  await loginPage.getByText('admin', { exact: true }).click();
  await loginPage.locator('input[type=password]').fill('openlightfx-test');
  await loginPage.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(loginPage).toHaveURL(/#!\/home/, { timeout: 15000 });
  const webDeviceId = (await loginPage.evaluate(() => localStorage.getItem('_deviceId2')))!;
  await loginPage.close();
  const authHeader =
    'MediaBrowser Client="OpenLightFX Tests", Device="fullstack-play", DeviceId="openlightfx-fullstack-play", Version="1.0.0"';
  let sessionHeaders = headers;
  if (mode === 'controlled') {
    const auth = await request.post(`${base}/emby/Users/AuthenticateByName`, {
      headers: { 'X-Emby-Authorization': authHeader },
      data: { Username: 'admin', Pw: 'openlightfx-test' },
    });
    expect(auth.ok()).toBeTruthy();
    sessionHeaders = {
      'X-Emby-Token': (await auth.json()).AccessToken,
      'X-Emby-Authorization': authHeader,
    } as typeof headers;
  }
  const deviceId = mode === 'web' ? webDeviceId : 'openlightfx-fullstack-play';
  const rooms = await (await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers })).json();
  for (const room of rooms)
    expect(
      (await request.delete(`${base}/OpenLightFX/Studio/Rooms/${room.id}`, { headers })).ok()
    ).toBeTruthy();
  const studio = `${base}/emby/OpenLightFX/studio/`;
  await page.goto(`${studio}#/rooms`);
  await page.getByLabel('Room name').fill(scenario.room.name);
  await page.getByLabel('Screen (the Emby app in this room)').selectOption(deviceId);
  for (const bulb of scenario.room.bulbs) {
    const row = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: bulb.name, exact: true }) });
    await row.locator('summary').click();
    await row.getByRole('button', { name: labels[bulb.position], exact: true }).last().click();
    if (bulb.follows) {
      const chip = page.getByRole('group', { name: 'Placed bulb' }).filter({ hasText: bulb.name });
      await chip.getByRole('button', { name: 'Bulb options', exact: true }).click();
      await chip.getByLabel('Follows').selectOption(bulb.follows);
    }
  }
  await page.getByRole('button', { name: 'Save room', exact: true }).click();
  await expect(page.getByText('Room saved.', { exact: true })).toBeVisible();
  const savedRooms = await (
    await request.get(`${base}/OpenLightFX/Studio/Rooms`, { headers })
  ).json();
  expect(savedRooms).toHaveLength(1);
  expect(savedRooms[0].screen.deviceId).toBe(deviceId);
  for (const bulb of scenario.room.bulbs) {
    const assigned = savedRooms[0].bulbs.find((entry: { id: string }) => entry.id === bulb.id);
    expect(assigned?.position).toBe(bulb.position);
    expect(assigned?.follows ?? null).toBe(bulb.follows ?? null);
  }
  const items = await (await request.get(`${base}/OpenLightFX/Studio/Items`, { headers })).json();
  const movie = (Array.isArray(items) ? items : items.Items).find(
    (item: { name: string }) => item.name.toLowerCase() === scenario.movie.toLowerCase()
  );
  expect(movie, `Seeded movie ${scenario.movie}`).toBeTruthy();
  await page.goto(`${studio}#/movie/${movie.itemId}`);
  await page.getByLabel('Title', { exact: true }).fill(`${scenario.track.title} ${Date.now()}`);
  await page
    .getByRole('button', { name: new RegExp(scenario.track.layout.replace('.', '\\.')) })
    .click();
  await page.getByRole('button', { name: 'Create track', exact: true }).click();
  const channelIds = layouts[scenario.track.layout];
  await expect(page.locator('.lane')).toHaveCount(channelIds.length);
  for (const frame of scenario.track.keyframes) {
    const lane = page.locator('.lane').nth(channelIds.indexOf(frame.channel));
    const before = await lane.locator('.diamond').count();
    // Find vacant visible lane space, avoiding existing diamonds and spacing constraints.
    const x = await lane.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const occupied = [...node.querySelectorAll('.diamond')].map(
        (child) => child.getBoundingClientRect().left - box.left
      );
      for (let candidate = 20; candidate < Math.min(box.width - 20, 400); candidate += 20)
        if (occupied.every((left) => Math.abs(left - candidate) > 15)) return candidate;
      throw new Error('No vacant visible timeline space; zoom/pan is required');
    });
    await lane.click({ position: { x, y: 5 } });
    await expect(lane.locator('.diamond')).toHaveCount(before + 1);
    await page.getByLabel('Keyframe time', { exact: true }).fill(clock(frame.timeMs));
    await page.getByLabel('Keyframe time', { exact: true }).press('Tab');
    await page.getByLabel('Hex', { exact: true }).fill(frame.color.slice(1));
    await page.getByLabel('Hex', { exact: true }).press('Tab');
    await page.getByLabel('Brightness value', { exact: true }).fill(String(frame.brightness));
    await page.getByLabel('Brightness value', { exact: true }).press('Tab');
    await page.getByLabel('Fade type', { exact: true }).selectOption(frame.interpolation);
    await page.getByLabel('Fade length', { exact: true }).fill(String(frame.transitionMs));
    await page.getByLabel('Fade length', { exact: true }).press('Tab');
  }
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().includes('/Studio/Tracks/')
  );
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Watch in Emby', exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBeTruthy();
  const trackId = new URL(response.url()).pathname.split('/').at(-1)!;
  const player = await popup;
  const binary = await request.get(
    `${base}/OpenLightFX/Studio/Tracks/${trackId}?itemId=${movie.itemId}`,
    { headers }
  );
  expect(binary.ok()).toBeTruthy();
  const bytes = await binary.body();
  await testInfo.attach('authored.lightfx', {
    body: bytes,
    contentType: 'application/octet-stream',
  });
  const track = decodeTrack(bytes);
  expect(track.metadata.channelLayout).toBe(
    `LAYOUT_${scenario.track.layout === 'Ambient' ? 'AMBIENT' : scenario.track.layout.replace('.', '_')}`
  );
  expect(track.channels.map((channel) => channel.id)).toEqual(channelIds);
  expect(track.keyframes).toHaveLength(scenario.track.keyframes.length);
  expect(track.effects).toHaveLength(0);
  for (const channel of track.channels) expect(channel.defaultBrightness).toBe(0);
  for (const frame of scenario.track.keyframes) {
    const authored = track.keyframes.find(
      (entry) => entry.channelId === frame.channel && entry.timestampMs === frame.timeMs
    );
    expect(authored, `Exact saved cue ${frame.channel}@${frame.timeMs}`).toBeTruthy();
    expect(authored!.brightness).toBe(frame.brightness);
    expect(authored!.interpolation).toBe(frame.interpolation);
    expect(authored!.transitionMs).toBe(frame.transitionMs);
    expect(
      '#' +
        [authored!.color.r, authored!.color.g, authored!.color.b]
          .map((component) => component.toString(16).padStart(2, '0'))
          .join('')
    ).toBe(frame.color);
  }
  const received = () =>
    fs
      .readFileSync(process.env.OLFX_NDJSON!, 'utf8')
      .split('\n')
      .flatMap((line) => {
        try {
          const event = JSON.parse(line);
          return event.event === 'command_received' ? [event] : [];
        } catch {
          return [];
        }
      });
  let playing: Record<string, unknown> | null = null;
  if (mode === 'controlled') {
    const playback = await request.post(`${base}/emby/Items/${movie.itemId}/PlaybackInfo`, {
      headers: sessionHeaders,
      data: {},
    });
    expect(playback.ok()).toBeTruthy();
    playing = {
      ItemId: movie.itemId,
      MediaSourceId: (await playback.json()).MediaSources[0].Id,
      PlaySessionId: `lab-${Date.now()}`,
      PositionTicks: 0,
      CanSeek: true,
      PlayMethod: 'DirectPlay',
    };
  } else
    await expect(player.getByRole('button', { name: 'Play', exact: true })).toBeVisible({
      timeout: 15000,
    });
  const startedAt = Date.now();
  let epoch = startedAt;
  let after = cursor;
  let commandAfter = startedAt;
  const results: unknown[] = [];
  let started = false;
  try {
    started = true;
    if (playing) {
      expect(
        (
          await request.post(`${base}/emby/Sessions/Playing`, {
            headers: sessionHeaders,
            data: playing,
          })
        ).ok()
      ).toBeTruthy();
    } else {
      await player.getByRole('button', { name: 'Play', exact: true }).click();
      const video = player.locator('video:visible');
      await expect(video).toBeVisible({ timeout: 15000 });
      await expect
        .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), {
          timeout: 15000,
        })
        .toBeGreaterThan(0);
      epoch = await video.evaluate(
        (element: HTMLVideoElement) => Date.now() - element.currentTime * 1000
      );
    }
    for (const phase of scenario.expectations) {
      const sample = await waitForObservation(
        control,
        { after, bulbs: phase.bulbs },
        phase.withinMs
      );
      const elapsedMs = Date.parse(sample.ts) - epoch;
      const commands: unknown[] = [];
      results.push({
        name: phase.name,
        expectedBulbs: phase.bulbs,
        expectedCommands: phase.commands,
        elapsedMs,
        sample,
        commands,
      });
      for (const command of phase.commands) {
        const hex = command.color.slice(1);
        const rgb = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
        const match = () =>
          received().find(
            (event) =>
              Date.parse(event.ts) >= commandAfter &&
              event.bulb_id === command.bulbId &&
              ['r', 'g', 'b'].every((key, index) => Number(event.params[key]) === rgb[index]) &&
              Number(event.params.brightness) === command.brightness &&
              String(event.params.power) === String(command.power)
          );
        await expect
          .poll(match, { timeout: 3000, message: `Fresh receipt: ${phase.name}/${command.bulbId}` })
          .toBeTruthy();
        const event = match()!;
        commands.push(event);
        const commandElapsedMs = Date.parse(event.ts) - epoch;
        if (command.minElapsedMs !== undefined)
          expect(commandElapsedMs).toBeGreaterThanOrEqual(command.minElapsedMs);
        if (command.maxElapsedMs !== undefined)
          expect(commandElapsedMs).toBeLessThanOrEqual(command.maxElapsedMs);
      }
      commandAfter = Date.parse(sample.ts);
      // Attach before timing assertions so failures retain measurements.
      await testInfo.attach(`phase-${results.length}.json`, {
        body: Buffer.from(JSON.stringify(results.at(-1), null, 2)),
        contentType: 'application/json',
      });
      if (phase.minElapsedMs !== undefined)
        expect(elapsedMs).toBeGreaterThanOrEqual(phase.minElapsedMs);
      if (phase.maxElapsedMs !== undefined)
        expect(elapsedMs).toBeLessThanOrEqual(phase.maxElapsedMs);
      after = sample.event_id;
      if (phase.holdMs) {
        await page.waitForTimeout(phase.holdMs);
        const samples = await (await request.get(`${control}/events?after=${after}`)).json();
        const held = samples.filter(
          (entry: { ts: string }) => Date.parse(entry.ts) <= Date.parse(sample.ts) + phase.holdMs
        );
        expect(held.length).toBeGreaterThan(Math.floor(phase.holdMs / 100));
        for (const entry of held) assertObservation([entry], { after, bulbs: phase.bulbs });
        after = held.at(-1)?.event_id ?? after;
      }
      const wrong = structuredClone(phase.bulbs);
      const bulbId = Object.keys(wrong)[0];
      wrong[bulbId].power = !wrong[bulbId].power;
      expect(() => assertObservation([sample], { after: cursor, bulbs: wrong })).toThrow();
    }
  } finally {
    await testInfo.attach('expected-observed.json', {
      body: Buffer.from(
        JSON.stringify(
          {
            scenarioName: scenario.name,
            expectedTrack: scenario.track,
            mode,
            trackId,
            startedAt,
            epoch,
            results,
          },
          null,
          2
        )
      ),
      contentType: 'application/json',
    });
    if (started) {
      const beforeStop = await (await request.get(`${control}/state`)).json();
      if (playing)
        expect(
          (
            await request.post(`${base}/emby/Sessions/Playing/Stopped`, {
              headers: sessionHeaders,
              data: playing,
            })
          ).ok()
        ).toBeTruthy();
      else await player.keyboard.press('Control+Shift+s');
      const off = Object.fromEntries(
        scenario.room.bulbs.map((bulb) => [
          bulb.id,
          { r: 0, g: 0, b: 0, brightness: 0, power: false },
        ])
      );
      await waitForObservation(control, { after: beforeStop.event_id, bulbs: off }, 15000);
    }
    await player.close();
  }
}
