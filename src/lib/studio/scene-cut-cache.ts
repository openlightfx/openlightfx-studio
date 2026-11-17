import { parseSceneCuts, type SceneCuts } from '$lib/domain/scene-cuts';

/** Local copy of scene cuts, keyed by Emby item id. Survives reloads without the server. */
export const SCENE_CUT_CACHE_KEY = 'openlightfx.scene-cuts.v1';

type SceneCutCacheFile = {
  version: 1;
  items: Record<string, SceneCuts>;
};

function readFile(storage: Pick<Storage, 'getItem'>): SceneCutCacheFile {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SCENE_CUT_CACHE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object' || (parsed as { version?: unknown }).version !== 1)
      return { version: 1, items: {} };
    const items = (parsed as { items?: unknown }).items;
    if (!items || typeof items !== 'object') return { version: 1, items: {} };
    return { version: 1, items: items as Record<string, SceneCuts> };
  } catch {
    return { version: 1, items: {} };
  }
}

export function readSceneCutCache(
  storage: Pick<Storage, 'getItem'>,
  itemId: string
): SceneCuts | null {
  const stored = readFile(storage).items[itemId];
  const parsed = parseSceneCuts(stored);
  return parsed?.itemId === itemId ? parsed : null;
}

export function writeSceneCutCache(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  cuts: SceneCuts
): void {
  const parsed = parseSceneCuts(cuts);
  if (!parsed) return;
  try {
    const file = readFile(storage);
    file.items[parsed.itemId] = parsed;
    storage.setItem(SCENE_CUT_CACHE_KEY, JSON.stringify(file));
  } catch {
    // A full or denied cache never blocks editing. The server copy remains the refresh source.
  }
}

function timestamp(value: string): number {
  // The plugin emits 7-digit fractions (2026-11-17T17:00:00.0000000Z). Date.parse accepts 3.
  const normalized = value.replace(/(\.\d{3})\d+(Z|[+-]\d{2}:\d{2})$/, '$1$2');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A failed fetch keeps `local`. A successful document replaces it when the server
 * has a ready copy at least as new, or when it reports running/stale/none.
 * Running and stale responses already include any saved cuts.
 */
export function mergeSceneCuts(
  local: SceneCuts | null,
  remote: SceneCuts | null
): SceneCuts | null {
  if (!remote) return local;
  if (!local || remote.itemId !== local.itemId) return remote;
  if (remote.status === 'ready') {
    if (local.status !== 'ready' || timestamp(remote.updatedAt) >= timestamp(local.updatedAt))
      return remote;
    return local;
  }
  if (
    (remote.status === 'running' || remote.status === 'stale') &&
    remote.cuts.length === 0 &&
    local.cuts.length > 0
  )
    return { ...local, status: remote.status };
  return remote;
}
