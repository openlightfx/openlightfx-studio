import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSceneCutJob,
  fetchSceneCuts,
  SCENE_CUT_ROUTES,
  SceneCutAlreadyRunningError,
  SceneCutForbiddenError,
  startSceneCutDetection,
} from '$lib/api/client';
import {
  adjacentSceneStopMs,
  parseSceneCuts,
  sceneCutLineTimesMs,
  type SceneCuts,
} from '$lib/domain/scene-cuts';
import {
  mergeSceneCuts,
  readSceneCutCache,
  SCENE_CUT_CACHE_KEY,
  writeSceneCutCache,
} from '$lib/studio/scene-cut-cache';

const ready: SceneCuts = {
  itemId: 'movie-42',
  status: 'ready',
  detector: { name: 'ContentDetector', threshold: 27, fps: 24, minSceneLen: 15 },
  durationSeconds: 10,
  cuts: [1, 5, 9],
  updatedAt: '2026-11-17T18:00:00.000Z',
};

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe('scene cut navigation', () => {
  it('steps through the start, each cut, and the end', () => {
    expect(adjacentSceneStopMs(ready.cuts, 0, 1, 10_000)).toBe(1_000);
    expect(adjacentSceneStopMs(ready.cuts, 1_000, -1, 10_000)).toBe(0);
    expect(adjacentSceneStopMs(ready.cuts, 1_000, 1, 10_000)).toBe(5_000);
    expect(adjacentSceneStopMs(ready.cuts, 3_000, -1, 10_000)).toBe(1_000);
    expect(adjacentSceneStopMs(ready.cuts, 3_000, 1, 10_000)).toBe(5_000);
    expect(adjacentSceneStopMs(ready.cuts, 9_000, 1, 10_000)).toBe(10_000);
    expect(adjacentSceneStopMs(ready.cuts, 10_000, 1, 10_000)).toBeNull();
    expect(adjacentSceneStopMs(ready.cuts, 0, -1, 10_000)).toBeNull();
  });

  it('does not navigate when the movie has no cuts', () => {
    expect(adjacentSceneStopMs([], 2_000, 1, 10_000)).toBeNull();
    expect(adjacentSceneStopMs([0], 2_000, -1, 10_000)).toBeNull();
  });

  it('draws only cuts that fall inside the movie', () => {
    expect(sceneCutLineTimesMs([0, 1.5, 1.5, 12], 10_000)).toEqual([1_500]);
  });
});

describe('scene cut cache', () => {
  it('round-trips a movie and ignores corrupt or mismatched records', () => {
    const cache = storage();
    writeSceneCutCache(cache, ready);
    expect(readSceneCutCache(cache, 'movie-42')).toEqual(ready);
    expect(readSceneCutCache(cache, 'other')).toBeNull();
    cache.values.set(SCENE_CUT_CACHE_KEY, '{bad');
    expect(readSceneCutCache(cache, 'movie-42')).toBeNull();
    cache.values.set(
      SCENE_CUT_CACHE_KEY,
      JSON.stringify({ version: 1, items: { 'movie-42': { itemId: 'nope' } } })
    );
    expect(readSceneCutCache(cache, 'movie-42')).toBeNull();
  });

  it('uses a newer ready copy and keeps the cuts a running or stale server still returns', () => {
    const newer = { ...ready, cuts: [2], updatedAt: '2026-11-17T19:00:00.0000000Z' };
    expect(mergeSceneCuts(ready, newer)?.cuts).toEqual([2]);
    const stale = {
      ...ready,
      status: 'stale' as const,
      cuts: [1, 5],
      updatedAt: '2026-11-17T17:00:00.0000000Z',
    };
    expect(mergeSceneCuts(ready, stale)).toEqual(stale);
    const running = { ...ready, status: 'running' as const, cuts: [1, 5, 9] };
    expect(mergeSceneCuts({ ...ready, cuts: [1] }, running)).toEqual(running);
    expect(mergeSceneCuts(ready, { ...running, cuts: [] })).toEqual({
      ...ready,
      status: 'running',
    });
    const older = { ...ready, cuts: [4], updatedAt: '2026-11-17T17:00:00.000Z' };
    expect(mergeSceneCuts(ready, older)?.cuts).toEqual(ready.cuts);
    expect(
      mergeSceneCuts(ready, { ...ready, status: 'none', cuts: [], updatedAt: '' })?.cuts
    ).toEqual([]);
  });

  it('accepts the documented document and sorts cuts', () => {
    expect(
      parseSceneCuts({
        ...ready,
        cuts: [9, 1, 5],
      })?.cuts
    ).toEqual([1, 5, 9]);
    expect(parseSceneCuts({ ...ready, status: 'missing' })).toBeNull();
  });
});

describe('scene cut routes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads, starts, and polls through the route constants', async () => {
    vi.stubGlobal('location', { search: '?api_key=unit-test' });
    const requests: Array<{ path: string; method: string; body?: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://studio.test');
        requests.push({
          path: `${url.pathname}${url.search}`,
          method: init?.method ?? 'GET',
          body: init?.body?.toString(),
        });
        if (url.pathname === '/OpenLightFX/Studio/Session')
          return Response.json({ accessToken: 'unit-test' });
        if (url.pathname.endsWith('/SceneCuts') && (init?.method ?? 'GET') === 'GET')
          return Response.json(ready);
        if (url.pathname.endsWith('/SceneCuts'))
          return Response.json({
            jobId: 'job-1',
            itemId: 'movie-42',
            state: 'processing',
            error: '',
            progress: 0.4,
            throughMs: 1000,
          });
        return Response.json({
          jobId: 'job-1',
          itemId: 'movie-42',
          state: 'done',
          error: '',
          progress: 1,
          throughMs: 10_000,
        });
      })
    );

    await expect(fetchSceneCuts('movie-42')).resolves.toEqual(ready);
    await expect(startSceneCutDetection('movie-42', 0.27)).resolves.toMatchObject({
      jobId: 'job-1',
      progress: 0.4,
    });
    await expect(fetchSceneCutJob('job-1')).resolves.toMatchObject({ state: 'done' });
    expect(requests.map((request) => request.path)).toEqual([
      '/OpenLightFX/Studio/Session',
      SCENE_CUT_ROUTES.document('movie-42'),
      SCENE_CUT_ROUTES.start('movie-42'),
      SCENE_CUT_ROUTES.job('job-1'),
    ]);
    expect(requests[2].body).toBe(JSON.stringify({ sceneCutThreshold: 0.27 }));
  });

  it('treats a missing document as no cuts', async () => {
    vi.stubGlobal('location', { search: '?api_key=unit-test' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://studio.test');
        if (url.pathname === '/OpenLightFX/Studio/Session')
          return Response.json({ accessToken: 'unit-test' });
        return new Response('missing', { status: 404 });
      })
    );
    await expect(fetchSceneCuts('movie-42')).resolves.toMatchObject({
      itemId: 'movie-42',
      status: 'none',
      cuts: [],
    });
  });

  it('treats 403 as not allowed and 409 as already running', async () => {
    vi.stubGlobal('location', { search: '?api_key=unit-test' });
    let post = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://studio.test');
        if (url.pathname === '/OpenLightFX/Studio/SceneCuts/missing')
          return new Response('missing', { status: 404 });
        if ((init?.method ?? 'GET') !== 'POST') return Response.json({ accessToken: 'unit-test' });
        post += 1;
        return new Response('no', { status: post === 1 ? 403 : 409 });
      })
    );
    await expect(startSceneCutDetection('movie-42')).rejects.toBeInstanceOf(SceneCutForbiddenError);
    await expect(startSceneCutDetection('movie-42')).rejects.toBeInstanceOf(
      SceneCutAlreadyRunningError
    );
    await expect(fetchSceneCutJob('missing')).resolves.toBeNull();
  });
});
