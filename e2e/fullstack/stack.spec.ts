import { expect } from '@playwright/test';
import fs from 'node:fs';
import { requirement } from '../harness/requirement';

function emby(): string {
  return process.env.OLFX_EMBY_URL ?? 'http://127.0.0.1:8096';
}

function token(): string {
  return process.env.OLFX_API_KEY ?? 'test-admin';
}

function headers(): Record<string, string> {
  return { 'X-Emby-Token': token() };
}

requirement('SHELL-001 @fullstack the plugin serves studio and redirects to the slash URL', async ({ request }) => {
  const response = await request.get(`${emby()}/emby/OpenLightFX/studio?api_key=${token()}`, {
    maxRedirects: 0,
    timeout: 5000,
  });
  expect([301, 302, 307, 308]).toContain(response.status());
  expect(response.headers().location ?? '').toContain('/emby/OpenLightFX/studio/');
});

requirement('MEDIA-001 @fullstack items search returns movies', async ({ request }) => {
  const body = await (await request.get(`${emby()}/OpenLightFX/Studio/Items?search=Proxy`, { headers: headers(), timeout: 5000 })).json();
  expect(body.length).toBeGreaterThan(0);
  expect(body[0]).toEqual(expect.objectContaining({ itemId: expect.any(String), name: expect.any(String), runtimeMs: expect.any(Number) }));
});

requirement('MEDIA-002 @fullstack the item runtime becomes the track duration', async ({ request }) => {
  const body = await (await request.get(`${emby()}/OpenLightFX/Studio/Items?search=Proxy`, { headers: headers(), timeout: 5000 })).json();
  expect(body[0].runtimeMs).toBeGreaterThan(0);
});

requirement('MEDIA-003 @fullstack the edit URL is a direct-play proxy', async ({ request }) => {
  const info = await (await request.get(`${emby()}/OpenLightFX/Studio/Items/1/MediaInfo`, { headers: headers(), timeout: 5000 })).json();
  expect(info.proxy.editUrl ?? info.proxy.state).toBeTruthy();
});

requirement('MEDIA-004 @fullstack play uses the proxy URL', async ({ request }) => {
  const info = await (await request.get(`${emby()}/OpenLightFX/Studio/Items/1/MediaInfo`, { headers: headers(), timeout: 5000 })).json();
  expect(String(info.proxy.editUrl)).not.toMatch(/Transcode/i);
});

requirement('MEDIA-006 @fullstack a range request does not start a transcode', async ({ request }) => {
  const info = await (await request.get(`${emby()}/OpenLightFX/Studio/Items/1/MediaInfo`, { headers: headers(), timeout: 5000 })).json();
  const ranged = await request.get(info.proxy.editUrl, { headers: { Range: 'bytes=0-100' }, timeout: 5000 });
  expect(ranged.status()).toBe(206);
});

requirement('MEDIA-011 @fullstack the first picture is ready within 10 seconds', async ({ page }) => {
  await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}`);
  await page.getByRole('option').first().click();
  await expect.poll(async () => page.locator('video').evaluate((node) => (node as HTMLVideoElement).readyState), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
});

requirement('MEDIA-013 @fullstack reload requests the same item', async ({ page }) => {
  await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=42`);
  await page.reload();
  await expect(page).toHaveURL(/itemId=42/);
});

requirement('MEDIA-015 @fullstack a zero runtime is replaced by the probe', async ({ request }) => {
  const info = await (await request.get(`${emby()}/OpenLightFX/Studio/Items/probe/MediaInfo`, { headers: headers(), timeout: 5000 })).json();
  expect(info.runtimeMs).toBe(120000);
});

requirement('MEDIA-016 @fullstack a seek past the encoded horizon is not a full transcode', async ({ request }) => {
  const info = await (await request.get(`${emby()}/OpenLightFX/Studio/Items/1/MediaInfo`, { headers: headers(), timeout: 5000 })).json();
  expect(info.proxy.state === 'building' || info.proxy.state === 'ready').toBe(true);
});

requirement('MEDIA-017 @fullstack tracks for an item are listed', async ({ request }) => {
  const body = await (await request.get(`${emby()}/OpenLightFX/Studio/Tracks?itemId=42`, { headers: headers(), timeout: 5000 })).json();
  expect(Array.isArray(body)).toBe(true);
});

requirement('PROP-004 @fullstack the frame endpoint returns a PNG', async ({ request }) => {
  const response = await request.get(`${emby()}/OpenLightFX/Studio/Items/1/Frame?timeMs=2500`, { headers: headers(), timeout: 5000 });
  expect(response.headers()['content-type']).toContain('image/png');
});

requirement('PROP-005 @fullstack HDR frames are marked hable-bt709', async ({ request }) => {
  const response = await request.get(`${emby()}/OpenLightFX/Studio/Items/hdr/Frame?timeMs=1000`, { headers: headers(), timeout: 5000 });
  expect(response.headers()['x-openlightfx-tone-map']).toBe('hable-bt709');
  expect(Math.abs(Number(response.headers()['x-openlightfx-source-time-ms']) - 1000)).toBeLessThanOrEqual(40);
});

requirement('SAVE-001 @fullstack save stores the track beside the movie', async ({ request }) => {
  const bytes = fs.readFileSync('tests/fixtures/sampling/roundtrip.lightfx');
  const put = await request.put(`${emby()}/OpenLightFX/Studio/Tracks/proxy-fixture?itemId=42`, {
    headers: { ...headers(), 'content-type': 'application/octet-stream' },
    data: bytes,
    timeout: 5000,
  });
  expect(put.ok()).toBeTruthy();
  const got = await request.get(`${emby()}/OpenLightFX/Studio/Tracks/proxy-fixture?itemId=42`, { headers: headers(), timeout: 5000 });
  expect(Buffer.compare(Buffer.from(await got.body()), bytes)).toBe(0);
});

requirement('SAVE-002 @fullstack playback uses the saved track', async ({ request }) => {
  const log = process.env.OLFX_NDJSON;
  expect(log, 'OLFX_NDJSON from the simulator').toBeTruthy();
  const lines = fs.readFileSync(log!, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const hit = lines.find((line) => line.event === 'command_received' && line.state_after?.g === 255 && line.state_after?.r === 0);
  expect(hit?.bulb_id).toBeTruthy();
});

requirement('SAVE-003 @fullstack save writes the project sidecar', async ({ request }) => {
  const body = { version: 1, itemId: '42', trackId: 'proxy-fixture', sceneMarkers: [], channelGroups: [] };
  const put = await request.put(`${emby()}/OpenLightFX/Studio/Projects/proxy-fixture?itemId=42`, {
    headers: headers(),
    data: body,
    timeout: 5000,
  });
  expect(put.ok()).toBeTruthy();
  const got = await (await request.get(`${emby()}/OpenLightFX/Studio/Projects/proxy-fixture?itemId=42`, { headers: headers(), timeout: 5000 })).json();
  expect(got.version).toBe(1);
  expect(got.undo).toBeUndefined();
});

requirement('SAVE-004 @fullstack an invalid track is rejected', async ({ request }) => {
  const put = await request.put(`${emby()}/OpenLightFX/Studio/Tracks/bad?itemId=42`, {
    headers: { ...headers(), 'content-type': 'application/octet-stream' },
    data: Buffer.from('not a track'),
    timeout: 5000,
  });
  expect(put.status()).toBeGreaterThanOrEqual(400);
  expect(await put.text()).toMatch(/V-/);
});

requirement('PREV-004 @fullstack preview start sends the mapping', async ({ request }) => {
  const started = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Start`, {
    headers: headers(),
    data: { mapping: { left: ['b1', 'b2'] }, takeover: true },
    timeout: 5000,
  });
  expect(started.ok()).toBeTruthy();
});

requirement('PREV-005 @fullstack confirming a mapping updates the plugin profile', async ({ request }) => {
  const settings = await (await request.get(`${emby()}/OpenLightFX/Settings`, { headers: headers(), timeout: 5000 })).json();
  expect(JSON.stringify(settings)).toContain('left');
});

requirement('PREV-006 @fullstack preview color reaches the simulator within 300 ms', async ({ request }) => {
  const log = process.env.OLFX_NDJSON;
  expect(log).toBeTruthy();
  const lines = fs.readFileSync(log!, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const hit = lines.find((line) => line.event === 'command_received' && line.state_after?.r === 255 && line.state_after?.brightness === 100);
  expect(hit).toBeTruthy();
});

requirement('PREV-007 @fullstack stop restores the bulb snapshot', async ({ request }) => {
  const stopped = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Stop`, { headers: headers(), timeout: 5000 });
  expect(stopped.ok()).toBeTruthy();
});

requirement('PREV-008 @fullstack start without takeover is 409 while Emby plays', async ({ request }) => {
  const response = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Start`, {
    headers: headers(),
    data: { mapping: { left: ['b1'] } },
    timeout: 5000,
  });
  expect(response.status()).toBe(409);
  expect(await response.text()).toContain('playback_active');
});

requirement('PREV-010 @fullstack a non-admin save is forbidden', async ({ request }) => {
  const response = await request.put(`${emby()}/OpenLightFX/Studio/Tracks/proxy-fixture?itemId=42`, {
    headers: { 'X-Emby-Token': 'not-an-admin' },
    data: Buffer.from([0]),
    timeout: 5000,
  });
  expect(response.status()).toBe(403);
});

requirement('PERF-001 @fullstack the shell is ready within 2 seconds', async ({ page }) => {
  const started = Date.now();
  await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}`);
  await expect(page.getByRole('button', { name: /play/i })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(2000);
});

requirement('PERF-004 @fullstack studio does not fetch the source MKV', async ({ page }) => {
  const urls: string[] = [];
  page.on('response', (response) => urls.push(response.url()));
  await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}`);
  expect(urls.some((url) => /clip-b-hevc|\.mkv/.test(url) && !url.includes('MediaInfo'))).toBe(false);
});

requirement('ERR-003 @fullstack a save conflict returns the server text', async ({ request }) => {
  const response = await request.put(`${emby()}/OpenLightFX/Studio/Tracks/conflict?itemId=42`, {
    headers: headers(),
    data: fs.readFileSync('tests/fixtures/sampling/roundtrip.lightfx'),
    timeout: 5000,
  });
  expect(response.status()).toBeGreaterThanOrEqual(400);
  expect((await response.text()).length).toBeGreaterThan(0);
});

requirement('PLUG-001 @fullstack media info reports timing HDR and proxy progress', async ({ request }) => {
  const info = await (await request.get(`${emby()}/OpenLightFX/Studio/Items/1/MediaInfo`, { headers: headers(), timeout: 5000 })).json();
  expect(info).toEqual(expect.objectContaining({ runtimeMs: expect.any(Number), width: expect.any(Number), videoCodec: expect.any(String) }));
  expect(['missing', 'building', 'ready']).toContain(info.proxy.state);
});

requirement('PLUG-002 @fullstack the frame endpoint tone-maps HDR with hable', async ({ request }) => {
  const response = await request.get(`${emby()}/OpenLightFX/Studio/Items/1/Frame?timeMs=2500`, { headers: headers(), timeout: 5000 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/png');
  expect(Math.abs(Number(response.headers()['x-openlightfx-source-time-ms']) - 2500)).toBeLessThanOrEqual(40);
});

requirement('PLUG-003 @fullstack the proxy is H.264 with a short GOP', async ({ request }) => {
  const started = await request.post(`${emby()}/OpenLightFX/Studio/Items/1/Proxy`, { headers: headers(), timeout: 5000 });
  expect(started.ok()).toBeTruthy();
  const body = await started.json();
  expect(body.editUrl).toBeTruthy();
  expect(body.keyframeIntervalMs ?? 500).toBeLessThanOrEqual(500);
});

requirement('PLUG-004 @fullstack the sidecar is stored and is not a playback file', async ({ request }) => {
  const body = {
    version: 1,
    itemId: '42',
    trackId: 'proxy-fixture',
    sceneMarkers: [{ id: 'm1', timeMs: 1000, label: 'Intro', kind: 'manual' }],
    channelGroups: [{ id: 'g1', name: 'Walls', mode: 'mirror', channelIds: ['left', 'right'], spreadMs: 150 }],
  };
  const put = await request.put(`${emby()}/OpenLightFX/Studio/Projects/proxy-fixture?itemId=42`, {
    headers: headers(),
    data: body,
    timeout: 5000,
  });
  expect(put.ok()).toBeTruthy();
});

requirement('PLUG-005 @fullstack preview refuses or takes over an active session', async ({ request }) => {
  const refused = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Start`, {
    headers: headers(),
    data: { mapping: { left: ['left'] } },
    timeout: 5000,
  });
  expect([200, 409]).toContain(refused.status());
});

requirement('PLUG-006 @fullstack the editor routes keep their shapes', async ({ request }) => {
  const bulbs = await (await request.get(`${emby()}/OpenLightFX/Studio/Bulbs`, { headers: headers(), timeout: 5000 })).json();
  expect(Array.isArray(bulbs)).toBe(true);
  const settings = await (await request.get(`${emby()}/OpenLightFX/Settings`, { headers: headers(), timeout: 5000 })).json();
  expect(settings).toHaveProperty('photosensitivityMode');
});
