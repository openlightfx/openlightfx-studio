/** Server root detection for a Studio build served under the Emby plugin. */

export function detectServerRoot(loc: { origin: string; pathname: string }): string {
  const marker = '/OpenLightFX/studio';
  const idx = loc.pathname.indexOf(marker);
  if (idx >= 0) return loc.origin + loc.pathname.slice(0, idx);
  return loc.origin;
}

export function joinServer(root: string, path: string): string {
  const base = root.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function resolveStreamUrl(serverRoot: string, url: string, token: string | null): string {
  if (!url) return '';
  const abs = new URL(url, `${serverRoot.replace(/\/$/, '')}/`);
  if (token && !abs.searchParams.has('api_key') && !abs.searchParams.has('X-Emby-Token')) {
    abs.searchParams.set('api_key', token);
  }
  return abs.toString();
}

export function findAccessToken(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;
  if (typeof value === 'string') return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findAccessToken(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    for (const key of ['AccessToken', 'accessToken', 'Token']) {
      const token = rec[key];
      if (typeof token === 'string' && token.length > 8) return token;
    }
    for (const entry of Object.values(rec)) {
      const found = findAccessToken(entry, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

interface ApiClientLike {
  accessToken?: string | (() => string);
  _accessToken?: string;
}

function tokenFromClient(client: ApiClientLike | undefined): string | null {
  if (!client) return null;
  const direct = client.accessToken;
  if (typeof direct === 'string' && direct) return direct;
  if (typeof direct === 'function') {
    try {
      const value = direct();
      if (typeof value === 'string' && value) return value;
    } catch {
      /* ignore */
    }
  }
  if (typeof client._accessToken === 'string' && client._accessToken) return client._accessToken;
  return null;
}

export function readEmbyToken(win: Window): string | null {
  const params = new URLSearchParams(win.location.search);
  const fromQuery = params.get('api_key') || params.get('token');
  if (fromQuery) return fromQuery;

  const views: Window[] = [win];
  try {
    if (win.parent && win.parent !== win) views.push(win.parent);
  } catch {
    /* cross-origin */
  }
  try {
    if (win.top && win.top !== win && win.top !== win.parent) views.push(win.top);
  } catch {
    /* cross-origin */
  }
  for (const view of views) {
    try {
      const client = (view as unknown as { ApiClient?: ApiClientLike }).ApiClient;
      const token = tokenFromClient(client);
      if (token) return token;
    } catch {
      /* cross-origin */
    }
  }

  try {
    for (let i = 0; i < win.localStorage.length; i++) {
      const key = win.localStorage.key(i);
      if (!key) continue;
      const raw = win.localStorage.getItem(key);
      if (!raw || raw.length > 200_000 || !/accessToken|AccessToken/i.test(raw)) continue;
      try {
        const token = findAccessToken(JSON.parse(raw));
        if (token) return token;
      } catch {
        /* not json */
      }
    }
  } catch {
    /* private mode */
  }
  return null;
}
