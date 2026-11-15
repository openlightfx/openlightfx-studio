import type { Keyframe } from './types';
import { proxyFrameTimeMs, proxyFrameIndex, quantizeProxyFrameTime } from './media';

export interface KeyframeMoveIndex {
  /** Original document snapshot. Build once per gesture and reuse for every proposed delta. */
  readonly keyframes: readonly Keyframe[];
  readonly byId: ReadonlyMap<string, Keyframe>;
  readonly lanes: ReadonlyMap<string, readonly Keyframe[]>;
  readonly lanePosition: ReadonlyMap<string, number>;
  readonly error: string | null;
}

export type KeyframeMoveStatus = 'valid' | 'clamped' | 'no-op' | 'blocked';

export interface KeyframeMovePlan {
  readonly status: KeyframeMoveStatus;
  /** Only keys changed by an accepted plan, preserving the caller's document snapshot. */
  readonly times: readonly { id: string; timestampMs: number }[];
  /** Effective shared delta, or null for absolute moves and blocked/no-op plans. */
  readonly deltaMs: number | null;
  readonly reason: string;
}

export type KeyframeFramePolicy =
  | { kind: 'exact' }
  | { kind: 'proxy-frame'; fps: number; anchorId?: string };

export interface SharedKeyframeMoveInput {
  ids: readonly string[];
  deltaMs: number;
  durationMs: number;
  /** 0 disables extra spacing; timestamp uniqueness (1 ms) is always retained. */
  spacingMs: number;
  framePolicy?: KeyframeFramePolicy;
}

export interface AbsoluteKeyframeTimeInput {
  id: string;
  timeMs: number;
  durationMs: number;
  spacingMs: number;
}

/**
 * Index a keyframe snapshot once, then use it for all pointer/nudge proposals in that gesture.
 * Construction sorts each lane once; planning never clones or re-sorts the document.
 */
export function indexKeyframesForMove(keyframes: readonly Keyframe[]): KeyframeMoveIndex {
  const byId = new Map<string, Keyframe>();
  const mutableLanes = new Map<string, Keyframe[]>();
  let error: string | null = null;
  for (const keyframe of keyframes) {
    if (byId.has(keyframe.id)) error ??= `Duplicate keyframe id: ${keyframe.id}`;
    else byId.set(keyframe.id, keyframe);
    const lane = mutableLanes.get(keyframe.channelId) ?? [];
    lane.push(keyframe);
    mutableLanes.set(keyframe.channelId, lane);
  }
  const lanePosition = new Map<string, number>();
  const lanes = new Map<string, readonly Keyframe[]>();
  for (const [channelId, lane] of mutableLanes) {
    lane.sort((a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id));
    lane.forEach((keyframe, position) => lanePosition.set(keyframe.id, position));
    lanes.set(channelId, lane);
  }
  return { keyframes, byId, lanes, lanePosition, error };
}

function plan(
  status: KeyframeMoveStatus,
  times: readonly { id: string; timestampMs: number }[] = [],
  deltaMs: number | null = null,
  reason = ''
): KeyframeMovePlan {
  return { status, times, deltaMs, reason };
}

function validateInputs(durationMs: number, spacingMs: number): string | null {
  if (!Number.isFinite(durationMs) || !Number.isInteger(durationMs) || durationMs < 0)
    return 'Movie duration must be a non-negative whole number of milliseconds';
  if (!Number.isFinite(spacingMs) || !Number.isInteger(spacingMs) || spacingMs < 0)
    return 'Minimum spacing must be a non-negative whole number of milliseconds';
  return null;
}

function validTimestamp(keyframe: Keyframe): boolean {
  return Number.isFinite(keyframe.timestampMs) && Number.isInteger(keyframe.timestampMs);
}

function uniqueSelected(
  index: KeyframeMoveIndex,
  ids: readonly string[]
): { selected: Keyframe[]; ids: string[] } | { error: string } {
  const uniqueIds = [...new Set(ids)];
  const selected: Keyframe[] = [];
  for (const id of uniqueIds) {
    const keyframe = index.byId.get(id);
    if (!keyframe) return { error: `Keyframe “${id}” no longer exists` };
    if (!validTimestamp(keyframe)) return { error: `Keyframe “${id}” has an invalid time` };
    selected.push(keyframe);
  }
  return { selected, ids: uniqueIds };
}

function feasibleDeltaRange(
  index: KeyframeMoveIndex,
  selected: readonly Keyframe[],
  durationMs: number,
  spacingMs: number
): { min: number; max: number } | { error: string } {
  let min = Number.NEGATIVE_INFINITY;
  let max = Number.POSITIVE_INFINITY;
  const selectedByLane = new Map<string, Keyframe[]>();
  for (const keyframe of selected) {
    min = Math.max(min, -keyframe.timestampMs, keyframe.transitionMs - keyframe.timestampMs);
    max = Math.min(max, durationMs - keyframe.timestampMs);
    if (!Number.isFinite(keyframe.transitionMs) || keyframe.transitionMs < 0)
      return { error: `Keyframe “${keyframe.id}” has an invalid incoming fade` };
    if (!index.lanePosition.has(keyframe.id))
      return { error: `Keyframe “${keyframe.id}” is not indexed` };
    const laneSelection = selectedByLane.get(keyframe.channelId) ?? [];
    laneSelection.push(keyframe);
    selectedByLane.set(keyframe.channelId, laneSelection);
  }

  const applyNeighbor = (
    keyframe: Keyframe,
    neighbor: Keyframe,
    before: boolean
  ): string | null => {
    if (!validTimestamp(neighbor)) return `Neighbor “${neighbor.id}” has an invalid time`;
    const oldGap = Math.abs(keyframe.timestampMs - neighbor.timestampMs);
    // Preserve an imported close relationship if it already exists: it may stay as-is or
    // improve, but a move may not make that particular pair closer or cross it.
    const requiredGap = Math.max(1, spacingMs);
    if (before) {
      const requiredDelta = oldGap === 0 ? 1 : oldGap < spacingMs ? 0 : requiredGap - oldGap;
      min = Math.max(min, requiredDelta);
    } else {
      const requiredDelta = oldGap === 0 ? -1 : oldGap < spacingMs ? 0 : oldGap - requiredGap;
      max = Math.min(max, requiredDelta);
    }
    return null;
  };

  // Sort just selected positions, then visit the two edges of each selected run. This keeps
  // repeated proposals O(S log S), even when a group selects thousands of adjacent keys.
  for (const [channelId, laneSelection] of selectedByLane) {
    const lane = index.lanes.get(channelId) ?? [];
    laneSelection.sort((a, b) => index.lanePosition.get(a.id)! - index.lanePosition.get(b.id)!);
    let runStart = 0;
    while (runStart < laneSelection.length) {
      let runEnd = runStart;
      while (
        runEnd + 1 < laneSelection.length &&
        index.lanePosition.get(laneSelection[runEnd + 1].id) ===
          index.lanePosition.get(laneSelection[runEnd].id)! + 1
      )
        runEnd++;
      const firstPosition = index.lanePosition.get(laneSelection[runStart].id)!;
      const lastPosition = index.lanePosition.get(laneSelection[runEnd].id)!;
      if (firstPosition > 0) {
        const error = applyNeighbor(laneSelection[runStart], lane[firstPosition - 1], true);
        if (error) return { error };
      }
      if (lastPosition + 1 < lane.length) {
        const error = applyNeighbor(laneSelection[runEnd], lane[lastPosition + 1], false);
        if (error) return { error };
      }
      runStart = runEnd + 1;
    }
  }
  if (min > max) return { error: 'The selected keys have no shared valid movement range' };
  return { min, max };
}

function exactDeltaWithin(
  requested: number,
  range: { min: number; max: number }
): { delta: number; clamped: boolean } | null {
  const delta = Math.min(range.max, Math.max(range.min, requested));
  if (!Number.isFinite(delta)) return null;
  return { delta, clamped: delta !== requested };
}

function frameDeltaWithin(
  anchor: Keyframe,
  requestedDeltaMs: number,
  fps: number,
  durationMs: number,
  range: { min: number; max: number }
): { delta: number; clamped: boolean } | null {
  if (!Number.isFinite(fps) || fps <= 0) return null;
  const desiredTime = quantizeProxyFrameTime(
    anchor.timestampMs + requestedDeltaMs,
    fps,
    durationMs
  );
  const lowTime = anchor.timestampMs + range.min;
  const highTime = anchor.timestampMs + range.max;
  if (lowTime > highTime) return null;
  // Binary-search valid frame boundaries within this lane's feasible interval. This is bounded
  // by log(duration * fps), and avoids walking frames for long movies on every pointer event.
  const maxIndex = Math.max(0, Math.ceil((durationMs * fps) / 1000) + 2);
  const lowerBound = (target: number): number => {
    let low = 0;
    let high = maxIndex + 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (proxyFrameTimeMs(mid, fps) < target) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  const first = lowerBound(lowTime);
  const afterLast = lowerBound(highTime + 1);
  const last = afterLast - 1;
  if (first > last || first > maxIndex) return null;
  const desiredIndex = proxyFrameIndex(desiredTime, fps);
  const candidateIndices = [Math.max(first, Math.min(last, desiredIndex))];
  // A rounded boundary can tie or straddle the requested integer millisecond; compare adjacent
  // valid indices for the true nearest boundary, preferring the earlier one on exact ties.
  const center = candidateIndices[0];
  if (center > first) candidateIndices.push(center - 1);
  if (center < last) candidateIndices.push(center + 1);
  const chosen = candidateIndices
    .map((index) => proxyFrameTimeMs(index, fps))
    .filter((time) => time >= lowTime && time <= highTime)
    .sort((a, b) => Math.abs(a - desiredTime) - Math.abs(b - desiredTime) || a - b)[0];
  if (chosen === undefined) return null;
  const delta = chosen - anchor.timestampMs;
  return {
    delta,
    clamped: delta !== requestedDeltaMs && delta !== desiredTime - anchor.timestampMs,
  };
}

/** Plan an atomic shared-delta move from the indexed original snapshot. */
export function planSharedKeyframeMove(
  index: KeyframeMoveIndex,
  input: SharedKeyframeMoveInput
): KeyframeMovePlan {
  if (!input.ids.length) return plan('no-op', [], 0, 'No keyframes are selected');
  if (!Number.isFinite(input.deltaMs) || !Number.isInteger(input.deltaMs))
    return plan('blocked', [], null, 'Move delta must be a finite whole number of milliseconds');
  const inputError = validateInputs(input.durationMs, input.spacingMs);
  if (inputError) return plan('blocked', [], null, inputError);
  if (index.error) return plan('blocked', [], null, index.error);
  const selectedResult = uniqueSelected(index, input.ids);
  if ('error' in selectedResult) return plan('blocked', [], null, selectedResult.error);
  const { selected, ids } = selectedResult;
  if (selected.length === 0) return plan('no-op', [], 0, 'No keyframes are selected');
  if (input.deltaMs === 0)
    return plan('no-op', [], 0, 'Keyframes are already at the requested time');
  const range = feasibleDeltaRange(index, selected, input.durationMs, input.spacingMs);
  if ('error' in range) return plan('blocked', [], null, range.error);
  let proposed: { delta: number; clamped: boolean } | null;
  const policy = input.framePolicy ?? { kind: 'exact' as const };
  if (policy.kind === 'exact') proposed = exactDeltaWithin(input.deltaMs, range);
  else {
    const anchor = index.byId.get(policy.anchorId ?? ids[0]);
    if (!anchor || !ids.includes(anchor.id))
      return plan('blocked', [], null, 'The frame anchor must be one of the selected keyframes');
    proposed = frameDeltaWithin(anchor, input.deltaMs, policy.fps, input.durationMs, range);
  }
  if (!proposed)
    return plan('blocked', [], null, 'No frame-aligned shared move fits the valid range');
  const times = selected.map((keyframe) => ({
    id: keyframe.id,
    timestampMs: keyframe.timestampMs + proposed!.delta,
  }));
  if (times.some(({ timestampMs }) => !Number.isInteger(timestampMs)))
    return plan('blocked', [], null, 'Move would create a non-integer keyframe time');
  if (proposed.delta === 0)
    return plan('no-op', [], 0, 'Keyframes are already at the requested time');
  const occupied = new Set<string>();
  for (const { id, timestampMs } of times) {
    const channelId = index.byId.get(id)!.channelId;
    const location = `${channelId}\u0000${timestampMs}`;
    if (occupied.has(location))
      return plan(
        'blocked',
        [],
        null,
        'Selected keyframes would share a timestamp on the same lane'
      );
    occupied.add(location);
  }
  return plan(
    proposed.clamped ? 'clamped' : 'valid',
    times,
    proposed.delta,
    proposed.clamped ? 'Move was clamped to keep every keyframe valid' : ''
  );
}

/** Plan an exact typed single-key time; unlike pointer/group movement, this may reorder a lane. */
export function planAbsoluteKeyframeTime(
  index: KeyframeMoveIndex,
  input: AbsoluteKeyframeTimeInput
): KeyframeMovePlan {
  const inputError = validateInputs(input.durationMs, input.spacingMs);
  if (inputError) return plan('blocked', [], null, inputError);
  if (!Number.isFinite(input.timeMs) || !Number.isInteger(input.timeMs))
    return plan('blocked', [], null, 'Keyframe time must be a finite whole number of milliseconds');
  if (index.error) return plan('blocked', [], null, index.error);
  const keyframe = index.byId.get(input.id);
  if (!keyframe) return plan('blocked', [], null, `Keyframe “${input.id}” no longer exists`);
  if (!validTimestamp(keyframe))
    return plan('blocked', [], null, `Keyframe “${input.id}” has an invalid time`);
  if (!Number.isFinite(keyframe.transitionMs) || keyframe.transitionMs < 0)
    return plan('blocked', [], null, `Keyframe “${input.id}” has an invalid incoming fade`);
  if (input.timeMs < 0 || input.timeMs > input.durationMs)
    return plan('blocked', [], null, 'Keyframe time must be inside the movie');
  if (input.timeMs < keyframe.transitionMs)
    return plan('blocked', [], null, 'The incoming fade cannot begin before time 0');
  if (input.timeMs === keyframe.timestampMs)
    return plan('no-op', [], null, 'Keyframe is already at that time');
  const threshold = Math.max(1, input.spacingMs);
  const lane = index.lanes.get(keyframe.channelId) ?? [];
  for (const other of lane) {
    if (other.id === keyframe.id) continue;
    if (!validTimestamp(other))
      return plan('blocked', [], null, `Neighbor “${other.id}” has an invalid time`);
    if (Math.abs(other.timestampMs - input.timeMs) < threshold)
      return plan(
        'blocked',
        [],
        null,
        'That time is too close to another keyframe on this channel'
      );
  }
  return plan('valid', [{ id: keyframe.id, timestampMs: input.timeMs }], null, '');
}

/** Apply an accepted planner result without changing keyframe properties or the input track. */
export function applyKeyframeMovePlan<T extends { keyframes: readonly Keyframe[] }>(
  document: T,
  move: KeyframeMovePlan
): T {
  if (move.status === 'blocked' || move.status === 'no-op' || move.times.length === 0)
    return document;
  const times = new Map(move.times.map(({ id, timestampMs }) => [id, timestampMs]));
  return {
    ...document,
    keyframes: document.keyframes.map((keyframe) =>
      times.has(keyframe.id) ? { ...keyframe, timestampMs: times.get(keyframe.id)! } : keyframe
    ),
  };
}
