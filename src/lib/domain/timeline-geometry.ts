/** CSS-pixel timeline coordinate transforms. `originClientX` is the viewport X at content time zero. */
export interface TimelineGeometry {
  originClientX: number;
  scrollX: number;
  pxPerMs: number;
  durationMs: number;
}

export function isValidTimelineScale(pxPerMs: number): boolean {
  return Number.isFinite(pxPerMs) && pxPerMs > 0;
}

export function clientXToViewportX(clientX: number, originClientX: number): number | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(originClientX)) return null;
  return clientX - originClientX;
}

export function viewportXToContentX(viewportX: number, scrollX: number): number | null {
  if (!Number.isFinite(viewportX) || !Number.isFinite(scrollX)) return null;
  return viewportX + scrollX;
}

export function contentXToTime(
  contentX: number,
  pxPerMs: number,
  durationMs: number
): number | null {
  if (
    !isValidTimelineScale(pxPerMs) ||
    !Number.isFinite(contentX) ||
    !Number.isFinite(durationMs) ||
    durationMs < 0
  )
    return null;
  return Math.max(0, Math.min(durationMs, contentX / pxPerMs));
}

export function timeToContentX(timeMs: number, pxPerMs: number, durationMs: number): number | null {
  if (
    !isValidTimelineScale(pxPerMs) ||
    !Number.isFinite(timeMs) ||
    !Number.isFinite(durationMs) ||
    durationMs < 0
  )
    return null;
  return Math.max(0, Math.min(durationMs, timeMs)) * pxPerMs;
}

export function clientXToTimelineTime(clientX: number, geometry: TimelineGeometry): number | null {
  const viewportX = clientXToViewportX(clientX, geometry.originClientX);
  if (viewportX === null) return null;
  const contentX = viewportXToContentX(viewportX, geometry.scrollX);
  return contentX === null ? null : contentXToTime(contentX, geometry.pxPerMs, geometry.durationMs);
}

export function timelineTimeToClientX(timeMs: number, geometry: TimelineGeometry): number | null {
  const contentX = timeToContentX(timeMs, geometry.pxPerMs, geometry.durationMs);
  if (
    contentX === null ||
    !Number.isFinite(geometry.scrollX) ||
    !Number.isFinite(geometry.originClientX)
  )
    return null;
  return geometry.originClientX + contentX - geometry.scrollX;
}
