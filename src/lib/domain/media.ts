export const FALLBACK_PROXY_FPS = 24;

/** Proxy frame timestamp rounded only at the integer-millisecond document boundary. */
export function proxyFrameTimeMs(index: number, fps: number): number {
  if (!Number.isFinite(index) || !Number.isFinite(fps) || fps <= 0) return 0;
  return Math.round((index * 1000) / fps);
}

export function proxyFrameIndex(timeMs: number, fps: number): number {
  if (!Number.isFinite(timeMs) || !Number.isFinite(fps) || fps <= 0) return 0;
  return Math.max(0, Math.round((timeMs * fps) / 1000));
}

export function quantizeProxyFrameTime(timeMs: number, fps: number, durationMs: number): number {
  const validFps = Number.isFinite(fps) && fps > 0 ? fps : FALLBACK_PROXY_FPS;
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  const index = proxyFrameIndex(Math.max(0, timeMs), validFps);
  return Math.min(duration, proxyFrameTimeMs(index, validFps));
}

/** Strictly adjacent frame boundary, including from off-grid serialized milliseconds. */
export function adjacentProxyFrameTime(
  timeMs: number,
  direction: 1 | -1,
  fps: number,
  durationMs: number
): number {
  const validFps = Number.isFinite(fps) && fps > 0 ? fps : FALLBACK_PROXY_FPS;
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  const bounded = Math.min(duration, Math.max(0, Number.isFinite(timeMs) ? timeMs : 0));
  let index = proxyFrameIndex(bounded, validFps);
  if (direction > 0) {
    while (proxyFrameTimeMs(index, validFps) <= bounded) index++;
    return Math.min(duration, proxyFrameTimeMs(index, validFps));
  }
  while (index > 0 && proxyFrameTimeMs(index, validFps) >= bounded) index--;
  return proxyFrameTimeMs(index, validFps);
}

/** Compatibility interval; frame stepping should use adjacentProxyFrameTime. */
export function frameStepMs(fps: number): number {
  return Math.round(1000 / (Number.isFinite(fps) && fps > 0 ? fps : FALLBACK_PROXY_FPS));
}

export function stepPlayhead(
  timeMs: number,
  steps: number,
  fps: number,
  durationMs = Number.MAX_SAFE_INTEGER
): { timeMs: number; method: 'currentTime' } {
  const direction = steps < 0 ? -1 : 1;
  let result = Math.max(0, timeMs);
  for (let index = 0; index < Math.abs(steps); index++)
    result = adjacentProxyFrameTime(result, direction, fps, durationMs);
  return { timeMs: result, method: 'currentTime' };
}

export function classifyLocalFile(name: string, mime = ''): 'playable' | 'refused' {
  const lower = name.toLowerCase();
  const type = mime.toLowerCase();
  if (
    lower.endsWith('.mkv') ||
    lower.endsWith('.hevc') ||
    lower.endsWith('.truehd') ||
    type.includes('matroska') ||
    type.includes('hevc') ||
    type.includes('truehd')
  )
    return 'refused';
  if (lower.endsWith('.mp4') || type === 'video/mp4') return 'playable';
  return 'refused';
}

export function resolveDuration(
  itemRuntimeMs: number,
  probeRuntimeMs: number | null
): { durationMs: number | null; askUser: false } {
  if (itemRuntimeMs > 0) return { durationMs: itemRuntimeMs, askUser: false };
  if (probeRuntimeMs !== null && probeRuntimeMs > 0)
    return { durationMs: probeRuntimeMs, askUser: false };
  return { durationMs: null, askUser: false };
}

const FORBIDDEN_SOURCE = [
  'ffmpeg' + '.wasm',
  '@ffmpeg/' + 'ffmpeg',
  'showSave' + 'FilePicker',
  'showOpen' + 'FilePicker',
];
export function moduleGraphProblems(files: { path: string; text: string }[]): string[] {
  const problems: string[] = [];
  for (const file of files)
    for (const pattern of FORBIDDEN_SOURCE)
      if (file.text.includes(pattern)) problems.push(`${file.path} contains ${pattern}`);
  return problems;
}
export function scrubSeekCoalesceMs(): number {
  return 200;
}
