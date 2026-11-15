const MAX_SAFE_MS = Number.MAX_SAFE_INTEGER;

/** Parse an unambiguous elapsed time as hh:mm:ss.mmm (hours may exceed two digits). */
export function parseElapsedTime(text: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2})\.(\d{3})$/.exec(text.trim());
  if (!match) return null;
  const [, hoursText, minutesText, secondsText, millisecondsText] = match;
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);
  const milliseconds = Number(millisecondsText);
  if (!Number.isSafeInteger(hours) || minutes > 59 || seconds > 59) return null;
  const result = ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
  return Number.isSafeInteger(result) && result <= MAX_SAFE_MS ? result : null;
}

export function formatElapsedTime(ms: number, compactHours = false): string {
  if (!Number.isSafeInteger(ms) || ms < 0)
    throw new RangeError('Elapsed time must be a non-negative integer');
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const milliseconds = ms % 1000;
  return `${compactHours && hours === 0 ? '' : `${String(hours).padStart(2, '0')}:`}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

/** Find a strict unique timestamp in one lane or across every lane. */
export function adjacentKeyframeTime(
  keyframes: readonly { timestampMs: number }[],
  currentMs: number,
  direction: -1 | 1
): number | null {
  const times = [...new Set(keyframes.map((keyframe) => keyframe.timestampMs))]
    .filter((time) => (direction < 0 ? time < currentMs : time > currentMs))
    .sort((a, b) => a - b);
  return times.length ? (direction < 0 ? times[times.length - 1] : times[0]) : null;
}
