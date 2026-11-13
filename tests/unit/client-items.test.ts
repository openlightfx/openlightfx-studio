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
