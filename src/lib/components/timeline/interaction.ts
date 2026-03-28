import type { Channel, Keyframe } from '$lib/types/track.js';
import type { TimelineHitResult, TimelineDragState } from '$lib/types/timeline.js';
import type { ContextMenuItem } from '$lib/types/ui.js';
import {
  CHANNEL_LANE_HEIGHT,
  CHANNEL_HEADER_WIDTH,
  RULER_HEIGHT,
  KEYFRAME_HIT_RADIUS,
  PLAYHEAD_AUTO_FOLLOW_THRESHOLD,
} from '$lib/types/timeline.js';
import type { RenderViewport } from './render.js';
import { msToPx, pxToMs } from './render.js';
import { AddKeyframeCommand } from '$lib/commands/add-keyframe.js';
import { MoveKeyframeCommand } from '$lib/commands/move-keyframe.js';
import { DeleteKeyframeCommand } from '$lib/commands/delete-keyframe.js';
import { CompositeCommand } from '$lib/commands/composite.js';
import { generateId } from '$lib/services/id.js';
import type { KeyframeStore } from '$lib/commands/add-keyframe.js';

// ---------------------------------------------------------------------------
// Store interfaces (subset used here)
// ---------------------------------------------------------------------------

export interface TimelineStoreInterface {
  pxPerMs: number;
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  selectedKeyframeIds: string[];
  selectionRect: { startX: number; startY: number; endX: number; endY: number } | null;
  activeChannelId: string | null;
  selectKeyframe(id: string, additive?: boolean): void;
  clearSelection(): void;
  zoom(factor: number, centerMs?: number): void;
  scrollTo(ms: number): void;
  scrollBy(deltaMs: number): void;
}

export interface UndoStoreInterface {
  execute(command: { execute(): void; undo(): void; serialize(): unknown }): void;
}

// ---------------------------------------------------------------------------
// hitTest
// ---------------------------------------------------------------------------

/**
 * Given canvas-relative (x, y) coordinates, determine what was clicked.
 *
 * The canvas coordinate system starts at (0, 0) top-left of the drawable area
 * (i.e. the channel-header strip is NOT part of this canvas).
 */
export function hitTest(
  x: number,
  y: number,
  viewport: RenderViewport,
  channels: Channel[],
  keyframes: Keyframe[],
): TimelineHitResult {
  const timestampMs = pxToMs(x, viewport);

  // Ruler band
  if (y < RULER_HEIGHT) {
    return { type: 'ruler', timestampMs, y };
  }

  // Determine which channel lane was clicked
  const laneY = y - RULER_HEIGHT;
  const laneIndex = Math.floor(laneY / CHANNEL_LANE_HEIGHT);

  if (laneIndex < 0 || laneIndex >= channels.length) {
    // Below all lanes
    return { type: 'empty', timestampMs, y };
  }

  const channel = channels[laneIndex];
  const laneCenterY = RULER_HEIGHT + laneIndex * CHANNEL_LANE_HEIGHT + CHANNEL_LANE_HEIGHT / 2;

  // Build index of keyframes for this channel for fast scan
  const laneKeyframes = keyframes.filter((kf) => kf.channelId === channel.id);

  // Find the closest keyframe within hit radius
  let bestKf: Keyframe | null = null;
  let bestDist = Infinity;

  for (const kf of laneKeyframes) {
    const kfX = msToPx(kf.timestampMs, viewport);
    const dx = x - kfX;
    const dy = y - laneCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= KEYFRAME_HIT_RADIUS && dist < bestDist) {
      bestDist = dist;
      bestKf = kf;
    }
  }

  if (bestKf) {
    return {
      type: 'keyframe',
      channelId: channel.id,
      keyframeId: bestKf.id,
      timestampMs: bestKf.timestampMs,
      y: laneCenterY,
    };
  }

  return {
    type: 'empty',
    channelId: channel.id,
    timestampMs,
    y,
  };
}

// ---------------------------------------------------------------------------
// handlePointerDown
// ---------------------------------------------------------------------------

export function handlePointerDown(
  e: PointerEvent,
  hitResult: TimelineHitResult,
  timelineStore: TimelineStoreInterface,
  keyframes: Keyframe[],
): TimelineDragState | null {
  const { type } = hitResult;

  // Set active channel
  if (hitResult.channelId) {
    timelineStore.activeChannelId = hitResult.channelId;
  }

  if (type === 'keyframe' && hitResult.keyframeId) {
    const isCtrlCmd = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isShift && timelineStore.selectedKeyframeIds.length > 0) {
      // Range select: select all keyframes between lastSelected and this one
      const lastId = timelineStore.selectedKeyframeIds[timelineStore.selectedKeyframeIds.length - 1];
      const last = keyframes.find((k) => k.id === lastId);
      const current = keyframes.find((k) => k.id === hitResult.keyframeId);

      if (last && current && last.channelId === current.channelId) {
        const minMs = Math.min(last.timestampMs, current.timestampMs);
        const maxMs = Math.max(last.timestampMs, current.timestampMs);
        const rangeIds = keyframes
          .filter((k) => k.channelId === current.channelId && k.timestampMs >= minMs && k.timestampMs <= maxMs)
          .map((k) => k.id);
        for (const id of rangeIds) timelineStore.selectKeyframe(id, true);
      } else {
        timelineStore.selectKeyframe(hitResult.keyframeId, true);
      }
    } else {
      timelineStore.selectKeyframe(hitResult.keyframeId, isCtrlCmd);
    }

    // Build drag state for all currently selected keyframes
    const selectedIds = timelineStore.selectedKeyframeIds;
    const originalTimestamps = new Map<string, number>();
    for (const id of selectedIds) {
      const kf = keyframes.find((k) => k.id === id);
      if (kf) originalTimestamps.set(id, kf.timestampMs);
    }

    return {
      type: 'keyframe',
      startX: e.offsetX,
      startY: e.offsetY,
      startTimestampMs: hitResult.timestampMs,
      targetIds: [...selectedIds],
      originalTimestamps,
    };
  }

  if (type === 'ruler') {
    // Clicking the ruler starts a scroll drag
    return {
      type: 'scroll',
      startX: e.offsetX,
      startY: e.offsetY,
      startTimestampMs: hitResult.timestampMs,
      targetIds: [],
      originalTimestamps: new Map(),
    };
  }

  // Clicking empty space starts a selection rectangle
  if (type === 'empty') {
    timelineStore.clearSelection();
    timelineStore.selectionRect = {
      startX: e.offsetX,
      startY: e.offsetY,
      endX: e.offsetX,
      endY: e.offsetY,
    };
    return {
      type: 'selection-rect',
      startX: e.offsetX,
      startY: e.offsetY,
      startTimestampMs: hitResult.timestampMs,
      targetIds: [],
      originalTimestamps: new Map(),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// handlePointerMove
// ---------------------------------------------------------------------------

export function handlePointerMove(
  e: PointerEvent,
  dragState: TimelineDragState | null,
  timelineStore: TimelineStoreInterface,
  store: KeyframeStore,
): void {
  if (!dragState) return;

  if (dragState.type === 'keyframe') {
    // Preview move: compute delta and update keyframe timestamps temporarily
    const viewport: RenderViewport = {
      pxPerMs: timelineStore.pxPerMs,
      scrollX: timelineStore.scrollX,
      width: timelineStore.viewportWidth,
      height: timelineStore.viewportHeight,
    };
    const currentMs = pxToMs(e.offsetX, viewport);
    const deltaMs = currentMs - dragState.startTimestampMs;

    for (const id of dragState.targetIds) {
      const origMs = dragState.originalTimestamps.get(id);
      if (origMs !== undefined) {
        store.updateKeyframe(id, { timestampMs: Math.max(0, origMs + deltaMs) });
      }
    }
  } else if (dragState.type === 'selection-rect' && timelineStore.selectionRect) {
    timelineStore.selectionRect = {
      ...timelineStore.selectionRect,
      endX: e.offsetX,
      endY: e.offsetY,
    };
  } else if (dragState.type === 'scroll') {
    const viewport: RenderViewport = {
      pxPerMs: timelineStore.pxPerMs,
      scrollX: timelineStore.scrollX,
      width: timelineStore.viewportWidth,
      height: timelineStore.viewportHeight,
    };
    const currentMs = pxToMs(e.offsetX, viewport);
    const deltaMs = dragState.startTimestampMs - currentMs;
    timelineStore.scrollBy(deltaMs);
  }
}

// ---------------------------------------------------------------------------
// handlePointerUp
// ---------------------------------------------------------------------------

export function handlePointerUp(
  e: PointerEvent,
  dragState: TimelineDragState | null,
  timelineStore: TimelineStoreInterface,
  undoStore: UndoStoreInterface,
  store: KeyframeStore,
  channels: Channel[],
  keyframes: Keyframe[],
): void {
  if (!dragState) return;

  if (dragState.type === 'keyframe' && dragState.targetIds.length > 0) {
    // Compute final positions
    const viewport: RenderViewport = {
      pxPerMs: timelineStore.pxPerMs,
      scrollX: timelineStore.scrollX,
      width: timelineStore.viewportWidth,
      height: timelineStore.viewportHeight,
    };
    const currentMs = pxToMs(e.offsetX, viewport);
    const deltaMs = currentMs - dragState.startTimestampMs;

    if (Math.abs(deltaMs) < 1) {
      // No meaningful movement — restore original timestamps (preview already applied)
      for (const [id, origMs] of dragState.originalTimestamps) {
        store.updateKeyframe(id, { timestampMs: origMs });
      }
      return;
    }

    // Restore originals before executing commands so undo stack is correct
    for (const [id, origMs] of dragState.originalTimestamps) {
      store.updateKeyframe(id, { timestampMs: origMs });
    }

    const commands = dragState.targetIds.map((id) => {
      const origMs = dragState.originalTimestamps.get(id) ?? 0;
      const newMs = Math.max(0, origMs + deltaMs);
      return new MoveKeyframeCommand(id, newMs, store);
    });

    if (commands.length === 1) {
      undoStore.execute(commands[0]);
    } else {
      undoStore.execute(new CompositeCommand(`Move ${commands.length} keyframes`, commands));
    }
  } else if (dragState.type === 'selection-rect') {
    // Finalize: select all keyframes whose rendered position falls within the rect
    if (timelineStore.selectionRect) {
      const rect = timelineStore.selectionRect;
      const x1 = Math.min(rect.startX, rect.endX);
      const x2 = Math.max(rect.startX, rect.endX);
      const y1 = Math.min(rect.startY, rect.endY);
      const y2 = Math.max(rect.startY, rect.endY);

      const viewport: RenderViewport = {
        pxPerMs: timelineStore.pxPerMs,
        scrollX: timelineStore.scrollX,
        width: timelineStore.viewportWidth,
        height: timelineStore.viewportHeight,
      };

      const channelIndex = new Map(channels.map((c, i) => [c.id, i]));
      timelineStore.clearSelection();

      for (const kf of keyframes) {
        const kfX = msToPx(kf.timestampMs, viewport);
        const laneIdx = channelIndex.get(kf.channelId);
        if (laneIdx === undefined) continue;
        const kfY = RULER_HEIGHT + laneIdx * CHANNEL_LANE_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
        if (kfX >= x1 && kfX <= x2 && kfY >= y1 && kfY <= y2) {
          timelineStore.selectKeyframe(kf.id, true);
        }
      }

      timelineStore.selectionRect = null;
    }
  }
}

// ---------------------------------------------------------------------------
// handleDoubleClick
// ---------------------------------------------------------------------------

export function handleDoubleClick(
  e: MouseEvent,
  hitResult: TimelineHitResult,
  undoStore: UndoStoreInterface,
  store: KeyframeStore,
): void {
  if (hitResult.type !== 'empty' || !hitResult.channelId) return;

  const newKeyframe = {
    id: generateId(),
    channelId: hitResult.channelId,
    timestampMs: hitResult.timestampMs,
    colorMode: 'RGB' as const,
    color: { r: 0, g: 0, b: 0 },
    colorTemperature: 6500,
    brightness: 1.0,
    transitionMs: 0,
    interpolation: 'STEP' as const,
    powerOn: true,
  };

  undoStore.execute(new AddKeyframeCommand(newKeyframe, store));
}

// ---------------------------------------------------------------------------
// handleContextMenu
// ---------------------------------------------------------------------------

export function handleContextMenu(
  e: MouseEvent,
  hitResult: TimelineHitResult,
  undoStore: UndoStoreInterface,
  store: KeyframeStore,
  timelineStore: TimelineStoreInterface,
): ContextMenuItem[] {
  e.preventDefault();

  if (hitResult.type === 'keyframe' && hitResult.keyframeId) {
    const keyframeId = hitResult.keyframeId;
    return [
      {
        id: 'delete-keyframe',
        label: 'Delete Keyframe',
        enabled: true,
        shortcut: 'Del',
        action: () => {
          undoStore.execute(new DeleteKeyframeCommand(keyframeId, store));
          timelineStore.clearSelection();
        },
      },
      {
        id: 'separator-1',
        label: '',
        enabled: false,
        separator: true,
      },
      {
        id: 'select-all-in-channel',
        label: 'Select All in Channel',
        enabled: true,
      },
    ];
  }

  if (hitResult.type === 'empty' && hitResult.channelId) {
    const channelId = hitResult.channelId;
    const timestampMs = hitResult.timestampMs;
    return [
      {
        id: 'add-keyframe',
        label: 'Add Keyframe Here',
        enabled: true,
        action: () => {
          const newKeyframe = {
            id: generateId(),
            channelId,
            timestampMs,
            colorMode: 'RGB' as const,
            color: { r: 0, g: 0, b: 0 },
            colorTemperature: 6500,
            brightness: 1.0,
            transitionMs: 0,
            interpolation: 'STEP' as const,
            powerOn: true,
          };
          undoStore.execute(new AddKeyframeCommand(newKeyframe, store));
        },
      },
    ];
  }

  if (hitResult.type === 'ruler') {
    return [
      {
        id: 'add-scene-marker',
        label: 'Add Scene Marker',
        enabled: true,
      },
    ];
  }

  return [];
}

// ---------------------------------------------------------------------------
// handleWheel
// ---------------------------------------------------------------------------

export function handleWheel(e: WheelEvent, timelineStore: TimelineStoreInterface): void {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const viewport: RenderViewport = {
      pxPerMs: timelineStore.pxPerMs,
      scrollX: timelineStore.scrollX,
      width: timelineStore.viewportWidth,
      height: timelineStore.viewportHeight,
    };
    const centerMs = pxToMs((e as WheelEvent & { offsetX: number }).offsetX, viewport);
    timelineStore.zoom(factor, centerMs);
  } else if (e.shiftKey) {
    e.preventDefault();
    // Horizontal scroll: deltaY pixels → ms
    timelineStore.scrollBy(e.deltaY / timelineStore.pxPerMs);
  }
  // Default (plain vertical wheel): let CSS/DOM handle vertical scroll
}

// ---------------------------------------------------------------------------
// handlePinch
// ---------------------------------------------------------------------------

/**
 * Accepts a synthetic pinch event with a `scale` property and an optional
 * `centerX` canvas-relative x coordinate.
 */
export interface PinchEvent {
  scale: number;
  centerX?: number;
  preventDefault(): void;
}

export function handlePinch(event: PinchEvent, timelineStore: TimelineStoreInterface): void {
  event.preventDefault();
  const viewport: RenderViewport = {
    pxPerMs: timelineStore.pxPerMs,
    scrollX: timelineStore.scrollX,
    width: timelineStore.viewportWidth,
    height: timelineStore.viewportHeight,
  };
  const centerMs =
    event.centerX !== undefined
      ? pxToMs(event.centerX, viewport)
      : timelineStore.scrollX + timelineStore.viewportWidth / timelineStore.pxPerMs / 2;
  timelineStore.zoom(event.scale, centerMs);
}

// ---------------------------------------------------------------------------
// Playhead auto-follow
// ---------------------------------------------------------------------------

/**
 * Called each animation frame during playback with the current playhead
 * position in ms. Advances the viewport when the playhead is about to leave
 * the right edge.
 */
export function maybeAutoFollowPlayhead(
  currentTimeMs: number,
  timelineStore: TimelineStoreInterface,
): void {
  const viewportDurationMs = timelineStore.viewportWidth / timelineStore.pxPerMs;
  const playheadX = (currentTimeMs - timelineStore.scrollX) / viewportDurationMs;
  if (playheadX > PLAYHEAD_AUTO_FOLLOW_THRESHOLD) {
    // Advance so playhead is at the left quarter of the viewport
    const newScrollX = currentTimeMs - viewportDurationMs * (1 - PLAYHEAD_AUTO_FOLLOW_THRESHOLD);
    timelineStore.scrollTo(Math.max(0, newScrollX));
  }
}
