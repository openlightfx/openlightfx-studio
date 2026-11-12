#!/usr/bin/env node
/**
 * Emby first-run wizard for the 4.8 server in docker-compose.fullstack.yml.
 * Prints the admin API key on stdout as JSON.
 */
const base = (process.env.OLFX_EMBY_URL ?? 'http://127.0.0.1:8096').replace(/\/$/, '');
const user = process.env.OLFX_EMBY_USER ?? 'admin';
const password = process.env.OLFX_EMBY_PASSWORD ?? 'openlightfx-test';

async function json(path, body, token) {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
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
    ['/emby/Startup/Configuration', { UICulture: 'en-us', MetadataCountryCode: 'US', PreferredMetadataLanguage: 'en' }],
    ['/emby/Startup/User', { Name: user, Password: password }],
    ['/emby/Startup/RemoteAccess', { EnableRemoteAccess: false }],
    ['/emby/Startup/Complete', {}],
  ];
  for (const [path, body] of steps) {
    const result = await json(path, body);
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

console.log(JSON.stringify({ apiKey: token, user, emby: base }));
