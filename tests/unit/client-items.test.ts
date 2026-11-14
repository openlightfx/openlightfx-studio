import { afterEach, expect, it, vi } from 'vitest';
import { fetchItems } from '$lib/api/client';

afterEach(() => vi.unstubAllGlobals());

it('LIB-001 @unit item listing follows every API page', async () => {
  vi.stubGlobal('location', { search: '' });
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://studio.test');
      const startIndexParam = url.searchParams.get('startIndex');
      if (startIndexParam !== null) requests.push(startIndexParam);
      const startIndex = Number(startIndexParam);
      const items =
        startIndex === 0
          ? Array.from({ length: 200 }, (_, index) => ({
              itemId: String(index + 1),
              name: `Movie ${index + 1}`,
            }))
          : [{ itemId: '201', name: 'Movie 201' }];
      return Response.json(items);
    })
  );

  const items = await fetchItems('');

  expect(requests).toEqual(['0', '200']);
  expect(items).toHaveLength(201);
  expect(items.at(-1)?.itemId).toBe('201');
});

it('LIB-002 @unit cancelled item listing passes its signal and never requests another page', async () => {
  vi.stubGlobal('location', { search: '' });
  const controller = new AbortController();
  controller.abort();
  const pages: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://studio.test');
      if (!url.searchParams.has('startIndex')) return Response.json({ accessToken: 'unit-test' });
      pages.push(url.searchParams.get('startIndex')!);
      expect(init?.signal).toBe(controller.signal);
      throw controller.signal.reason;
    })
  );
  await expect(fetchItems('old query', controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(pages).toEqual(['0']);
});

it('LIB-001 @unit repeated API pages are deduplicated rather than causing an infinite request loop', async () => {
  vi.stubGlobal('location', { search: '' });
  const pages: string[] = [];
  const rows = Array.from({ length: 200 }, (_, index) => ({
    itemId: String(index),
    name: `Movie ${index}`,
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://studio.test');
      if (url.searchParams.has('startIndex')) pages.push(url.searchParams.get('startIndex')!);
      return Response.json(rows);
    })
  );
  expect(await fetchItems('')).toHaveLength(200);
  expect(pages).toEqual(['0', '200']);
});
