export interface AuditionRange {
  startMs: number | null;
  endMs: number | null;
  loop: boolean;
}
export const emptyAuditionRange = (): AuditionRange => ({
  startMs: null,
  endMs: null,
  loop: false,
});
export function rangeReason(range: AuditionRange, durationMs: number): string {
  const { startMs, endMs } = range;
  if (startMs == null || endMs == null) return 'Set both range boundaries first';
  if (
    !Number.isSafeInteger(startMs) ||
    !Number.isSafeInteger(endMs) ||
    startMs < 0 ||
    endMs > durationMs
  )
    return 'Range must be inside the movie';
  return startMs < endMs ? '' : 'Range start must be earlier than range end';
}
export function restoreAuditionRange(raw: string | null, durationMs: number): AuditionRange {
  if (!raw) return emptyAuditionRange();
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return emptyAuditionRange();
    const boundary = (time: unknown) =>
      typeof time === 'number' && Number.isSafeInteger(time) && time >= 0 && time <= durationMs
        ? time
        : null;
    const range = {
      startMs: boundary(value.startMs),
      endMs: boundary(value.endMs),
      loop: value.loop === true,
    };
    if (rangeReason(range, durationMs)) range.loop = false;
    return range;
  } catch {
    return emptyAuditionRange();
  }
}

/** A pending wrap consumes one end crossing until native media acknowledges the start. */
export class AuditionLoop {
  private waiting = false;
  cancel(): void {
    this.waiting = false;
  }
  sample(
    timeMs: number,
    playing: boolean,
    range: AuditionRange,
    durationMs: number
  ): number | null {
    if (!playing || !range.loop || rangeReason(range, durationMs)) {
      this.cancel();
      return null;
    }
    if (this.waiting) {
      if (timeMs < range.endMs! && Math.abs(timeMs - range.startMs!) <= 100) this.waiting = false;
      return null;
    }
    if (timeMs < range.endMs!) return null;
    this.waiting = true;
    return range.startMs;
  }
}
