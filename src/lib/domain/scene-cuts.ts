export type SceneCutStatus = 'ready' | 'running' | 'none' | 'stale';

export interface SceneCutDetector {
  name: string;
  threshold: number;
  fps: number;
  minSceneLen: number;
}

/** ContentDetector cuts for one movie. `cuts` are seconds, ascending. */
export interface SceneCuts {
  itemId: string;
  status: SceneCutStatus;
  detector: SceneCutDetector;
  durationSeconds: number;
  cuts: number[];
  updatedAt: string;
}

export type SceneCutJobState = 'processing' | 'done' | 'failed';

/** Admin job returned by POST and GET scene-cut routes. */
export interface SceneCutJob {
  jobId: string;
  itemId: string;
  state: SceneCutJobState;
  error: string;
  progress: number;
  throughMs: number;
}

const STATUSES = new Set<SceneCutStatus>(['ready', 'running', 'none', 'stale']);
const JOB_STATES = new Set<SceneCutJobState>(['processing', 'done', 'failed']);

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function emptySceneCuts(itemId: string, status: 'none' | 'stale' = 'none'): SceneCuts {
  return {
    itemId,
    status,
    detector: { name: 'ContentDetector', threshold: 27, fps: 24, minSceneLen: 15 },
    durationSeconds: 0,
    cuts: [],
    updatedAt: '',
  };
}

export function parseSceneCuts(body: unknown): SceneCuts | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (typeof record.itemId !== 'string' || !record.itemId) return null;
  if (typeof record.status !== 'string' || !STATUSES.has(record.status as SceneCutStatus))
    return null;
  const detector = record.detector;
  if (!detector || typeof detector !== 'object') return null;
  const details = detector as Record<string, unknown>;
  if (typeof details.name !== 'string') return null;
  if (
    !finiteNumber(details.threshold) ||
    !finiteNumber(details.fps) ||
    !finiteNumber(details.minSceneLen)
  )
    return null;
  if (!finiteNumber(record.durationSeconds) || record.durationSeconds < 0) return null;
  if (!Array.isArray(record.cuts) || !record.cuts.every((cut) => finiteNumber(cut) && cut >= 0))
    return null;
  if (typeof record.updatedAt !== 'string') return null;
  const cuts = [...new Set(record.cuts)].sort((left, right) => left - right);
  return {
    itemId: record.itemId,
    status: record.status as SceneCutStatus,
    detector: {
      name: details.name,
      threshold: details.threshold,
      fps: details.fps,
      minSceneLen: details.minSceneLen,
    },
    durationSeconds: record.durationSeconds,
    cuts,
    updatedAt: record.updatedAt,
  };
}

export function parseSceneCutJob(body: unknown): SceneCutJob | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (typeof record.jobId !== 'string' || !record.jobId) return null;
  if (typeof record.itemId !== 'string' || !record.itemId) return null;
  if (typeof record.state !== 'string' || !JOB_STATES.has(record.state as SceneCutJobState))
    return null;
  return {
    jobId: record.jobId,
    itemId: record.itemId,
    state: record.state as SceneCutJobState,
    error: typeof record.error === 'string' ? record.error : '',
    progress: finiteNumber(record.progress) ? Math.max(0, Math.min(1, record.progress)) : 0,
    throughMs: finiteNumber(record.throughMs) ? Math.max(0, record.throughMs) : 0,
  };
}

/** Cut positions in milliseconds that fall inside the movie, excluding the start boundary. */
export function sceneCutLineTimesMs(cutSeconds: readonly number[], durationMs: number): number[] {
  const duration = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0;
  const lines: number[] = [];
  for (const seconds of cutSeconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    const ms = Math.round(seconds * 1000);
    if (ms <= 0) continue;
    if (duration > 0 && ms > duration) continue;
    if (lines.at(-1) !== ms) lines.push(ms);
  }
  return lines;
}

/**
 * Stops used by previous/next scene: the movie start, each cut, and the movie end.
 * Returns null when this movie has no cuts, or when the playhead is already at that end.
 */
export function adjacentSceneStopMs(
  cutSeconds: readonly number[],
  playheadMs: number,
  direction: -1 | 1,
  durationMs: number
): number | null {
  if (!cutSeconds.some((seconds) => Number.isFinite(seconds) && seconds > 0)) return null;
  const duration = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0;
  const stops = [0, ...sceneCutLineTimesMs(cutSeconds, duration)];
  if (duration > 0 && stops.at(-1) !== duration) stops.push(duration);
  const playhead = Number.isFinite(playheadMs) ? playheadMs : 0;
  if (direction < 0) {
    let earlier = -1;
    for (const stop of stops) if (stop < playhead - 0.5) earlier = stop;
    return earlier >= 0 ? earlier : null;
  }
  return stops.find((stop) => stop > playhead + 0.5) ?? null;
}
