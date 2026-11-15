export interface SelectionKeyframe {
  id: string;
  channelId: string;
  timestampMs: number;
}

export interface EditorSelection {
  selectedIds: string[];
  anchorId: string | null;
  primaryId: string | null;
}

export type SelectionIntent = 'replace' | 'range' | 'toggle';

export const emptyEditorSelection = (): EditorSelection => ({
  selectedIds: [],
  anchorId: null,
  primaryId: null,
});

function fallbackSelection(selectedIds: string[], primaryId: string | null): EditorSelection {
  const primary =
    primaryId && selectedIds.includes(primaryId) ? primaryId : (selectedIds.at(-1) ?? null);
  return {
    selectedIds,
    primaryId: primary,
    anchorId: selectedIds.includes(primary ?? '') ? primary : (selectedIds.at(-1) ?? null),
  };
}

export function pruneEditorSelection(
  selection: EditorSelection,
  keyframes: readonly SelectionKeyframe[]
): EditorSelection {
  const validIds = new Set(keyframes.map((frame) => frame.id));
  const selectedIds = [...new Set(selection.selectedIds.filter((id) => validIds.has(id)))];
  if (!selectedIds.length) return emptyEditorSelection();
  const primaryId =
    selection.primaryId &&
    validIds.has(selection.primaryId) &&
    selectedIds.includes(selection.primaryId)
      ? selection.primaryId
      : (selectedIds.at(-1) ?? null);
  const anchorId =
    selection.anchorId &&
    validIds.has(selection.anchorId) &&
    selectedIds.includes(selection.anchorId)
      ? selection.anchorId
      : primaryId;
  return { selectedIds, primaryId, anchorId };
}

export function selectEditorKeyframe(
  current: EditorSelection,
  keyframes: readonly SelectionKeyframe[],
  id: string,
  intent: SelectionIntent
): EditorSelection {
  const frame = keyframes.find((candidate) => candidate.id === id);
  if (!frame) return pruneEditorSelection(current, keyframes);
  const state = pruneEditorSelection(current, keyframes);
  const selected = new Set(state.selectedIds);

  if (intent === 'replace') return { selectedIds: [id], anchorId: id, primaryId: id };

  if (intent === 'toggle') {
    if (selected.has(id)) {
      const selectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
      if (!selectedIds.length) return emptyEditorSelection();
      const preferredPrimary = state.primaryId === id ? selectedIds.at(-1)! : state.primaryId;
      const preferredAnchor = state.anchorId === id ? preferredPrimary : state.anchorId;
      const resolved = fallbackSelection(selectedIds, preferredPrimary);
      return {
        ...resolved,
        anchorId: selectedIds.includes(preferredAnchor ?? '')
          ? preferredAnchor
          : resolved.primaryId,
      };
    }
    const selectedIds = [...state.selectedIds, id];
    return { selectedIds, anchorId: id, primaryId: id };
  }

  const anchor = keyframes.find((candidate) => candidate.id === state.anchorId);
  if (!anchor || anchor.channelId !== frame.channelId) {
    const selectedIds = [...state.selectedIds.filter((selectedId) => selectedId !== id), id];
    return { selectedIds, anchorId: state.anchorId ?? id, primaryId: id };
  }

  const lane = keyframes
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.channelId === frame.channelId)
    .toSorted(
      (left, right) =>
        left.candidate.timestampMs - right.candidate.timestampMs || left.index - right.index
    )
    .map(({ candidate }) => candidate);
  const anchorIndex = lane.findIndex((candidate) => candidate.id === anchor.id);
  const targetIndex = lane.findIndex((candidate) => candidate.id === frame.id);
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return {
    selectedIds: lane.slice(start, end + 1).map((candidate) => candidate.id),
    anchorId: anchor.id,
    primaryId: id,
  };
}

/** Rectangle hits are diamond centers in shared content CSS pixels, never backing pixels. */
export function keyframesInMarquee(
  keyframes: readonly SelectionKeyframe[],
  channelIds: readonly string[],
  bounds: { x0: number; y0: number; x1: number; y1: number },
  pxPerMs: number,
  laneHeight = 40
): string[] {
  if (
    ![bounds.x0, bounds.y0, bounds.x1, bounds.y1, pxPerMs, laneHeight].every(Number.isFinite) ||
    pxPerMs <= 0 ||
    laneHeight <= 0
  )
    return [];
  const lanes = new Map(channelIds.map((id, index) => [id, index]));
  const left = Math.min(bounds.x0, bounds.x1),
    right = Math.max(bounds.x0, bounds.x1);
  const top = Math.min(bounds.y0, bounds.y1),
    bottom = Math.max(bounds.y0, bounds.y1);
  return keyframes
    .filter((frame) => {
      const lane = lanes.get(frame.channelId);
      if (lane == null) return false;
      const x = frame.timestampMs * pxPerMs,
        y = lane * laneHeight + 19;
      return x >= left && x <= right && y >= top && y <= bottom;
    })
    .map((frame) => frame.id);
}

/** Apply each marquee proposal against the original selection, not the last motion. */
export function selectEditorMarquee(
  initial: EditorSelection,
  keyframes: readonly SelectionKeyframe[],
  hits: readonly string[],
  mode: 'replace' | 'union' | 'toggle'
): EditorSelection {
  const base = pruneEditorSelection(initial, keyframes);
  const ids = new Set(mode === 'replace' ? [] : base.selectedIds);
  for (const id of new Set(hits)) {
    if (mode === 'toggle' && ids.has(id)) ids.delete(id);
    else ids.add(id);
  }
  const selectedIds = [...ids];
  const primaryId = selectedIds.includes(base.primaryId ?? '')
    ? base.primaryId
    : (selectedIds.at(-1) ?? null);
  return pruneEditorSelection(
    {
      selectedIds,
      primaryId,
      anchorId: selectedIds.includes(base.anchorId ?? '') ? base.anchorId : primaryId,
    },
    keyframes
  );
}

export function selectAllEditorKeyframes(
  current: EditorSelection,
  keyframes: readonly SelectionKeyframe[]
): EditorSelection {
  if (!keyframes.length) return emptyEditorSelection();
  const selectedIds = keyframes.map((frame) => frame.id);
  const state = pruneEditorSelection(current, keyframes);
  const primaryId = selectedIds.includes(state.primaryId ?? '')
    ? state.primaryId!
    : (selectedIds.at(-1) ?? null);
  const anchorId = selectedIds.includes(state.anchorId ?? '') ? state.anchorId! : primaryId;
  return { selectedIds, anchorId, primaryId };
}
