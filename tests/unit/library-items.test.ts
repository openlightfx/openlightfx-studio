import { expect, it } from 'vitest';
import { libraryItemFromApi } from '$lib/api/items';

it('MEDIA-001 @unit Emby Name and ProductionYear become the visible movie', () => {
  const item = libraryItemFromApi({
    Id: '9001',
    Name: 'Glass Harbor',
    ProductionYear: 2017,
    RunTimeTicks: 6_060_000 * 10_000,
    ImageTags: { Primary: 'abc' },
  });
  expect(item).toMatchObject({
    itemId: '9001',
    name: 'Glass Harbor',
    year: 2017,
    runtimeMs: 6_060_000,
  });
  expect(item.posterUrl).toBe('/emby/Items/9001/Images/Primary?tag=abc&maxHeight=240');
  const untitled = libraryItemFromApi({ itemId: '2', year: 2012 });
  expect(untitled.name).toBe('');
  expect(untitled.posterUrl).toBe('');
});
