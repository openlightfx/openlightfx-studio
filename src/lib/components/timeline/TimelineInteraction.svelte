<script lang="ts">
  import type { TimelineHitResult, TimelineDragState, SelectionRect } from '$lib/types/index.js';
  import type { Keyframe, EffectKeyframe } from '$lib/types/index.js';
  import type { SceneMarker } from '$lib/types/index.js';
  import {
    CHANNEL_LANE_HEIGHT,
    CHANNEL_HEADER_WIDTH,
    RULER_HEIGHT,
    KEYFRAME_MARKER_WIDTH,
    KEYFRAME_MARKER_HEIGHT,
    KEYFRAME_SNAP_DISTANCE,
  } from '$lib/types/index.js';
  import { MIN_KEYFRAME_INTERVAL_MS } from '$lib/types/index.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';

  let {
    oncontextmenu,
    onselectionrect,
    ondoubleclickkeyframe,
  }: {
    oncontextmenu?: (e: MouseEvent, hit: TimelineHitResult) => void;
    onselectionrect?: (rect: SelectionRect | null) => void;
    ondoubleclickkeyframe?: (keyframeId: string) => void;
  } = $props();

  let overlayEl: HTMLDivElement | undefined = $state();
  let dragState: TimelineDragState | null = $state(null);
  let dragMoved = false; // true if pointer moved enough to be a real drag

  const ZOOM_FACTOR = 1.15;

  // ---- HIT TESTING ----
  function hitTest(clientX: number, clientY: number): TimelineHitResult {
    if (!overlayEl) {
      return { type: 'empty', timestampMs: 0, y: 0 };
    }

    const rect = overlayEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const vp = timelineStore.viewport;
    const timestampMs = timelineStore.pixelToMs(x - CHANNEL_HEADER_WIDTH);

    // Ruler zone
    if (y < RULER_HEIGHT) {
      return { type: 'ruler', timestampMs: Math.max(0, timestampMs), y };
    }

    // Channel header zone
    if (x < CHANNEL_HEADER_WIDTH) {
      const channelIdx = Math.floor((y - RULER_HEIGHT + vp.scrollY) / CHANNEL_LANE_HEIGHT);
      const channels = projectStore.channels;
      if (channelIdx >= 0 && channelIdx < channels.length) {
        return {
          type: 'channel-header',
          channelId: channels[channelIdx].id,
          timestampMs: Math.max(0, timestampMs),
          y,
        };
      }
      return { type: 'empty', timestampMs: 0, y };
    }

    // Content area - figure out which channel lane
    const channelIdx = Math.floor((y - RULER_HEIGHT + vp.scrollY) / CHANNEL_LANE_HEIGHT);
    const channels = projectStore.channels;
    const channelId = channelIdx >= 0 && channelIdx < channels.length ? channels[channelIdx].id : undefined;

    // Check scene markers first (thin vertical lines, generous hit area)
    const sceneMarkers = projectStore.sceneMarkers;
    for (const marker of sceneMarkers) {
      const markerX = CHANNEL_HEADER_WIDTH + (marker.timestampMs - vp.scrollX) * vp.pxPerMs;
      if (Math.abs(x - markerX) < 6) {
        return {
          type: 'scene-marker',
          sceneMarkerId: marker.id,
          channelId,
          timestampMs: marker.timestampMs,
          y,
        };
      }
    }

    if (channelId) {
      // Check keyframes in this channel
      const keyframes = projectStore.keyframes.filter((kf) => kf.channelId === channelId);
      const kfHalfW = KEYFRAME_MARKER_WIDTH / 2 + 2; // extra padding for hit
      const kfHalfH = KEYFRAME_MARKER_HEIGHT / 2 + 2;
      const laneCenterY = RULER_HEIGHT + channelIdx * CHANNEL_LANE_HEIGHT - vp.scrollY + CHANNEL_LANE_HEIGHT / 2;

      for (const kf of keyframes) {
        const kfX = CHANNEL_HEADER_WIDTH + (kf.timestampMs - vp.scrollX) * vp.pxPerMs;
        if (Math.abs(x - kfX) <= kfHalfW && Math.abs(y - laneCenterY) <= kfHalfH) {
          return {
            type: 'keyframe',
            keyframeId: kf.id,
            channelId,
            timestampMs: kf.timestampMs,
            y,
          };
        }
      }

      // Check effect keyframes in this channel
      const effects = projectStore.effectKeyframes.filter((ef) => ef.channelId === channelId);
      for (const ef of effects) {
        const efX1 = CHANNEL_HEADER_WIDTH + (ef.timestampMs - vp.scrollX) * vp.pxPerMs;
        const efX2 = CHANNEL_HEADER_WIDTH + (ef.timestampMs + ef.durationMs - vp.scrollX) * vp.pxPerMs;
        const laneTop = RULER_HEIGHT + channelIdx * CHANNEL_LANE_HEIGHT - vp.scrollY;
        if (x >= efX1 && x <= efX2 && y >= laneTop && y <= laneTop + CHANNEL_LANE_HEIGHT) {
          return {
            type: 'effect',
            effectKeyframeId: ef.id,
            channelId,
            timestampMs: Math.max(0, timestampMs),
            y,
          };
        }
      }
    }

    return {
      type: 'empty',
      channelId,
      timestampMs: Math.max(0, timestampMs),
      y,
    };
  }

  // ---- SNAP LOGIC ----
  function snapToPlayhead(pxPosition: number, timestampMs: number): number {
    if (!uiStore.state.snappingEnabled) return timestampMs;
    const vp = timelineStore.viewport;
    const cursorPx = CHANNEL_HEADER_WIDTH + (videoStore.state.currentTimeMs - vp.scrollX) * vp.pxPerMs;
    if (Math.abs(pxPosition - cursorPx) <= KEYFRAME_SNAP_DISTANCE) {
      return videoStore.state.currentTimeMs;
    }
    return timestampMs;
  }

  function enforceMinInterval(channelId: string, keyframeId: string, timestampMs: number): number {
    const minInterval = uiStore.state.minKeyframeIntervalMs;
    const channelKeyframes = projectStore.keyframes
      .filter((kf) => kf.channelId === channelId && kf.id !== keyframeId)
      .sort((a, b) => a.timestampMs - b.timestampMs);

    let ts = timestampMs;
    for (const kf of channelKeyframes) {
      if (Math.abs(ts - kf.timestampMs) < minInterval) {
        // Snap to nearest valid position
        ts = ts < kf.timestampMs ? kf.timestampMs - minInterval : kf.timestampMs + minInterval;
      }
    }
    return Math.max(0, ts);
  }

  // ---- POINTER EVENTS ----
  function handlePointerDown(e: PointerEvent): void {
    if (!overlayEl) return;
    const hit = hitTest(e.clientX, e.clientY);

    if (e.button === 2) {
      // Right click handled in contextmenu event
      return;
    }

    if (e.button !== 0) return; // Only left button

    const vp = timelineStore.viewport;
    const rect = overlayEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Ruler: seek
    if (hit.type === 'ruler') {
      videoStore.seek(Math.max(0, hit.timestampMs));
      timelineStore.ensureVisible(hit.timestampMs);
      dragState = {
        type: 'scroll',
        startX: x,
        startY: y,
        startTimestampMs: hit.timestampMs,
        targetIds: [],
        originalTimestamps: new Map(),
      };
      overlayEl.setPointerCapture(e.pointerId);
      return;
    }

    // Channel header: select channel
    if (hit.type === 'channel-header' && hit.channelId) {
      timelineStore.setActiveChannel(hit.channelId);
      return;
    }

    // Keyframe: select and start drag
    if (hit.type === 'keyframe' && hit.keyframeId) {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      if (isCtrl) {
        timelineStore.selectKeyframe(hit.keyframeId, 'toggle');
      } else if (isShift) {
        timelineStore.selectKeyframe(hit.keyframeId, 'range');
      } else if (!timelineStore.selection.keyframeIds.includes(hit.keyframeId)) {
        timelineStore.selectKeyframe(hit.keyframeId, 'replace');
      }

      if (hit.channelId) timelineStore.setActiveChannel(hit.channelId);

      // Start keyframe drag
      const selectedIds = timelineStore.selection.keyframeIds;
      const origTimestamps = new Map<string, number>();
      for (const id of selectedIds) {
        const kf = projectStore.getKeyframe(id);
        if (kf) origTimestamps.set(id, kf.timestampMs);
      }

      dragState = {
        type: 'keyframe',
        startX: x,
        startY: y,
        startTimestampMs: hit.timestampMs,
        targetIds: selectedIds,
        originalTimestamps: origTimestamps,
      };
      dragMoved = false;
      overlayEl.setPointerCapture(e.pointerId);
      return;
    }

    // Effect: select
    if (hit.type === 'effect' && hit.effectKeyframeId) {
      timelineStore.selectEffect(hit.effectKeyframeId);
      if (hit.channelId) timelineStore.setActiveChannel(hit.channelId);
      return;
    }

    // Scene marker: select and start drag
    if (hit.type === 'scene-marker' && hit.sceneMarkerId) {
      timelineStore.selectSceneMarker(hit.sceneMarkerId);
      const marker = projectStore.getSceneMarker(hit.sceneMarkerId);
      const origTimestamps = new Map<string, number>();
      if (marker) origTimestamps.set(marker.id, marker.timestampMs);

      dragState = {
        type: 'scene-marker',
        startX: x,
        startY: y,
        startTimestampMs: marker?.timestampMs ?? 0,
        targetIds: [hit.sceneMarkerId],
        originalTimestamps: origTimestamps,
      };
      overlayEl.setPointerCapture(e.pointerId);
      return;
    }

    // Empty space: start rubber-band selection or clear selection
    if (hit.type === 'empty') {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        timelineStore.clearSelection();
      }
      if (hit.channelId) timelineStore.setActiveChannel(hit.channelId);

      dragState = {
        type: 'selection-rect',
        startX: x,
        startY: y,
        startTimestampMs: hit.timestampMs,
        targetIds: [],
        originalTimestamps: new Map(),
      };
      overlayEl.setPointerCapture(e.pointerId);
      return;
    }
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!dragState || !overlayEl) return;

    const rect = overlayEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const vp = timelineStore.viewport;

    if (dragState.type === 'scroll') {
      // Ruler scrub
      const timestampMs = timelineStore.pixelToMs(x - CHANNEL_HEADER_WIDTH);
      videoStore.seek(Math.max(0, timestampMs));
      return;
    }

    if (dragState.type === 'keyframe') {
      const deltaMs = (x - dragState.startX) / vp.pxPerMs;
      dragMoved = true;

      for (const [id, origMs] of dragState.originalTimestamps) {
        let newMs = Math.max(0, origMs + deltaMs);
        // Snap to playhead
        const newPx = CHANNEL_HEADER_WIDTH + (newMs - vp.scrollX) * vp.pxPerMs;
        newMs = snapToPlayhead(newPx, newMs);
        // Enforce minimum interval
        const kf = projectStore.getKeyframe(id);
        if (kf) {
          newMs = enforceMinInterval(kf.channelId, id, newMs);
        }
        projectStore.moveKeyframe(id, newMs);
      }
      return;
    }

    if (dragState.type === 'scene-marker') {
      const deltaMs = (x - dragState.startX) / vp.pxPerMs;
      for (const [id, origMs] of dragState.originalTimestamps) {
        const newMs = Math.max(0, origMs + deltaMs);
        projectStore.updateSceneMarker(id, { timestampMs: newMs });
      }
      return;
    }

    if (dragState.type === 'selection-rect') {
      const selRect: SelectionRect = {
        startX: dragState.startX,
        startY: dragState.startY,
        endX: x,
        endY: y,
      };
      onselectionrect?.(selRect);
      updateRubberBandSelection(selRect);
      return;
    }
  }

  function handlePointerUp(e: PointerEvent): void {
    if (!overlayEl) return;

    if (dragState?.type === 'selection-rect') {
      onselectionrect?.(null);
    }

    // If keyframe click (not a drag), seek to the keyframe's current timestamp
    if (dragState?.type === 'keyframe' && !dragMoved) {
      const id = dragState.targetIds[0];
      if (id) {
        const kf = projectStore.getKeyframe(id);
        if (kf) {
          videoStore.seek(kf.timestampMs);
          timelineStore.ensureVisible(kf.timestampMs);
        }
      }
    }

    dragState = null;
    dragMoved = false;
    overlayEl.releasePointerCapture(e.pointerId);
  }

  function handleDoubleClick(e: MouseEvent): void {
    const hit = hitTest(e.clientX, e.clientY);

    if (hit.type === 'keyframe' && hit.keyframeId) {
      ondoubleclickkeyframe?.(hit.keyframeId);
      return;
    }

    if (hit.type === 'empty' && hit.channelId) {
      projectStore.addKeyframe(hit.channelId, Math.max(0, hit.timestampMs));
      return;
    }

    if (hit.type === 'scene-marker' && hit.sceneMarkerId) {
      videoStore.seek(hit.timestampMs);
      return;
    }
  }

  function handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const hit = hitTest(e.clientX, e.clientY);
    // Per STU-029m: no context menu on ruler
    if (hit.type === 'ruler') return;
    oncontextmenu?.(e, hit);
  }

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const vp = timelineStore.viewport;

    if (e.ctrlKey || e.metaKey) {
      // Zoom centered on cursor
      if (!overlayEl) return;
      const rect = overlayEl.getBoundingClientRect();
      const cursorX = e.clientX - rect.left - CHANNEL_HEADER_WIDTH;
      const cursorMs = timelineStore.pixelToMs(cursorX);

      const zoomDelta = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const newPxPerMs = vp.pxPerMs * zoomDelta;
      timelineStore.setZoom(newPxPerMs);

      // Adjust scroll to keep cursor position stable
      const newScrollX = cursorMs - cursorX / timelineStore.viewport.pxPerMs;
      timelineStore.scrollTo(Math.max(0, newScrollX));
      return;
    }

    if (e.shiftKey) {
      // Vertical scroll
      timelineStore.viewport = {
        ...vp,
        scrollY: Math.max(0, vp.scrollY + e.deltaY),
      };
      return;
    }

    // Horizontal scroll
    const deltaMs = e.deltaX !== 0 ? e.deltaX / vp.pxPerMs : e.deltaY / vp.pxPerMs;
    timelineStore.scrollBy(deltaMs);
  }

  // ---- RUBBER-BAND SELECTION ----
  function updateRubberBandSelection(rect: SelectionRect): void {
    const x1 = Math.min(rect.startX, rect.endX);
    const x2 = Math.max(rect.startX, rect.endX);
    const y1 = Math.min(rect.startY, rect.endY);
    const y2 = Math.max(rect.startY, rect.endY);

    const vp = timelineStore.viewport;
    const channels = projectStore.channels;
    const keyframes = projectStore.keyframes;
    const selectedIds: string[] = [];

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const laneTop = RULER_HEIGHT + i * CHANNEL_LANE_HEIGHT - vp.scrollY;
      const laneBottom = laneTop + CHANNEL_LANE_HEIGHT;
      const laneCenterY = laneTop + CHANNEL_LANE_HEIGHT / 2;

      // Check if lane overlaps with selection rect
      if (laneBottom < y1 || laneTop > y2) continue;

      const chKeyframes = keyframes.filter((kf) => kf.channelId === ch.id);
      for (const kf of chKeyframes) {
        const kfX = CHANNEL_HEADER_WIDTH + (kf.timestampMs - vp.scrollX) * vp.pxPerMs;
        if (kfX >= x1 && kfX <= x2 && laneCenterY >= y1 && laneCenterY <= y2) {
          selectedIds.push(kf.id);
        }
      }
    }

    timelineStore.selection = {
      ...timelineStore.selection,
      keyframeIds: selectedIds,
      selectionRect: rect,
    };
  }
</script>

<div
  bind:this={overlayEl}
  class="absolute inset-0 z-10"
  style="cursor: default;"
  role="application"
  aria-label="Timeline interaction area"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  ondblclick={handleDoubleClick}
  oncontextmenu={handleContextMenu}
  onwheel={handleWheel}
></div>
