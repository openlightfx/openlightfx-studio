import type { LibraryItem } from './types';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Accept the Studio contract and the Emby item fields a large library actually returns. */
export function libraryItemFromApi(raw: Record<string, unknown>): LibraryItem {
  const itemId = text(raw.itemId ?? raw.Id ?? raw.id);
  const name = text(raw.name ?? raw.Name ?? raw.title ?? raw.Title);
  const year = Math.round(number(raw.year ?? raw.ProductionYear ?? raw.productionYear));
  let runtimeMs = number(raw.runtimeMs);
  if (!runtimeMs) runtimeMs = Math.round(number(raw.RunTimeTicks) / 10_000);
  const given = text(raw.posterUrl ?? raw.PosterUrl);
  const posterUrl =
    given ||
    (itemId ? `/emby/Items/${encodeURIComponent(itemId)}/Images/Primary?maxHeight=160` : '');
  return { itemId, name, year, runtimeMs, posterUrl };
}
