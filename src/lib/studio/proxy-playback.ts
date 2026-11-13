/** How far past the encoded horizon a seek may land before it has to wait. One GOP. */
export const HORIZON_SLACK_MS = 400;

export function formatMinuteSecond(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function horizonLabel(encodedThroughMs: number): string {
  return `Still encoding to ${formatMinuteSecond(encodedThroughMs)}`;
}

export function failedProxyMessage(reason: string | undefined): string {
  const text = reason?.replace(/api_key/gi, 'token').trim();
  return text ? text : 'The edit proxy failed';
}

export function seekPastHorizon(
  targetMs: number,
  encodedThroughMs: number,
  building: boolean
): boolean {
  return building && targetMs > encodedThroughMs + HORIZON_SLACK_MS;
}

export function proxyPlayReason(input: {
  hasItem: boolean;
  blob: boolean;
  state?: string;
  encodedThroughMs?: number;
  pendingSeek: boolean;
  videoError: string;
  reason?: string;
}): string {
  if (!input.hasItem && !input.blob) return 'Choose a movie';
  if (input.pendingSeek && input.state === 'building')
    return horizonLabel(input.encodedThroughMs ?? 0);
  if (input.state === 'building') return 'Preparing edit proxy';
  if (input.state === 'failed') return failedProxyMessage(input.reason);
  if (input.videoError) return input.videoError;
  return '';
}
