export type LocalFileKind = 'playable' | 'refused';

export function classifyLocalFile(name: string, mime = ''): LocalFileKind {
  const lower = name.toLowerCase();
  const type = mime.toLowerCase();
  if (
    lower.endsWith('.mkv') ||
    lower.endsWith('.hevc') ||
    lower.endsWith('.truehd') ||
    type.includes('matroska') ||
    type.includes('hevc') ||
    type.includes('truehd')
  ) {
    return 'refused';
  }
  if (lower.endsWith('.mp4') || type === 'video/mp4') return 'playable';
  return 'refused';
}

export function resolveDuration(itemRuntimeMs: number, probeRuntimeMs: number | null): {
  durationMs: number | null;
  askUser: false;
} {
  if (itemRuntimeMs > 0) return { durationMs: itemRuntimeMs, askUser: false };
  if (probeRuntimeMs !== null && probeRuntimeMs > 0) return { durationMs: probeRuntimeMs, askUser: false };
  return { durationMs: null, askUser: false };
}

/** Frame step is round(1000/fps) milliseconds, applied by setting currentTime. */
export function frameStepMs(fps: number): number {
  return Math.round(1000 / fps);
}

export function stepPlayhead(timeMs: number, steps: number, fps: number): { timeMs: number; method: 'currentTime' } {
  return { timeMs: timeMs + steps * frameStepMs(fps), method: 'currentTime' };
}

const FORBIDDEN_SOURCE = [
  'ffmpeg' + '.wasm',
  '@ffmpeg/' + 'ffmpeg',
  'showSave' + 'FilePicker',
  'showOpen' + 'FilePicker',
];

export function moduleGraphProblems(files: { path: string; text: string }[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    for (const pattern of FORBIDDEN_SOURCE) {
      if (file.text.includes(pattern)) problems.push(`${file.path} contains ${pattern}`);
    }
  }
  return problems;
}

export function scrubSeekCoalesceMs(): number {
  return 200;
}
