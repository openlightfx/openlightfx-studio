import type { LibraryItem } from './types';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Emby `ImageTags.Primary`, or the Studio field `primaryImageTag`. */
export function primaryImageTag(raw: Record<string, unknown>): string {
  const tags = raw.ImageTags ?? raw.imageTags;
  if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
    const record = tags as Record<string, unknown>;
    const tagged = text(record.Primary ?? record.primary);
    if (tagged) return tagged;
  }
  return text(raw.primaryImageTag ?? raw.PrimaryImageTag);
}

export function embyPrimaryUrl(itemId: string, tag: string): string {
  const query = new URLSearchParams({ tag, maxHeight: '240' });
  return `/emby/Items/${encodeURIComponent(itemId)}/Images/Primary?${query}`;
}

/** Accept the Studio contract and the Emby item fields a large library actually returns. */
export function libraryItemFromApi(raw: Record<string, unknown>): LibraryItem {
  const itemId = text(raw.itemId ?? raw.Id ?? raw.id);
  const name = text(raw.name ?? raw.Name ?? raw.title ?? raw.Title);
  const year = Math.round(number(raw.year ?? raw.ProductionYear ?? raw.productionYear));
  let runtimeMs = number(raw.runtimeMs);
  if (!runtimeMs) runtimeMs = Math.round(number(raw.RunTimeTicks) / 10_000);
  const given = text(raw.posterUrl ?? raw.PosterUrl);
  const tag = primaryImageTag(raw);
  const posterUrl = given || (itemId && tag ? embyPrimaryUrl(itemId, tag) : '');
  const dateAdded = text(raw.dateAdded ?? raw.DateAdded);
  return {
    itemId,
    name,
    year,
    runtimeMs,
    posterUrl,
    dateAdded,
    trackCount: Math.max(0, Math.round(number(raw.trackCount ?? raw.TrackCount))),
    hasActiveTrack: Boolean(raw.hasActiveTrack ?? raw.HasActiveTrack),
  };
}
