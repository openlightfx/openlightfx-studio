import { expect, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import { decodeTrack } from '../../src/lib/domain';
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

/** Synthetic clips from scripts/media/generate-clips.sh, as Emby names them. */
const CLIPS = { h264: 'clip-a', hdr: 'clip-b', zero: 'clip-zero', long: 'clip-long' } as const;
const itemIds = new Map<string, string>();

/** Resolve a synthetic clip to its real Emby item id. Fixed ids like 1 or 42 do not exist in a fresh library. */
async function itemId(
  request: APIRequestContext,
  clip: keyof typeof CLIPS = 'h264'
): Promise<string> {
  const name = CLIPS[clip];
  const cached = itemIds.get(name);
  if (cached) return cached;
  const response = await request.get(
    `${emby()}/emby/Items?Recursive=true&IncludeItemTypes=Movie&SearchTerm=${name}`,
    { headers: headers(), timeout: 5000 }
  );
  const found = ((await response.json()).Items ?? []).find(
    (item: { Name: string }) => item.Name === name
  );
  if (!found) throw new Error(`harness: synthetic clip ${name} is not in the Emby library`);
  itemIds.set(name, found.Id);
  return found.Id;
}

/** The color a command asked for. state_after can still be the pre-transition color. */
function commanded(line: Record<string, any>): {
  r: number;
  g: number;
  b: number;
  brightness: number;
} {
  const source = line.params ?? line.state_after ?? {};
  return {
    r: Number(source.r),
    g: Number(source.g),
    b: Number(source.b),
    brightness: Number(source.brightness),
  };
}

function previewChannels2() {
  return [
    { id: 'left', spatialHint: 'SPATIAL_LEFT', displayName: 'Left' },
    { id: 'right', spatialHint: 'SPATIAL_RIGHT', displayName: 'Right' },
  ];
}

function freshTrackId(): string {
  return `t${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

function roundTripBytes(): Buffer {
  return fs.readFileSync('tests/fixtures/sampling/roundtrip.lightfx');
}

async function saveTrack(
  request: APIRequestContext,
  item: string,
  track: string,
  ifMatch?: string
) {
  return request.put(`${emby()}/OpenLightFX/Studio/Tracks/${track}?itemId=${item}`, {
    headers: {
      ...headers(),
      'content-type': 'application/octet-stream',
      ...(ifMatch ? { 'If-Match': ifMatch } : {}),
    },
    data: roundTripBytes(),
    timeout: 8000,
  });
}

async function selectTrackForPlayback(
  request: APIRequestContext,
  item: string,
  track: string
): Promise<() => Promise<void>> {
  const listed = await (
    await request.get(`${emby()}/OpenLightFX/Tracks/ByItem?ItemId=${item}`, {
      headers: headers(),
      timeout: 5000,
    })
  ).json();
  const trackPath = listed.tracks.find((entry: { trackPath: string }) =>
    entry.trackPath.includes(track)
  )?.trackPath;
  expect(trackPath).toEqual(expect.any(String));
  const selected = await request.post(`${emby()}/OpenLightFX/Tracks/Select`, {
    headers: headers(),
    data: { itemId: item, trackPath },
    timeout: 5000,
  });
  expect(selected.ok()).toBeTruthy();
  return async () => {
    await request.post(`${emby()}/OpenLightFX/Tracks/Select`, {
      headers: headers(),
      data: { itemId: item },
      timeout: 5000,
    });
  };
}

/** Verify the local Emby volume starts with a room seeded for the simulator. */
async function ensureRoom(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${emby()}/OpenLightFX/Studio/Rooms`, {
    headers: headers(),
    timeout: 5000,
  });
  expect(response.ok()).toBeTruthy();
  const rooms = await response.json();
  const room = rooms.find(
    (candidate: { id: string; name: string }) => candidate.name === 'Fullstack Room'
  );
  expect(room).toBeTruthy();
  return room.id;
}

async function playbackToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${emby()}/emby/Users/AuthenticateByName`, {
    headers: {
      'content-type': 'application/json',
      'X-Emby-Authorization':
        'MediaBrowser Client="OpenLightFX Tests", Device="fullstack-play", DeviceId="openlightfx-fullstack-play", Version="1.0.0"',
    },
    data: {
      Username: process.env.OLFX_EMBY_USER ?? 'admin',
      Pw: process.env.OLFX_EMBY_PASSWORD ?? 'openlightfx-test',
    },
    timeout: 5000,
  });
  expect(response.ok()).toBeTruthy();
  const token = (await response.json()).AccessToken;
  expect(token).toBeTruthy();
  return token;
}

/** Report an Emby playback session so the plugin's PlaybackStart handler runs. */
async function reportPlayback(
  request: APIRequestContext,
  item: string
): Promise<() => Promise<void>> {
  const access = await playbackToken(request);
  const auth = {
    'X-Emby-Token': access,
    'content-type': 'application/json',
    'X-Emby-Authorization':
      'MediaBrowser Client="OpenLightFX Tests", Device="fullstack-play", DeviceId="openlightfx-fullstack-play", Version="1.0.0"',
  };
  const info = await request.post(`${emby()}/emby/Items/${item}/PlaybackInfo`, {
    headers: auth,
    data: {},
    timeout: 5000,
  });
  const mediaSourceId = (await info.json()).MediaSources?.[0]?.Id;
  const playSessionId = `olfx-${item}-${Date.now()}`;
  const started = await request.post(`${emby()}/emby/Sessions/Playing`, {
    headers: auth,
    data: {
      ItemId: item,
      MediaSourceId: mediaSourceId,
      PlaySessionId: playSessionId,
      CanSeek: true,
      PlayMethod: 'DirectPlay',
      PositionTicks: 0,
    },
    timeout: 5000,
  });
  expect(started.ok()).toBeTruthy();
  await request.post(`${emby()}/emby/Sessions/Playing/Progress`, {
    headers: auth,
    data: {
      ItemId: item,
      MediaSourceId: mediaSourceId,
      PlaySessionId: playSessionId,
      PositionTicks: 0,
      IsPaused: false,
    },
    timeout: 5000,
  });
  // Callers stop the session so later tests do not see playback_active.
  return async () => {
    await request.post(`${emby()}/emby/Sessions/Playing/Stopped`, {
      headers: auth,
      data: {
        ItemId: item,
        MediaSourceId: mediaSourceId,
        PlaySessionId: playSessionId,
        PositionTicks: 0,
      },
      timeout: 5000,
    });
  };
}

/** Simulator stdout as captured by run.sh. Skips anything that is not a JSON object. */
function readNdjson(): Array<Record<string, any>> {
  const log = process.env.OLFX_NDJSON;
  expect(log, 'OLFX_NDJSON from the simulator').toBeTruthy();
  return fs
    .readFileSync(log!, 'utf8')
    .split('\n')
    .map((line) => line.slice(Math.max(0, line.indexOf('{'))).trim())
    .filter((line) => line.startsWith('{'))
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

requirement(
  'SHELL-001 @fullstack the plugin serves studio and redirects to the slash URL',
  async ({ request }) => {
    const response = await request.get(`${emby()}/emby/OpenLightFX/studio?api_key=${token()}`, {
      maxRedirects: 0,
      timeout: 5000,
    });
    expect([301, 302, 307, 308]).toContain(response.status());
    expect(response.headers().location ?? '').toContain('/emby/OpenLightFX/studio/');
  }
);

requirement(
  'FLOW-003 @fullstack Studio authenticates from Emby Web without a URL token',
  async ({ page }) => {
    await page.addInitScript(
      ({ serverAddress, accessToken }) => {
        localStorage.setItem(
          'servercredentials3',
          JSON.stringify({
            Servers: [
              {
                Id: 'openlightfx-fullstack',
                UserId: 'fullstack-admin',
                ManualAddress: serverAddress,
                Users: [{ UserId: 'fullstack-admin', AccessToken: accessToken }],
              },
            ],
          })
        );
      },
      { serverAddress: emby(), accessToken: token() }
    );

    let tokenOnSessionRequest: string | undefined;
    let tokenOnSetupRequest: string | undefined;
    page.on('request', (request) => {
      if (request.url().includes('/OpenLightFX/Studio/Session')) {
        tokenOnSessionRequest = request.headers()['x-emby-token'];
      }
      if (request.url().includes('/OpenLightFX/Studio/Setup')) {
        tokenOnSetupRequest = request.headers()['x-emby-token'];
      }
    });

    const response = await page.goto(`${emby()}/emby/OpenLightFX/studio/#/rooms`);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole('button', { name: /Fullstack Room/ })).toBeVisible();
    expect(tokenOnSessionRequest).toBe(token());
    expect(tokenOnSetupRequest).toBe(token());
    expect(new URL(page.url()).searchParams.has('api_key')).toBe(false);
  }
);

requirement('MEDIA-001 @fullstack items search returns movies', async ({ request }) => {
  const body = await (
    await request.get(`${emby()}/OpenLightFX/Studio/Items?search=clip`, {
      headers: headers(),
      timeout: 5000,
    })
  ).json();
  expect(body.length).toBeGreaterThan(0);
  expect(body[0]).toEqual(
    expect.objectContaining({
      itemId: expect.any(String),
      name: expect.any(String),
      runtimeMs: expect.any(Number),
      primaryImageTag: expect.any(String),
    })
  );
});

requirement(
  'MEDIA-002 @fullstack the item runtime becomes the track duration',
  async ({ request }) => {
    const body = await (
      await request.get(`${emby()}/OpenLightFX/Studio/Items?search=clip`, {
        headers: headers(),
        timeout: 5000,
      })
    ).json();
    expect(body[0].runtimeMs).toBeGreaterThan(0);
  }
);

requirement('MEDIA-003 @fullstack the edit URL is a direct-play proxy', async ({ request }) => {
  const info = await (
    await request.get(`${emby()}/OpenLightFX/Studio/Items/${await itemId(request)}/MediaInfo`, {
      headers: headers(),
      timeout: 5000,
    })
  ).json();
  expect(info.proxy.editUrl ?? info.proxy.state).toBeTruthy();
});

requirement('MEDIA-004 @fullstack play uses the proxy URL', async ({ request }) => {
  const id = await itemId(request);
  const info = await (
    await request.get(`${emby()}/OpenLightFX/Studio/Items/${id}/MediaInfo`, {
      headers: headers(),
      timeout: 5000,
    })
  ).json();
  expect(String(info.proxy.editUrl)).not.toMatch(/Transcode/i);
  expect(String(info.proxy.editUrl)).not.toMatch(/api_key/i);
  // MediaInfo set the HttpOnly media ticket in this request context's cookie jar.
  // It opens the edit proxy and nothing else.
  const state = await request.storageState();
  const media = state.cookies.find((cookie) => cookie.name === 'olfx_studio_media');
  expect(media?.httpOnly).toBe(true);
  expect(media?.sameSite).toBe('Strict');
  expect(media?.value).not.toBe(token());
  expect(state.cookies.some((cookie) => cookie.value === token())).toBe(false);
  const cookieOnly = await request.get(info.proxy.editUrl, {
    headers: { Range: 'bytes=0-100' },
    timeout: 5000,
  });
  expect(cookieOnly.status()).toBe(206);
  expect(
    (await request.get(`${emby()}/OpenLightFX/Studio/Items`, { timeout: 5000 })).status()
  ).toBe(401);
  expect(
    (
      await request.get(`${emby()}/OpenLightFX/Studio/Items/${id}/MediaInfo`, { timeout: 5000 })
    ).status()
  ).toBe(401);
  expect(
    (
      await request.post(`${emby()}/OpenLightFX/Studio/Items/${id}/Proxy`, { timeout: 5000 })
    ).status()
  ).toBe(401);
  const shell = await request.get(`${emby()}/emby/OpenLightFX/studio/`, {
    timeout: 5000,
    maxRedirects: 0,
  });
  expect(shell.status()).toBe(200);
  expect(await shell.text()).not.toMatch(/X-Emby-Token|api_key/i);
});

requirement(
  'MEDIA-006 @fullstack a range request does not start a transcode',
  async ({ request }) => {
    const info = await (
      await request.get(`${emby()}/OpenLightFX/Studio/Items/${await itemId(request)}/MediaInfo`, {
        headers: headers(),
        timeout: 5000,
      })
    ).json();
    expect(String(info.proxy.editUrl)).not.toMatch(/api_key/i);
    const ranged = await request.get(info.proxy.editUrl, {
      headers: { ...headers(), Range: 'bytes=0-100' },
      timeout: 5000,
    });
    expect(ranged.status()).toBe(206);
  }
);

requirement(
  'ROOM-001 @fullstack admin room controls use Emby role authorization',
  async ({ page, request }) => {
    const response = await request.get(`${emby()}/OpenLightFX/Studio/CanManageRooms`, {
      headers: headers(),
      timeout: 5000,
    });
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).canManageRooms).toBe(true);

    await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}#/rooms`);
    await expect(page.getByRole('button', { name: 'Find bulbs' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '+ New room' })).toBeEnabled();
  }
);

requirement(
  'ROOM-001 @fullstack create and save a room on an available Emby screen',
  async ({ page, request }) => {
    const name = `Room acceptance ${Date.now()}`;
    await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}#/rooms`);
    await page.getByRole('button', { name: '+ New room' }).click();
    await page.getByLabel('Room name').fill(name);
    await page
      .getByLabel('Screen (the Emby app in this room)')
      .selectOption('openlightfx-fullstack');
    const save = page.getByRole('button', { name: 'Save room' });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();

    const response = await request.get(`${emby()}/OpenLightFX/Studio/Rooms`, {
      headers: headers(),
      timeout: 5000,
    });
    expect(response.ok()).toBeTruthy();
    const rooms = await response.json();
    const created = rooms.find((room: { name: string }) => room.name === name);
    expect(created?.screen.deviceId).toBe('openlightfx-fullstack');
    try {
      const deleted = await request.delete(
        `${emby()}/OpenLightFX/Studio/Rooms/${encodeURIComponent(created.id)}`,
        { headers: headers(), timeout: 5000 }
      );
      expect(deleted.ok()).toBeTruthy();
    } finally {
      await page.reload();
    }
  }
);

requirement(
  'ROOM-005 @fullstack dragging a bulb changes its position and × unplaces it',
  async ({ page, request }) => {
    const getRooms = async () =>
      (await (
        await request.get(`${emby()}/OpenLightFX/Studio/Rooms`, { headers: headers() })
      ).json()) as Array<{
        id: string;
        name: string;
        screen: { deviceId: string; deviceName: string; appName: string };
        updatedAt: string;
        bulbs: Array<{ id: string; position: string | null; follows: string | null }>;
      }>;
    const original = (await getRooms()).find((room) => room.name === 'Fullstack Room')!;

    try {
      await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}#/rooms`);
      const chip = page.getByRole('group', { name: 'Placed bulb' }).filter({ hasText: 'Left' });
      await chip.dragTo(page.getByRole('region', { name: 'Surround right bulb position' }));
      await expect(
        page.getByRole('region', { name: 'Surround right bulb position' })
      ).toContainText('Left');
      await page.getByRole('button', { name: 'Save room' }).click();
      await expect(page.getByText('Room saved.')).toBeVisible();
      const updated = (await getRooms()).find((room) => room.id === original.id)!;
      expect(updated.bulbs.find((bulb) => bulb.id === 'left')?.position).toBe('surround-right');

      await page
        .getByRole('group', { name: 'Placed bulb' })
        .filter({ hasText: 'Left' })
        .getByRole('button', { name: 'Take out of room' })
        .click();
      await page.getByRole('button', { name: 'Save room' }).click();
      await expect(page.getByText('Room saved.')).toBeVisible();
      const bulbs = await (
        await request.get(`${emby()}/OpenLightFX/Studio/Bulbs`, { headers: headers() })
      ).json();
      expect(bulbs.find((bulb: { id: string }) => bulb.id === 'left').roomId ?? null).toBeNull();
    } finally {
      const latest = (await getRooms()).find((room) => room.id === original.id)!;
      const restored = await request.put(`${emby()}/OpenLightFX/Studio/Rooms/${original.id}`, {
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'If-Match': latest.updatedAt,
        },
        data: {
          name: original.name,
          screenDeviceId: original.screen.deviceId,
          deviceName: original.screen.deviceName,
          appName: original.screen.appName,
          bulbs: original.bulbs,
        },
      });
      expect(restored.ok()).toBeTruthy();
      await page.reload();
    }
  }
);

requirement(
  'ROOM-003 @fullstack bulbs assigned to another room remain visible but cannot be placed',
  async ({ page }) => {
    await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}#/rooms`);
    await page.getByRole('button', { name: '+ New room' }).click();
    const assignedBulb = page
      .getByRole('listitem')
      .filter({ hasText: 'In Fullstack Room' })
      .first();
    await expect(assignedBulb).toBeVisible();
    await assignedBulb.locator('summary').click();
    await expect(
      assignedBulb.locator('.place-menu').getByRole('button', { name: 'Left', exact: true })
    ).toBeDisabled();
  }
);

requirement(
  'ROOM-002 @fullstack screen picker lists all devices and disables occupied screens',
  async ({ page }) => {
    await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}#/rooms`);
    await page.getByRole('button', { name: '+ New room' }).click();
    const screen = page.getByLabel('Screen (the Emby app in this room)');
    await expect(screen.locator('option', { hasText: 'viewer' })).toHaveCount(1);
    const occupied = screen.getByRole('option', { name: /fullstack-play.*In Fullstack Room/i });
    await expect(occupied).toBeDisabled();
  }
);

requirement(
  'LIB-001 @fullstack movies show a real poster card and track count from Emby',
  async ({ page, request }) => {
    const id = await itemId(request, 'h264');
    const track = freshTrackId();
    const saved = await saveTrack(request, id, track);
    expect(saved.ok()).toBeTruthy();

    const response = await request.get(
      `${emby()}/OpenLightFX/Studio/Items?search=${encodeURIComponent(CLIPS.h264)}`,
      { headers: headers(), timeout: 5000 }
    );
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const items = Array.isArray(body) ? body : body.Items;
    const item = items.find((entry: { itemId: string }) => entry.itemId === id);
    expect(item).toBeTruthy();

    await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}#/library`);
    const card = page.locator('a.movie').filter({ hasText: CLIPS.h264 });
    await expect(card).toBeVisible();
    await expect(
      card.getByText(`${item.trackCount} ${item.trackCount === 1 ? 'track' : 'tracks'}`)
    ).toBeVisible();
    if (item.posterUrl) {
      await expect(card.locator('img')).toHaveAttribute('src', item.posterUrl);
    } else {
      await expect(card.locator('.poster-fallback')).toContainText(CLIPS.h264);
      await expect(card.locator('img')).toHaveCount(0);
    }
  }
);

requirement(
  'LIB-004 @fullstack no-room strip appears and opens Rooms',
  async ({ page, request }) => {
    const response = await request.get(`${emby()}/OpenLightFX/Studio/Rooms`, {
      headers: headers(),
    });
    expect(response.ok()).toBeTruthy();
    const rooms = await response.json();
    const original = rooms.find((room: { name: string }) => room.name === 'Fullstack Room');
    expect(original).toBeTruthy();
    try {
      const deleted = await request.delete(
        `${emby()}/OpenLightFX/Studio/Rooms/${encodeURIComponent(original.id)}`,
        { headers: headers() }
      );
      expect(deleted.ok()).toBeTruthy();
      await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}#/library`);
      await expect(page.locator('.no-room')).toBeVisible();
      await page.getByRole('link', { name: 'Set up a room' }).click();
      await expect(page).toHaveURL(/#\/rooms$/);
    } finally {
      const restored = await request.post(`${emby()}/OpenLightFX/Studio/Rooms`, {
        headers: { ...headers(), 'content-type': 'application/json' },
        data: {
          name: 'Fullstack Room',
          screenDeviceId: original.screen.deviceId,
          deviceName: original.screen.deviceName,
          appName: original.screen.appName,
          bulbs: [
            { id: 'left', position: 'left', follows: null },
            { id: 'right', position: 'right', follows: null },
          ],
        },
      });
      expect(restored.ok()).toBeTruthy();
    }
  }
);

requirement(
  'LIB-003 @fullstack selecting a real movie opens its movie screen',
  async ({ page, request }) => {
    await itemId(request, 'h264');
    await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}#/library`);
    await page.locator('a.movie').filter({ hasText: CLIPS.h264 }).click();
    await expect(page).toHaveURL(/#\/movie\//);
    await expect(page.getByRole('heading', { name: CLIPS.h264 })).toBeVisible();
  }
);

requirement(
  'LIB-002 @fullstack title search filters real Emby movies',
  async ({ page, request }) => {
    await itemId(request, 'h264');
    await itemId(request, 'long');
    await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}#/library`);
    const search = page.getByRole('searchbox', { name: 'Search', exact: true });
    await search.fill('long');
    await expect(page.locator('a.movie')).toHaveCount(1);
    await expect(page.locator('a.movie')).toContainText(CLIPS.long);
    await search.fill('zzz-no-such-movie');
    await expect(page.getByText(/no movies match/i)).toBeVisible();
    await page.getByRole('button', { name: /clear search/i }).click();
    await expect(page.locator('a.movie')).not.toHaveCount(0);
  }
);

requirement(
  'MEDIA-011 @fullstack the first picture is ready within 10 seconds',
  async ({ page, request }) => {
    const id = await itemId(request);
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${track}`
    );
    await expect
      .poll(
        async () => page.locator('video').evaluate((node) => (node as HTMLVideoElement).readyState),
        { timeout: 10_000 }
      )
      .toBeGreaterThanOrEqual(2);
  }
);

requirement('MEDIA-013 @fullstack reload requests the same item', async ({ page }) => {
  const id = await itemId(page.request);
  const track = freshTrackId();
  expect((await saveTrack(page.request, id, track)).ok()).toBeTruthy();
  const url = `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${track}`;
  await page.goto(url);
  const refetch = page.waitForRequest(new RegExp(`/OpenLightFX/Studio/Items/${id}\\b`), {
    timeout: 5000,
  });
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`#\\/edit\\/${id}\\/${track}`));
  await refetch;
});

requirement('MEDIA-015 @fullstack a zero runtime is replaced by the probe', async ({ request }) => {
  const id = await itemId(request, 'zero');
  const listed = await (
    await request.get(`${emby()}/OpenLightFX/Studio/Items?search=clip-zero`, {
      headers: headers(),
      timeout: 5000,
    })
  ).json();
  const item = listed.find((entry: { itemId: string }) => entry.itemId === id);
  expect(item?.runtimeMs).toBe(0);
  const info = await (
    await request.get(`${emby()}/OpenLightFX/Studio/Items/${id}/MediaInfo`, {
      headers: headers(),
      timeout: 15000,
    })
  ).json();
  expect(info.runtimeMs).toBe(120000);
});

requirement(
  'MEDIA-016 @fullstack playback starts while the proxy encodes and a late seek waits',
  async ({ page, request }) => {
    const id = await itemId(request, 'long');
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    const urls: string[] = [];
    page.on('request', (req) => urls.push(req.url()));
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${track}`
    );
    await expect
      .poll(
        async () => page.locator('video').evaluate((node) => (node as HTMLVideoElement).readyState),
        { timeout: 15_000 }
      )
      .toBeGreaterThanOrEqual(2);
    const info = await (
      await request.get(`${emby()}/OpenLightFX/Studio/Items/${id}/MediaInfo`, {
        headers: headers(),
        timeout: 5000,
      })
    ).json();
    expect(info.proxy.state).toBe('building');
    expect(String(info.proxy.editUrl)).not.toMatch(/Transcode/i);
    await page.getByRole('button', { name: /^play$/i }).click();
    await expect
      .poll(async () =>
        page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime)
      )
      .toBeGreaterThan(0.2);
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    const durationMs = Number(await ruler.getAttribute('aria-valuemax'));
    const targetMs = Math.min(300_000, durationMs * 0.75);
    expect(targetMs).toBeGreaterThan(info.proxy.encodedThroughMs + 400);
    const rulerWidth = Number.parseFloat(
      await ruler.evaluate((node) => getComputedStyle(node).width)
    );
    const targetX = (targetMs / durationMs) * rulerWidth;
    await page.locator('.timeline-scroll').evaluate((node, x) => {
      (node as HTMLElement).scrollLeft = Math.max(0, x - 400);
    }, targetX);
    const rulerBox = await ruler.boundingBox();
    expect(rulerBox).toBeTruthy();
    await page.mouse.click(rulerBox!.x + targetX, rulerBox!.y + rulerBox!.height / 2);
    await expect(page.locator('.play-reason')).toContainText(/still encoding to \d{2}:\d{2}/i);
    expect(urls.some((url) => /Transcode/i.test(url))).toBe(false);
    // The video plays from the HttpOnly ticket, not a token in the URL or a script-readable cookie.
    expect(urls.some((url) => /Proxy\/Media.*api_key/i.test(url))).toBe(false);
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.value === token())).toBe(false);
    expect(cookies.find((cookie) => cookie.name === 'olfx_studio_media')?.httpOnly).toBe(true);
  }
);

requirement('MEDIA-017 @fullstack tracks for an item are listed', async ({ request }) => {
  const id = await itemId(request);
  const track = freshTrackId();
  expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
  const body = await (
    await request.get(`${emby()}/OpenLightFX/Studio/Tracks?itemId=${id}`, {
      headers: headers(),
      timeout: 5000,
    })
  ).json();
  const row = body.find((entry: { trackId: string }) => entry.trackId === track);
  expect(row).toEqual(
    expect.objectContaining({
      trackId: track,
      title: expect.any(String),
      itemId: id,
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
  );
  expect(String(row.title).length).toBeGreaterThan(0);
});

requirement('PROP-004 @fullstack the frame endpoint returns a PNG', async ({ request }) => {
  const response = await request.get(
    `${emby()}/OpenLightFX/Studio/Items/${await itemId(request)}/Frame?timeMs=2500`,
    { headers: headers(), timeout: 5000 }
  );
  expect(response.headers()['content-type']).toContain('image/png');
});

requirement('PROP-005 @fullstack HDR frames are marked hable-bt709', async ({ request }) => {
  const response = await request.get(
    `${emby()}/OpenLightFX/Studio/Items/${await itemId(request, 'hdr')}/Frame?timeMs=1000`,
    { headers: headers(), timeout: 5000 }
  );
  expect(response.headers()['x-openlightfx-tone-map']).toBe('hable-bt709');
  expect(
    Math.abs(Number(response.headers()['x-openlightfx-source-time-ms']) - 1000)
  ).toBeLessThanOrEqual(40);
});

requirement('SAVE-001 @fullstack save stores the track beside the movie', async ({ request }) => {
  const bytes = fs.readFileSync('tests/fixtures/sampling/roundtrip.lightfx');
  const put = await request.put(
    `${emby()}/OpenLightFX/Studio/Tracks/proxy-fixture?itemId=${await itemId(request)}`,
    {
      headers: { ...headers(), 'content-type': 'application/octet-stream' },
      data: bytes,
      timeout: 5000,
    }
  );
  expect(put.ok()).toBeTruthy();
  const got = await request.get(
    `${emby()}/OpenLightFX/Studio/Tracks/proxy-fixture?itemId=${await itemId(request)}`,
    { headers: headers(), timeout: 5000 }
  );
  expect(Buffer.compare(Buffer.from(await got.body()), bytes)).toBe(0);
});

requirement('SAVE-002 @fullstack playback uses the saved track', async ({ request }) => {
  const id = await itemId(request);
  const track = freshTrackId();
  await ensureRoom(request);
  expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
  const listed = await (
    await request.get(`${emby()}/OpenLightFX/Tracks/ByItem?itemId=${id}`, {
      headers: headers(),
      timeout: 5000,
    })
  ).json();
  const tracks = listed.tracks ?? listed.Tracks ?? [];
  const saved = tracks.find((entry: { trackPath?: string; TrackPath?: string }) =>
    String(entry.trackPath ?? entry.TrackPath ?? '').includes(`${track}.lightfx`)
  );
  const trackPath = saved?.trackPath ?? saved?.TrackPath;
  expect(trackPath).toBeTruthy();
  const selected = await request.post(`${emby()}/OpenLightFX/Tracks/Select`, {
    headers: { ...headers(), 'content-type': 'application/json' },
    data: { itemId: id, trackPath },
    timeout: 5000,
  });
  expect(selected.ok()).toBeTruthy();
  const stopPlayback = await reportPlayback(request, id);
  try {
    // roundtrip.lightfx holds left at rgb(10, 20, 30), brightness 40, from time 0.
    await expect
      .poll(
        () =>
          readNdjson().some((line) => {
            const color = commanded(line);
            return (
              line.event === 'command_received' &&
              color.r === 10 &&
              color.g === 20 &&
              color.b === 30 &&
              color.brightness === 40
            );
          }),
        { timeout: 8000 }
      )
      .toBe(true);
  } finally {
    await stopPlayback();
  }
});

requirement('SAVE-003 @fullstack save writes the project sidecar', async ({ request }) => {
  const body = {
    version: 1,
    itemId: '42',
    trackId: 'proxy-fixture',
    sceneMarkers: [],
    channelGroups: [],
  };
  const put = await request.put(
    `${emby()}/OpenLightFX/Studio/Projects/proxy-fixture?itemId=${await itemId(request)}`,
    {
      headers: headers(),
      data: body,
      timeout: 5000,
    }
  );
  expect(put.ok()).toBeTruthy();
  const got = await (
    await request.get(
      `${emby()}/OpenLightFX/Studio/Projects/proxy-fixture?itemId=${await itemId(request)}`,
      { headers: headers(), timeout: 5000 }
    )
  ).json();
  expect(got.version).toBe(1);
  expect(got.undo).toBeUndefined();
});

requirement('SAVE-004 @fullstack an invalid track is rejected', async ({ request }) => {
  const put = await request.put(
    `${emby()}/OpenLightFX/Studio/Tracks/bad?itemId=${await itemId(request)}`,
    {
      headers: { ...headers(), 'content-type': 'application/octet-stream' },
      data: Buffer.from('not a track'),
      timeout: 5000,
    }
  );
  expect(put.status()).toBeGreaterThanOrEqual(400);
  expect(await put.text()).toMatch(/V-/);
});

requirement(
  'EDIT-001 @fullstack the ruler is the only time scrubber',
  async ({ page, request }) => {
    const id = await itemId(request);
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${track}`
    );
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    await expect(ruler).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Timeline ruler' })).toHaveCount(1);
    await expect(page.locator('[data-minimap]')).toHaveCount(0);
    await expect(page.locator('video')).not.toHaveAttribute('controls', '');
    await page.getByRole('button', { name: 'Fit' }).click();
    const box = await ruler.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width * 0.25, box!.y + box!.height / 2);
    await expect
      .poll(() =>
        page.locator('video').evaluate((video) => (video as HTMLVideoElement).currentTime)
      )
      .toBeCloseTo(2.5, 1);
  }
);

requirement(
  'EDIT-002 @fullstack dragging the ruler scrubs continuously',
  async ({ page, request }) => {
    const id = await itemId(request);
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${track}`
    );
    const ruler = page.getByRole('slider', { name: 'Timeline ruler' });
    await page.getByRole('button', { name: 'Fit' }).click();
    const box = await ruler.boundingBox();
    expect(box).toBeTruthy();
    const y = box!.y + box!.height / 2;
    await page.mouse.move(box!.x + box!.width * 0.1, y);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.15, y);
    await expect
      .poll(() => page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(1.5, 1);
    await page.mouse.move(box!.x + box!.width * 0.2, y);
    await page.mouse.up();
    await expect
      .poll(() => page.locator('video').evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeCloseTo(2, 1);
  }
);

requirement(
  'EDIT-004 @fullstack editor lane labels use server routing names',
  async ({ page, request }) => {
    const id = await itemId(request);
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${track}`
    );
    await expect(page.getByRole('button', { name: /Left — Left/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Right — Right/ })).toBeVisible();
  }
);

requirement(
  'EDIT-003 @fullstack clicking empty lane adds a keyframe',
  async ({ page, request }) => {
    const id = await itemId(request);
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${track}`
    );
    const lane = page.locator('.lane').first();
    await expect(lane).toBeVisible();
    const box = await lane.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height / 2);
    await expect(page.getByRole('button', { name: /Left keyframe at/ })).toHaveCount(2);
    await expect(page.getByText('Unsaved changes')).toBeVisible();
  }
);

requirement(
  'EDIT-006 @fullstack undo and redo work from the Edit menu',
  async ({ page, request }) => {
    const id = await itemId(request);
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${track}`
    );
    const lane = page.locator('.lane').first();
    const box = await lane.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height / 2);
    await expect(page.getByRole('button', { name: /Left keyframe at/ })).toHaveCount(2);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /Undo/ }).click();
    await expect(page.getByRole('button', { name: /Left keyframe at/ })).toHaveCount(1);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /Redo/ }).click();
    await expect(page.getByRole('button', { name: /Left keyframe at/ })).toHaveCount(2);
  }
);

requirement(
  'EDIT-007 @fullstack editor transport plays, pauses, steps, and skips',
  async ({ page, request }) => {
    const id = await itemId(request);
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${track}`
    );
    const video = page.locator('video');
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).readyState))
      .toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Play' }).click();
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0.1);
    await page.getByRole('button', { name: 'Pause' }).click();
    const before = await video.evaluate((node) => (node as HTMLVideoElement).currentTime);
    await page.getByRole('button', { name: 'Next frame' }).click();
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeGreaterThan(before);
    await page.getByRole('button', { name: 'Skip forward 5 seconds' }).click();
    await expect
      .poll(() => video.evaluate((node) => (node as HTMLVideoElement).currentTime))
      .toBeGreaterThan(before + 4.9);
  }
);

requirement(
  'EDIT-008 @fullstack inspector edits are encoded into the saved track',
  async ({ page, request }) => {
    const id = await itemId(request);
    const trackId = freshTrackId();
    expect((await saveTrack(request, id, trackId)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${trackId}`
    );
    await page
      .getByRole('button', { name: /Right keyframe at/ })
      .first()
      .click();
    await page.getByRole('spinbutton', { name: 'Brightness value' }).fill('40');
    await page.getByRole('spinbutton', { name: 'Fade length' }).fill('500');
    await page.getByRole('combobox', { name: 'Fade type' }).selectOption('LINEAR');
    await page.getByRole('textbox', { name: 'Hex' }).fill('ff0000');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: /Save/ }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    const response = await request.get(
      `${emby()}/OpenLightFX/Studio/Tracks/${trackId}?itemId=${id}`,
      {
        headers: headers(),
        timeout: 5000,
      }
    );
    expect(response.ok()).toBeTruthy();
    const decoded = decodeTrack(new Uint8Array(await response.body()));
    expect(decoded.keyframes.find((keyframe) => keyframe.channelId === 'right')).toMatchObject({
      brightness: 40,
      transitionMs: 500,
      interpolation: 'LINEAR',
      color: { r: 255, g: 0, b: 0 },
    });
  }
);

requirement(
  'EDIT-005 @fullstack File export downloads and Close guards unsaved edits',
  async ({ page, request }) => {
    const id = await itemId(request);
    const trackId = freshTrackId();
    expect((await saveTrack(request, id, trackId)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${trackId}`
    );
    const lane = page.locator('.lane').first();
    const box = await lane.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height / 2);
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: /Export/ }).click();
    expect((await downloaded).suggestedFilename()).toBe('Round Trip.lightfx');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /Save changes to/ })).toBeVisible();
    await page.getByRole('button', { name: "Don't save" }).click();
    await expect(page).toHaveURL(new RegExp(`#\\/movie\\/${id}$`));
  }
);

requirement(
  'EDIT-011 @fullstack save state changes from unsaved to saved',
  async ({ page, request }) => {
    const id = await itemId(request);
    const trackId = freshTrackId();
    expect((await saveTrack(request, id, trackId)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${trackId}`
    );
    const lane = page.locator('.lane').first();
    const box = await lane.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height / 2);
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: /Save/ }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  }
);

requirement(
  'EDIT-012 @fullstack saving a track keeps existing effect keyframes byte-for-byte',
  async ({ request }) => {
    const id = await itemId(request);
    const trackId = freshTrackId();
    const original = roundTripBytes();
    expect((await saveTrack(request, id, trackId)).ok()).toBeTruthy();
    const response = await request.get(
      `${emby()}/OpenLightFX/Studio/Tracks/${trackId}?itemId=${id}`,
      {
        headers: headers(),
        timeout: 5000,
      }
    );
    expect(response.ok()).toBeTruthy();
    expect(Buffer.compare(await response.body(), original)).toBe(0);
  }
);

requirement(
  'EDIT-013 @fullstack non-admin editor actions are disabled but Export remains available',
  async ({ page, request }) => {
    const id = await itemId(request);
    const trackId = freshTrackId();
    expect((await saveTrack(request, id, trackId)).ok()).toBeTruthy();
    const viewer = process.env.OLFX_VIEWER_TOKEN;
    expect(viewer).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${viewer}&itemId=${id}#/edit/${id}/${trackId}`
    );
    await expect(page.getByRole('button', { name: 'File', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /Save/ })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: /Export/ })).toBeEnabled();
    await expect(page.getByRole('switch', { name: 'Lights' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Watch in Emby' })).toBeDisabled();
  }
);

requirement(
  'EDIT-014 @fullstack layout changes add and confirm channel removal',
  async ({ page, request }) => {
    const id = await itemId(request);
    const trackId = freshTrackId();
    expect((await saveTrack(request, id, trackId)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${trackId}`
    );
    const layout = page.getByRole('combobox', { name: 'Track layout' });
    await expect(page.locator('.lane-row')).toHaveCount(2);
    await layout.selectOption('LAYOUT_3_0');
    await expect(page.locator('.lane-row')).toHaveCount(3);
    const centerLane = page.locator('.lane').nth(1);
    const box = await centerLane.boundingBox();
    expect(box).toBeTruthy();
    for (const fraction of [0.2, 0.4, 0.6, 0.8])
      await page.mouse.click(box!.x + box!.width * fraction, box!.y + box!.height / 2);
    await expect(page.getByRole('button', { name: /Center keyframe at/ })).toHaveCount(4);
    page.once('dialog', (dialog) => dialog.dismiss());
    await layout.selectOption('LAYOUT_2_0');
    await expect(layout).toHaveValue('LAYOUT_3_0');
    page.once('dialog', (dialog) => dialog.accept());
    await layout.selectOption('LAYOUT_2_0');
    await expect(page.locator('.lane-row')).toHaveCount(2);
  }
);

requirement(
  'EDIT-009 @fullstack Lights previews sampled channel states through room routing',
  async ({ page, request }) => {
    const id = await itemId(request);
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${track}`
    );
    const lights = page.getByRole('switch', { name: 'Lights' });
    await expect(lights).toBeEnabled();
    const sent = Date.now();
    await lights.click();
    await expect(lights).toHaveAttribute('aria-checked', 'true');
    try {
      await expect
        .poll(
          () =>
            readNdjson().some(
              (line) =>
                line.event === 'command_received' &&
                line.bulb_id === 'left' &&
                Date.parse(line.ts) >= sent - 50 &&
                commanded(line).r === 10 &&
                commanded(line).g === 20 &&
                commanded(line).b === 30 &&
                commanded(line).brightness === 40
            ),
          { timeout: 3000 }
        )
        .toBe(true);
    } finally {
      if ((await lights.getAttribute('aria-checked')) === 'true') await lights.click();
    }
  }
);

requirement(
  'WATCH-001 @fullstack active track is selected globally and device overrides clear',
  async ({ request }) => {
    const id = await itemId(request, 'zero');
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    const listed = await (
      await request.get(`${emby()}/OpenLightFX/Tracks/ByItem?ItemId=${id}`, {
        headers: headers(),
        timeout: 5000,
      })
    ).json();
    const trackPath = listed.tracks.find((entry: { trackPath: string }) =>
      entry.trackPath.includes(track)
    )?.trackPath;
    expect(trackPath).toEqual(expect.any(String));
    const deviceSelection = await request.post(`${emby()}/OpenLightFX/Tracks/Select`, {
      headers: headers(),
      data: { itemId: id, trackPath, deviceId: 'legacy-device' },
      timeout: 5000,
    });
    expect(deviceSelection.ok()).toBeTruthy();
    const activated = await request.post(`${emby()}/OpenLightFX/Studio/Items/${id}/ActiveTrack`, {
      headers: headers(),
      data: { trackId: track, serverId: 'emby-server-id' },
      timeout: 5000,
    });
    expect(activated.ok()).toBeTruthy();
    const result = await activated.json();
    expect(result).toEqual({
      trackId: track,
      embyUrl: `/web/index.html#!/item?id=${id}&serverId=emby-server-id`,
    });
    const selections = await (
      await request.get(`${emby()}/OpenLightFX/Tracks/ByItem?ItemId=${id}&DeviceId=legacy-device`, {
        headers: headers(),
        timeout: 5000,
      })
    ).json();
    expect(selections.globalSelectedTrack).toContain(`${track}.lightfx`);
    expect(selections.deviceSelectedTrack ?? null).toBeNull();
    await request.post(`${emby()}/OpenLightFX/Tracks/Select`, {
      headers: headers(),
      data: { itemId: id, deviceId: 'legacy-device' },
      timeout: 5000,
    });
    await request.post(`${emby()}/OpenLightFX/Tracks/Select`, {
      headers: headers(),
      data: { itemId: id },
      timeout: 5000,
    });
  }
);

requirement(
  'WATCH-001 @fullstack Watch in Emby saves, activates, and opens the edited track',
  async ({ page, request }) => {
    const id = await itemId(request, 'hdr');
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    await page.goto(
      `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${track}`
    );
    const lane = page.locator('.lane').first();
    const laneBox = await lane.boundingBox();
    expect(laneBox).toBeTruthy();
    await page.mouse.click(laneBox!.x + laneBox!.width * 0.8, laneBox!.y + laneBox!.height / 2);
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Watch in Emby' }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(new RegExp(`/web/index\\.html#!/item\\?id=${id}`));
    const rooms = await (
      await request.get(`${emby()}/OpenLightFX/Studio/Rooms`, {
        headers: headers(),
        timeout: 5000,
      })
    ).json();
    const room = rooms.find((candidate: { name: string }) => candidate.name === 'Fullstack Room');
    await expect(page.getByRole('status')).toContainText(
      `Plays in Emby. Start clip-b on ${room.screen.deviceName}`
    );
    const selected = await (
      await request.get(`${emby()}/OpenLightFX/Tracks/ByItem?ItemId=${id}`, {
        headers: headers(),
        timeout: 5000,
      })
    ).json();
    expect(selected.globalSelectedTrack).toContain(`${track}.lightfx`);
    await request.post(`${emby()}/OpenLightFX/Tracks/Select`, {
      headers: headers(),
      data: { itemId: id },
      timeout: 5000,
    });
    await popup.close();
  }
);

requirement(
  'MODEL-004 @fullstack server routing labels every channel and bulb',
  async ({ request }) => {
    const room = await ensureRoom(request);
    const response = await request.get(
      `${emby()}/OpenLightFX/Studio/Rooms/${room}/Routing?layout=LAYOUT_5_0`,
      { headers: headers(), timeout: 5000 }
    );
    expect(response.ok()).toBeTruthy();
    const routing = await response.json();
    expect(
      routing.channels.find(
        (channel: { channelId: string }) => channel.channelId === 'surround-left'
      )
    ).toMatchObject({
      position: 'surround-left',
      bulbIds: ['left'],
      foldedInto: ['left'],
    });
    expect(
      routing.bulbs.find((bulb: { bulbId: string }) => bulb.bulbId === 'left').sources
    ).toEqual(
      expect.arrayContaining([
        { channelId: 'left', kind: 'native' },
        { channelId: 'center', kind: 'fold' },
        { channelId: 'surround-left', kind: 'fold' },
      ])
    );
  }
);

requirement('PREV-004 @fullstack preview start uses selected room routing', async ({ request }) => {
  const started = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Start`, {
    headers: headers(),
    // The test room and its two bulbs are seeded in the disposable Emby data volume.
    data: { roomId: await ensureRoom(request), channels: previewChannels2(), takeover: true },
    timeout: 5000,
  });
  expect(started.ok()).toBeTruthy();
});

requirement(
  'PREV-005 @fullstack preview mappings are transient, not saved as plugin configuration',
  async ({ request }) => {
    // Preview mappings are request-local; the plugin has no persisted mapping-profile settings.
    const started = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Start`, {
      headers: headers(),
      data: { roomId: await ensureRoom(request), channels: previewChannels2(), takeover: true },
      timeout: 5000,
    });
    expect(started.ok()).toBeTruthy();
    await request.post(`${emby()}/OpenLightFX/Studio/Preview/Stop`, {
      headers: headers(),
      timeout: 5000,
    });
    const settings = await (
      await request.get(`${emby()}/OpenLightFX/Settings`, { headers: headers(), timeout: 5000 })
    ).json();
    expect(settings).not.toHaveProperty('mappingProfilesJson');
    expect(settings).not.toHaveProperty('bulbConfigJson');
  }
);

requirement(
  'PREV-006 @fullstack preview color reaches the simulator within 300 ms',
  async ({ request }) => {
    const started = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Start`, {
      headers: headers(),
      data: { roomId: await ensureRoom(request), channels: previewChannels2(), takeover: true },
      timeout: 5000,
    });
    expect(started.ok()).toBeTruthy();
    try {
      const sent = Date.now();
      const frame = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Frame`, {
        headers: { ...headers(), 'content-type': 'application/json' },
        data: {
          states: [
            { channelId: 'left', r: 255, g: 0, b: 0, brightness: 100, transitionMs: 0 },
            { channelId: 'right', r: 0, g: 0, b: 0, brightness: 0, transitionMs: 0 },
          ],
        },
        timeout: 5000,
      });
      expect(frame.ok()).toBeTruthy();
      let hit: Record<string, any> | undefined;
      await expect
        .poll(
          () => {
            hit = readNdjson().find(
              (line) =>
                line.event === 'command_received' &&
                line.bulb_id === 'left' &&
                Date.parse(line.ts) >= sent - 50 &&
                commanded(line).r === 255 &&
                commanded(line).g === 0 &&
                commanded(line).b === 0 &&
                commanded(line).brightness === 100
            );
            return Boolean(hit);
          },
          { timeout: 2000 }
        )
        .toBe(true);
      expect(Date.parse(hit!.ts) - sent).toBeLessThanOrEqual(300);
    } finally {
      await request.post(`${emby()}/OpenLightFX/Studio/Preview/Stop`, {
        headers: headers(),
        timeout: 5000,
      });
    }
  }
);

requirement('PREV-007 @fullstack stop restores the bulb snapshot', async ({ request }) => {
  const started = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Start`, {
    headers: headers(),
    data: { roomId: await ensureRoom(request), channels: previewChannels2(), takeover: true },
    timeout: 5000,
  });
  expect(started.ok()).toBeTruthy();
  const frame = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Frame`, {
    headers: { ...headers(), 'content-type': 'application/json' },
    data: {
      states: [
        { channelId: 'left', r: 9, g: 8, b: 7, brightness: 11, transitionMs: 0 },
        { channelId: 'right', r: 0, g: 0, b: 0, brightness: 0, transitionMs: 0 },
      ],
    },
    timeout: 5000,
  });
  expect(frame.ok()).toBeTruthy();
  await expect
    .poll(
      () =>
        readNdjson().some(
          (line) => commanded(line).r === 9 && commanded(line).g === 8 && commanded(line).b === 7
        ),
      { timeout: 5000 }
    )
    .toBe(true);
  const stopped = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Stop`, {
    headers: headers(),
    timeout: 5000,
  });
  expect(stopped.ok()).toBeTruthy();
  await expect
    .poll(
      () => {
        const lines = readNdjson().filter(
          (line) => line.event === 'command_received' && line.bulb_id === 'left'
        );
        const preview = lines.findIndex(
          (line) => commanded(line).r === 9 && commanded(line).g === 8 && commanded(line).b === 7
        );
        if (preview < 0) return false;
        return lines
          .slice(preview + 1)
          .some(
            (line) =>
              !(commanded(line).r === 9 && commanded(line).g === 8 && commanded(line).b === 7)
          );
      },
      { timeout: 5000 }
    )
    .toBe(true);
});

requirement(
  'PREV-008 @fullstack start without takeover is 409 while Emby plays',
  async ({ request }) => {
    const id = await itemId(request);
    await ensureRoom(request);
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    const clearSelection = await selectTrackForPlayback(request, id, track);
    const stopPlayback = await reportPlayback(request, id);
    try {
      await expect
        .poll(
          async () => {
            const response = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Start`, {
              headers: headers(),
              data: { roomId: await ensureRoom(request), channels: previewChannels2() },
              timeout: 5000,
            });
            return `${response.status()} ${await response.text()}`;
          },
          { timeout: 8000 }
        )
        .toMatch(/^409\b[\s\S]*playback_active/);
    } finally {
      await stopPlayback();
      await clearSelection();
    }
  }
);

requirement('PREV-010 @fullstack a non-admin save is forbidden', async ({ request }) => {
  const response = await request.put(
    `${emby()}/OpenLightFX/Studio/Tracks/proxy-fixture?itemId=${await itemId(request)}`,
    {
      // A real non-admin session. An unknown token is 401 from Emby itself, not the plugin's 403.
      headers: { 'X-Emby-Token': process.env.OLFX_VIEWER_TOKEN || 'harness-missing-viewer-token' },
      data: Buffer.from([0]),
      timeout: 5000,
    }
  );
  expect(response.status()).toBe(403);
});

requirement('PERF-001 @fullstack the shell is ready within 2 seconds', async ({ page }) => {
  const started = Date.now();
  await page.goto(`${emby()}/emby/OpenLightFX/studio/?api_key=${token()}`);
  await expect(page.getByRole('searchbox', { name: 'Search', exact: true })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(2000);
});

requirement('PERF-004 @fullstack studio does not fetch the source MKV', async ({ page }) => {
  const urls: string[] = [];
  page.on('response', (response) => urls.push(response.url()));
  const hdr = await itemId(page.request, 'hdr');
  const track = freshTrackId();
  expect((await saveTrack(page.request, hdr, track)).ok()).toBeTruthy();
  await page.goto(
    `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${hdr}#/edit/${hdr}/${track}`
  );
  // Vacuous unless the editor actually loaded a picture for the HEVC clip.
  await expect
    .poll(
      async () => page.locator('video').evaluate((node) => (node as HTMLVideoElement).readyState),
      { timeout: 10_000 }
    )
    .toBeGreaterThanOrEqual(2);
  expect(urls.some((url) => /clip-b-hevc|\.mkv/.test(url) && !url.includes('MediaInfo'))).toBe(
    false
  );
});

requirement('ERR-003 @fullstack a save conflict returns the server text', async ({ request }) => {
  const id = await itemId(request);
  const track = freshTrackId();
  expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
  const listed = await (
    await request.get(`${emby()}/OpenLightFX/Studio/Tracks?itemId=${id}`, {
      headers: headers(),
      timeout: 5000,
    })
  ).json();
  const row = listed.find(
    (entry: { trackId: string; updatedAt?: string }) => entry.trackId === track
  );
  expect(row?.updatedAt).toEqual(expect.any(String));
  const conflict = await saveTrack(request, id, track, 'stale-token');
  expect(conflict.status()).toBe(409);
  const text = await conflict.text();
  expect(text).toMatch(/conflict/i);
  expect(text).toContain(row.updatedAt);
});

requirement(
  'PLUG-001 @fullstack media info reports timing HDR and proxy progress',
  async ({ request }) => {
    const info = await (
      await request.get(`${emby()}/OpenLightFX/Studio/Items/${await itemId(request)}/MediaInfo`, {
        headers: headers(),
        timeout: 5000,
      })
    ).json();
    expect(info).toEqual(
      expect.objectContaining({
        runtimeMs: expect.any(Number),
        width: expect.any(Number),
        videoCodec: expect.any(String),
      })
    );
    expect(['missing', 'building', 'ready', 'failed']).toContain(info.proxy.state);
    if (info.proxy.state === 'failed') {
      expect(info.proxy.reason).toEqual(expect.any(String));
      expect(info.proxy.reason).not.toMatch(/api_key/i);
    }
  }
);

requirement(
  'PLUG-002 @fullstack the frame endpoint tone-maps HDR with hable',
  async ({ request }) => {
    const response = await request.get(
      `${emby()}/OpenLightFX/Studio/Items/${await itemId(request)}/Frame?timeMs=2500`,
      { headers: headers(), timeout: 5000 }
    );
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    expect(
      Math.abs(Number(response.headers()['x-openlightfx-source-time-ms']) - 2500)
    ).toBeLessThanOrEqual(40);
  }
);

requirement('PLUG-003 @fullstack the proxy is H.264 with a short GOP', async ({ request }) => {
  const started = await request.post(
    `${emby()}/OpenLightFX/Studio/Items/${await itemId(request)}/Proxy`,
    { headers: headers(), timeout: 5000 }
  );
  expect(started.ok()).toBeTruthy();
  const body = await started.json();
  expect(body.editUrl).toBeTruthy();
  expect(body.keyframeIntervalMs ?? 500).toBeLessThanOrEqual(500);
});

requirement(
  'PLUG-004 @fullstack the sidecar is stored and is not a playback file',
  async ({ request }) => {
    const body = {
      version: 1,
      itemId: '42',
      trackId: 'proxy-fixture',
      sceneMarkers: [{ id: 'm1', timeMs: 1000, label: 'Intro', kind: 'manual' }],
      channelGroups: [
        { id: 'g1', name: 'Walls', mode: 'mirror', channelIds: ['left', 'right'], spreadMs: 150 },
      ],
    };
    const put = await request.put(
      `${emby()}/OpenLightFX/Studio/Projects/proxy-fixture?itemId=${await itemId(request)}`,
      {
        headers: headers(),
        data: body,
        timeout: 5000,
      }
    );
    expect(put.ok()).toBeTruthy();
  }
);

requirement(
  'PLUG-005 @fullstack preview refuses or takes over an active session',
  async ({ request }) => {
    const id = await itemId(request);
    await ensureRoom(request);
    const track = freshTrackId();
    expect((await saveTrack(request, id, track)).ok()).toBeTruthy();
    const clearSelection = await selectTrackForPlayback(request, id, track);
    const stopPlayback = await reportPlayback(request, id);
    try {
      const refused = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Start`, {
        headers: headers(),
        data: { roomId: await ensureRoom(request), channels: previewChannels2() },
        timeout: 5000,
      });
      expect(refused.status()).toBe(409);
      expect(await refused.text()).toContain('playback_active');
      const taken = await request.post(`${emby()}/OpenLightFX/Studio/Preview/Start`, {
        headers: headers(),
        data: { roomId: await ensureRoom(request), channels: previewChannels2(), takeover: true },
        timeout: 5000,
      });
      expect(taken.ok()).toBeTruthy();
      expect((await taken.json()).status).toBe('started');
    } finally {
      await request.post(`${emby()}/OpenLightFX/Studio/Preview/Stop`, {
        headers: headers(),
        timeout: 5000,
      });
      await stopPlayback();
      await clearSelection();
    }
  }
);
requirement(
  'EDIT-010 @fullstack no-room editor still authors and saves tracks',
  async ({ page, request }) => {
    const id = await itemId(request);
    const trackId = freshTrackId();
    expect((await saveTrack(request, id, trackId)).ok()).toBeTruthy();
    const rooms = await (
      await request.get(`${emby()}/OpenLightFX/Studio/Rooms`, { headers: headers(), timeout: 5000 })
    ).json();
    const original = rooms.find((room: { name: string }) => room.name === 'Fullstack Room');
    expect(original).toBeTruthy();
    const deleted = await request.delete(`${emby()}/OpenLightFX/Studio/Rooms/${original.id}`, {
      headers: headers(),
      timeout: 5000,
    });
    expect(deleted.ok()).toBeTruthy();
    try {
      await page.goto(
        `${emby()}/emby/OpenLightFX/studio/?api_key=${token()}&itemId=${id}#/edit/${id}/${trackId}`
      );
      await expect(page.getByText(/Set up a room to preview on your lights/)).toBeVisible();
      const lights = page.getByRole('switch', { name: 'Lights' });
      await expect(lights).toBeDisabled();
      await expect(lights).toHaveAttribute('title', 'Set up a room first');
      const lane = page.locator('.lane').first();
      const box = await lane.boundingBox();
      expect(box).toBeTruthy();
      await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height / 2);
      await page.getByRole('button', { name: 'File', exact: true }).click();
      await page.getByRole('menuitem', { name: /Save/ }).click();
      await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    } finally {
      const restored = await request.post(`${emby()}/OpenLightFX/Studio/Rooms`, {
        headers: headers(),
        data: {
          name: original.name,
          screenDeviceId: original.screen.deviceId,
          deviceName: original.screen.deviceName,
          appName: original.screen.appName,
          bulbs: original.bulbs,
        },
        timeout: 5000,
      });
      expect(restored.ok()).toBeTruthy();
    }
  }
);

requirement('PLUG-006 @fullstack the editor routes keep their shapes', async ({ request }) => {
  const bulbs = await (
    await request.get(`${emby()}/OpenLightFX/Studio/Bulbs`, { headers: headers(), timeout: 5000 })
  ).json();
  expect(Array.isArray(bulbs)).toBe(true);
  const settings = await (
    await request.get(`${emby()}/OpenLightFX/Settings`, { headers: headers(), timeout: 5000 })
  ).json();
  expect(settings).toHaveProperty('photosensitivityMode');
});
