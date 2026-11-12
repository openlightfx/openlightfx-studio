#!/usr/bin/env node
/**
 * Emby first-run wizard for the 4.8 server in docker-compose.fullstack.yml.
 * Prints the admin API key on stdout as JSON.
 */
const base = (process.env.OLFX_EMBY_URL ?? 'http://127.0.0.1:8096').replace(/\/$/, '');
const user = process.env.OLFX_EMBY_USER ?? 'admin';
const password = process.env.OLFX_EMBY_PASSWORD ?? 'openlightfx-test';

async function json(path, body, token, deviceId = 'openlightfx-fullstack', method) {
  const response = await fetch(`${base}${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      // Emby 4.8+ stores a device row per session; without a DeviceId AuthenticateByName fails with a SQLite NOT NULL error.
      'X-Emby-Authorization': `MediaBrowser Client="OpenLightFX Tests", Device="fullstack", DeviceId="${deviceId}", Version="1.0.0"`,
      ...(token ? { 'X-Emby-Token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function waitReady() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const info = await json('/emby/System/Info/Public');
      if (info.status === 200) return info.body;
    } catch {
      // server still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Emby did not answer at ${base}`);
}

const info = await waitReady();
let token = process.env.OLFX_API_KEY || '';
if (!info.StartupWizardCompleted) {
  const steps = [
    [
      '/emby/Startup/Configuration',
      { UICulture: 'en-us', MetadataCountryCode: 'US', PreferredMetadataLanguage: 'en' },
    ],
    ['/emby/Startup/User', { Name: user, Password: password }],
    ['/emby/Startup/RemoteAccess', { EnableRemoteAccess: false }],
    ['/emby/Startup/Complete', {}],
  ];
  for (const [path, body] of steps) {
    const result = await json(path, body);
    // /System/Info/Public does not report StartupWizardCompleted on 4.8/4.9, so a rerun
    // (after the plugin restart) reaches the wizard again. Emby answers 401 once it is done.
    if (result.status === 401 && path === steps[0][0]) break;
    if (result.status >= 400) {
      console.error(path, result.status, result.body);
      process.exit(1);
    }
  }
}

if (!token) {
  const auth = await json('/emby/Users/AuthenticateByName', { Username: user, Pw: password });
  token = auth.body?.AccessToken;
  if (!token) {
    console.error('authenticate failed', auth.status, auth.body);
    process.exit(1);
  }
  const key = await json('/emby/Auth/Keys', { App: 'OpenLightFX Studio tests' }, token);
  token = key.body?.AccessToken || key.body?.Token || token;
}

const library = await fetch(
  `${base}/emby/Library/VirtualFolders?name=Movies&collectionType=movies&refreshLibrary=true&paths=/media`,
  { method: 'POST', headers: { 'X-Emby-Token': token } }
);
if (library.status >= 400 && library.status !== 500) {
  console.error('library', library.status, await library.text());
}

// A non-admin user for the 403 checks (PREV-010). A separate DeviceId keeps Emby
// from revoking the admin session that shares a device.
const viewerName = process.env.OLFX_EMBY_VIEWER ?? 'viewer';
let viewer = await json('/emby/Users/New', { Name: viewerName }, token);
let viewerToken = '';
const viewerAuth = await json(
  '/emby/Users/AuthenticateByName',
  { Username: viewerName, Pw: '' },
  undefined,
  'openlightfx-fullstack-viewer'
);
viewerToken = viewerAuth.body?.AccessToken ?? '';
if (viewerAuth.body?.User?.Policy?.IsAdministrator) {
  console.error('viewer user is an administrator');
  process.exit(1);
}

// Point the plugin at the two simulator REST bulbs (docker/simulator.toml).
// Fails harmlessly on the first pass, before the plugin is installed.
const template = (port) =>
  `http://simulator:${port}/api/light?r={r}&g={g}&b={b}&brightness={brightness}&transition_ms={transition_ms}&power={power}`;
const bulbs = [
  {
    protocol: 'Rest',
    Id: 'left',
    name: 'Left',
    IpAddress: '0.0.0.0',
    Port: 9200,
    restUrlTemplate: template(9200),
    restHttpMethod: 'GET',
  },
  {
    protocol: 'Rest',
    Id: 'right',
    name: 'Right',
    IpAddress: '0.0.0.0',
    Port: 9201,
    restUrlTemplate: template(9201),
    restHttpMethod: 'GET',
  },
];
const seeded = await json(
  '/OpenLightFX/Settings',
  { BulbConfigJson: JSON.stringify(bulbs) },
  token,
  undefined,
  'PUT'
);
const pluginLoaded =
  seeded.status < 400 && String(seeded.body?.BulbConfigJson ?? '').includes('simulator');

// MEDIA-015: keep Emby's runtime at 0 so the plugin fills it from ffprobe.
// LockData stops the next library refresh from copying the file duration back.
const deadline = Date.now() + 60_000;
let zeroId = '';
while (Date.now() < deadline && !zeroId) {
  const listed = await json(
    '/emby/Items?Recursive=true&IncludeItemTypes=Movie&SearchTerm=clip-zero',
    undefined,
    token
  );
  const items = listed.body?.Items ?? [];
  const found = items.find((item) => item.Name === 'clip-zero');
  zeroId = found?.Id ?? '';
  if (!zeroId) await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (zeroId) {
  const locked = await json(
    `/emby/Items/${zeroId}`,
    { Id: zeroId, Name: 'clip-zero', RunTimeTicks: 0, LockData: true },
    token,
    undefined,
    'POST'
  );
  if (locked.status >= 400) {
    console.error('clip-zero runtime lock', locked.status, locked.body);
    process.exit(1);
  }
}

console.log(JSON.stringify({ apiKey: token, viewerToken, user, emby: base, pluginLoaded, zeroId }));
