export interface TimelineTick {
  timeMs: number;
  major: boolean;
}

const MAX_TICKS = 1000;
const NICE = [1, 2, 5];

/** Choose a readable 1/2/5×10ⁿ major interval for the current CSS-pixel scale. */
export function majorTickIntervalMs(pxPerMs: number, labelWidthPx: number): number {
  if (!Number.isFinite(pxPerMs) || pxPerMs <= 0) return 0;
  const minimum = (Math.max(0, Number.isFinite(labelWidthPx) ? labelWidthPx : 0) + 8) / pxPerMs;
  const power = 10 ** Math.floor(Math.log10(Math.max(minimum, Number.MIN_VALUE)));
  for (const factor of NICE) if (factor * power >= minimum) return factor * power;
  return 10 * power;
}

/** Generate a bounded set of ticks intersecting the visible time interval. */
export function generateTimelineTicks(
  startMs: number,
  endMs: number,
  durationMs: number,
  pxPerMs: number,
  labelWidthPx: number,
  maxTicks = MAX_TICKS
): TimelineTick[] {
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    !Number.isFinite(pxPerMs) ||
    pxPerMs <= 0 ||
    !Number.isFinite(maxTicks) ||
    maxTicks < 1
  )
    return [];
  const start = Math.max(0, Math.min(durationMs, Math.min(startMs, endMs)));
  const end = Math.max(start, Math.min(durationMs, Math.max(startMs, endMs)));
  const majorInterval = majorTickIntervalMs(pxPerMs, labelWidthPx);
  if (!majorInterval) return [];
  const minorInterval = majorInterval / 5;
  const first = Math.ceil((start - Number.EPSILON * durationMs) / minorInterval);
  const last = Math.floor((end + Number.EPSILON * durationMs) / minorInterval);
  const count = Math.min(maxTicks, Math.max(0, last - first + 1));
  const ticks: TimelineTick[] = [];
  for (let offset = 0; offset < count; offset++) {
    const index = first + offset;
    const timeMs = index * minorInterval;
    if (timeMs < 0 || timeMs > durationMs) continue;
    const majorIndex = Math.round(timeMs / majorInterval);
    ticks.push({
      timeMs,
      major: Math.abs(timeMs - majorIndex * majorInterval) <= minorInterval * 1e-7,
    });
  }
  return ticks;
}
