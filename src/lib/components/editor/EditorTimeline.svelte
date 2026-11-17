<script lang="ts">
  import TimelineLane from '../TimelineLane.svelte';
  import EffectStrip from './EffectStrip.svelte';
  import EditorMarkers from './EditorMarkers.svelte';
  import EditorAuditionRange from './EditorAuditionRange.svelte';
  import { onDestroy, onMount, untrack } from 'svelte';
  import {
    clientXToTimelineTime,
    displayedRgb,
    generateTimelineTicks,
    sampleChannel,
    timeToContentX,
    parseElapsedTime,
    formatElapsedTime,
    indexKeyframesForMove,
    planSharedKeyframeMove,
    applyKeyframeMovePlan,
    quantizeProxyFrameTime,
    sceneCutLineTimesMs,
    snapEffectStart,
  } from '$lib/domain';
  import type { EffectType } from '$lib/domain';
  import type {
    Channel,
    SceneMarker,
    EffectKeyframe,
    Keyframe,
    Track,
    EditorSelection,
    KeyframeMoveIndex,
  } from '$lib/domain';
  import { magneticSnap, type SnapTarget } from '$lib/domain/magnetic-snap';
  import { createEdgeAutoscrollController } from '$lib/studio/edge-autoscroll';
  import type { StudioSession } from '$lib/studio/session.svelte';
  import { commandForId, commandEnabledReason } from '$lib/studio/editor-commands';

  let {
    session,
    laneDescription,
    format,
    onLayout,
    onEffectSelected,
    onCloseMenus,
    onGestureChange,
  } = $props<{
    session: StudioSession;
    laneDescription: (channel: Channel) => string;
    format: (ms: number) => string;
    onLayout: (event: Event) => void;
    onEffectSelected: (id: string) => void;
    onCloseMenus: () => void;
    onGestureChange: (active: boolean) => void;
  }>();
  let timelineContainer = $state<HTMLDivElement>();
  let ruler: HTMLDivElement;
  let headerWidth = $state(240);
  let visibleWidth = $state(0);
  let labelWidth = $state(64);
  let timeDraft = $state('00:00:00.000');
  let timeError = $state('');
  let timeInput: HTMLInputElement;
  interface LaneGesture {
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startScroll: number;
    x0: number;
    y0: number;
    channelId: string;
    keyframeId: string | null;
    initial: EditorSelection;
    activeChannelId: string | null;
    mode: 'replace' | 'union' | 'toggle';
    started: boolean;
    track: Track;
    index: KeyframeMoveIndex | null;
    ids: string[];
    altKey: boolean;
  }
  let fadeGesture: { pointerId: number; key: Keyframe; track: Track } | null = null;
  let laneGesture: LaneGesture | null = null;
  let snapGuide = $state<SnapTarget | null>(null);
  let marqueeRect = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const renderedTrack = $derived(session.draftTrack ?? session.track);
  const edgeScroll = createEdgeAutoscrollController({
    getViewport: () => ({
      left: (timelineContainer?.getBoundingClientRect().left ?? 0) + headerWidth,
      width: session.laneWidth,
    }),
    getScroll: () => session.scrollX,
    getMaxScroll: () => Math.max(0, timelineWidth - session.laneWidth),
    setScroll: (value) => {
      session.scrollX = value;
      if (timelineContainer) timelineContainer.scrollLeft = value;
      updateLaneGesture();
    },
  });
  let pan: { pointerId: number; startX: number; scrollX: number; target: HTMLElement } | null =
    null;
  const activePointers = new Set<number>();
  const pointerTargets = new Map<number, HTMLElement>();
  const duration = $derived(Math.max(session.durationMs(), 1));
  const sceneCutLines = $derived(sceneCutLineTimesMs(session.sceneCuts?.cuts ?? [], duration));
  const timelineWidth = $derived(duration * session.pxPerMs);
  $effect(() => {
    const container = timelineContainer;
    if (!container) return;
    const wheel = (event: WheelEvent) => timelineWheel(event);
    container.addEventListener('wheel', wheel, { passive: false });
    const observer = new ResizeObserver(() => {
      const measured = container
        .querySelector<HTMLElement>('.lane-header')
        ?.getBoundingClientRect().width;
      if (measured && Number.isFinite(measured)) {
        headerWidth = measured;
      }
      visibleWidth = container.clientWidth;
      session.laneWidth = Math.max(1, container.clientWidth - headerWidth);
      if (session.fit && container.clientWidth) fitTimeline();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      container.removeEventListener('wheel', wheel);
    };
  });
  $effect(() => {
    if (session.fit && duration && timelineContainer) untrack(fitTimeline);
  });
  $effect(() => {
    if (!timelineContainer) return;
    timelineContainer.scrollLeft = session.scrollX;
    visibleWidth = timelineContainer.clientWidth;
  });
  $effect(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    context.font = `11px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono')}`;
    const longest =
      [0, duration / 2, duration]
        .map((time) => format(time))
        .sort((a, b) => b.length - a.length)[0] ?? '';
    labelWidth = context.measureText(longest).width;
  });
  const ticks = $derived.by(() => {
    const left = timelineContainer?.scrollLeft ?? session.scrollX;
    const start = (left - headerWidth) / session.pxPerMs;
    const end = (left + visibleWidth - headerWidth) / session.pxPerMs;
    return generateTimelineTicks(start, end, duration, session.pxPerMs, labelWidth);
  });
  function commitTime() {
    const parsed = parseElapsedTime(timeDraft);
    if (parsed == null || parsed > duration) {
      timeError = `Enter a time from 00:00:00.000 through ${formatElapsedTime(duration)}.`;
      return;
    }
    timeError = '';
    session.seek(parsed);
    session.revealNavigationPosition(parsed);
    timeDraft = formatElapsedTime(parsed);
  }
  $effect(() => {
    const position = Math.round(session.playheadMs);
    if (document.activeElement !== timeInput && !timeError) timeDraft = formatElapsedTime(position);
  });
  function scrub(event: PointerEvent) {
    if (!ruler) return;
    const bounds = ruler.getBoundingClientRect();
    const time = clientXToTimelineTime(event.clientX, {
      originClientX: bounds.left,
      scrollX: 0,
      pxPerMs: session.pxPerMs,
      durationMs: duration,
    });
    if (time !== null) session.scrub(time);
  }
  function lanePoint(clientX: number, clientY: number) {
    const bounds = timelineContainer!.getBoundingClientRect();
    const firstLane = timelineContainer!.querySelector('.lane')!.getBoundingClientRect();
    return { x: clientX - bounds.left - headerWidth + session.scrollX, y: clientY - firstLane.top };
  }
  function beginLane(event: PointerEvent, channelId: string, keyframeId: string | null = null) {
    if (event.button !== 0 || !session.track || laneGesture) return;
    event.preventDefault();
    event.stopPropagation();
    const point = lanePoint(event.clientX, event.clientY);
    const initial = session.selectionState;
    const activeChannelId = session.activeChannelId;
    beginPointerGesture(event.currentTarget as HTMLElement, event);
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    if (keyframeId) chooseKeyframe(event, keyframeId);
    laneGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startScroll: session.scrollX,
      x0: point.x,
      y0: point.y,
      channelId,
      keyframeId,
      initial,
      activeChannelId,
      mode: event.ctrlKey || event.metaKey ? 'toggle' : event.shiftKey ? 'union' : 'replace',
      started: false,
      track: session.track,
      index: null,
      ids: [],
      altKey: event.altKey,
    };
    onEffectSelected('');
  }
  function updateLaneGesture() {
    const gesture = laneGesture;
    if (!gesture || !timelineContainer) return;
    if (!gesture.started) {
      if (Math.hypot(gesture.lastX - gesture.startX, gesture.lastY - gesture.startY) <= 4) return;
      gesture.started = true;
      if (gesture.keyframeId) {
        session.resolvePendingPointerSelection(gesture.keyframeId, true);
        // A toggled-off key must not move a different, still-selected group.
        if (!session.selection.includes(gesture.keyframeId)) return;
        gesture.ids = [...session.selection];
        gesture.index = indexKeyframesForMove(gesture.track.keyframes);
        session.beginEdit('Move keyframes');
      }
    }
    if (gesture.keyframeId) {
      if (!gesture.index) return;
      const rawDeltaMs = Math.round(
        (gesture.lastX - gesture.startX + session.scrollX - gesture.startScroll) / session.pxPerMs
      );
      const anchor = gesture.track.keyframes.find((key) => key.id === gesture.keyframeId);
      const targets: SnapTarget[] = [
        ...[session.auditionRange.startMs, session.auditionRange.endMs].flatMap(
          (timeMs): SnapTarget[] =>
            timeMs == null ? [] : [{ timeMs, kind: 'boundary', label: 'Range boundary' }]
        ),
        { timeMs: session.playheadMs, kind: 'playhead', label: 'Playhead' },
        { timeMs: 0, kind: 'boundary', label: 'Movie start' },
        { timeMs: duration, kind: 'boundary', label: 'Movie end' },
        ...gesture.track.keyframes
          .filter((key) => !gesture.ids.includes(key.id))
          .map(
            (key): SnapTarget => ({ timeMs: key.timestampMs, kind: 'keyframe', label: 'Keyframe' })
          ),
        ...session.projectSidecar.sceneMarkers.map(
          (marker: SceneMarker): SnapTarget => ({
            timeMs: marker.timeMs,
            kind: 'marker',
            label: marker.label || 'Scene marker',
          })
        ),
        ...ticks.map((tick): SnapTarget => ({ timeMs: tick.timeMs, kind: 'tick', label: 'Ruler' })),
      ];
      const snapped =
        anchor && session.snapEnabled && !gesture.altKey
          ? magneticSnap(anchor.timestampMs + rawDeltaMs, session.pxPerMs, targets, (timeMs) => {
              const candidate = planSharedKeyframeMove(gesture.index!, {
                ids: gesture.ids,
                deltaMs: timeMs - anchor.timestampMs,
                durationMs: duration,
                spacingMs: session.spacingLimit(),
              });
              return (
                candidate.deltaMs === timeMs - anchor.timestampMs && candidate.status !== 'blocked'
              );
            })
          : null;
      snapGuide = snapped;
      const deltaMs = snapped ? snapped.timeMs - anchor!.timestampMs : rawDeltaMs;
      const move = planSharedKeyframeMove(gesture.index, {
        ids: gesture.ids,
        deltaMs,
        durationMs: duration,
        spacingMs: session.spacingLimit(),
        framePolicy: snapped
          ? { kind: 'exact' }
          : {
              kind: 'proxy-frame',
              fps: session.media?.proxy.fps ?? 24,
              anchorId: gesture.keyframeId,
            },
      });
      session.updateEdit(applyKeyframeMovePlan(gesture.track, move));
      session.status =
        move.status === 'blocked' || move.status === 'no-op'
          ? move.reason || 'Move blocked'
          : `${snapped ? `Snap ${format(snapped.timeMs)} · ` : ''}Move ${move.deltaMs! >= 0 ? '+' : ''}${move.deltaMs} ms${move.status === 'clamped' ? ' · clamped at a valid boundary' : ''}`;
    } else {
      const point = lanePoint(gesture.lastX, gesture.lastY);
      marqueeRect = { x0: gesture.x0, y0: gesture.y0, x1: point.x, y1: point.y };
      session.marquee(gesture.initial, marqueeRect, gesture.mode);
    }
  }
  function finishLaneGesture(event: PointerEvent) {
    const gesture = laneGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    updateLaneGesture();
    laneGesture = null;
    snapGuide = null;
    edgeScroll.cancel();
    marqueeRect = null;
    if (gesture.keyframeId) {
      if (gesture.started && gesture.index) session.commitEdit();
      else session.resolvePendingPointerSelection(gesture.keyframeId, false);
    } else if (!gesture.started) {
      session.activeChannelId = gesture.channelId;
      session.insertAt(gesture.x0 / session.pxPerMs, gesture.channelId);
    }
  }
  function chooseKeyframe(event: MouseEvent | KeyboardEvent, keyframeId: string) {
    onEffectSelected('');
    const mode = event.ctrlKey || event.metaKey ? 'toggle' : event.shiftKey ? 'extend' : 'replace';
    if (event.type === 'pointerdown') session.beginPointerSelection(keyframeId, mode);
    else session.selectKeyframe(keyframeId, mode);
  }
  function beginPointerGesture(target: HTMLElement, event: PointerEvent) {
    target.setPointerCapture(event.pointerId);
    activePointers.add(event.pointerId);
    pointerTargets.set(event.pointerId, target);
    onGestureChange(true);
  }
  function endPointerGesture(event: PointerEvent) {
    if (fadeGesture?.pointerId === event.pointerId) {
      if (event.type === 'pointerup') {
        updateFadeGesture(event);
        fadeGesture = null;
        snapGuide = null;
        session.commitEdit();
      } else {
        cancelGesture();
        return;
      }
    }
    if (event.type === 'pointerup') session.flushSeek();
    if (laneGesture?.pointerId === event.pointerId) {
      if (event.type === 'pointerup') finishLaneGesture(event);
      else {
        cancelGesture();
        return;
      }
    }
    activePointers.delete(event.pointerId);
    pointerTargets.delete(event.pointerId);
    if (pan?.pointerId === event.pointerId) pan = null;
    if (event.type !== 'pointerup') session.cancelPendingPointerSelection();
    if (!activePointers.size) onGestureChange(false);
  }
  function beginPan(event: PointerEvent) {
    if (
      event.button !== 1 ||
      !timelineContainer ||
      (event.target as HTMLElement).closest('.lane-header')
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    pan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollX: timelineContainer.scrollLeft,
      target,
    };
    beginPointerGesture(target, event);
  }
  function movePan(event: PointerEvent) {
    if (!pan || pan.pointerId !== event.pointerId || !timelineContainer) return;
    const delta = event.clientX - pan.startX;
    if (Math.abs(delta) > 1) session.manualFollowSuspended = true;
    timelineContainer.scrollLeft = pan.scrollX - delta;
    session.scrollX = timelineContainer.scrollLeft;
  }
  export function cancelGesture() {
    pan = null;
    if (fadeGesture) {
      fadeGesture = null;
      session.cancelEdit();
    }
    const gesture = laneGesture;
    laneGesture = null;
    snapGuide = null;
    marqueeRect = null;
    edgeScroll.cancel();
    if (gesture) {
      if (gesture.started && gesture.keyframeId) session.cancelEdit();
      session.restoreSelection(gesture.initial, gesture.activeChannelId);
      session.status = 'Gesture cancelled';
    }
    session.cancelPendingPointerSelection();
    for (const [pointerId, target] of pointerTargets) {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    }
    pointerTargets.clear();
    activePointers.clear();
    onGestureChange(false);
  }
  function revealPlayhead() {
    session.manualFollowSuspended = false;
    session.followPlayhead = true;
    const x = session.playheadMs * session.pxPerMs;
    if (timelineContainer)
      timelineContainer.scrollLeft = Math.max(
        0,
        Math.min(
          timelineContainer.scrollWidth - timelineContainer.clientWidth,
          x - timelineContainer.clientWidth / 2
        )
      );
    if (timelineContainer) session.scrollX = timelineContainer.scrollLeft;
  }
  function beginFadeGesture(event: PointerEvent, key: Keyframe) {
    if (event.button !== 0 || !session.track) return;
    event.preventDefault();
    event.stopPropagation();
    beginPointerGesture(event.currentTarget as HTMLElement, event);
    fadeGesture = { pointerId: event.pointerId, key, track: session.track };
    session.beginEdit('Adjust incoming fade');
  }
  function updateFadeGesture(event: PointerEvent) {
    const gesture = fadeGesture;
    if (!gesture || event.pointerId !== gesture.pointerId || !timelineContainer) return;
    const point = lanePoint(event.clientX, event.clientY);
    let start = Math.max(
      0,
      Math.min(gesture.key.timestampMs, Math.round(point.x / session.pxPerMs))
    );
    const targets: SnapTarget[] = [
      { timeMs: 0, kind: 'boundary', label: 'Movie start' },
      { timeMs: gesture.key.timestampMs, kind: 'boundary', label: 'Arrival' },
      { timeMs: session.playheadMs, kind: 'playhead', label: 'Playhead' },
      ...ticks.map((tick): SnapTarget => ({ timeMs: tick.timeMs, kind: 'tick', label: 'Ruler' })),
    ];
    snapGuide =
      session.snapEnabled && !event.altKey
        ? magneticSnap(
            start,
            session.pxPerMs,
            targets,
            (time) => time >= 0 && time <= gesture.key.timestampMs
          )
        : null;
    if (snapGuide) start = snapGuide.timeMs;
    else
      start = Math.min(
        gesture.key.timestampMs,
        quantizeProxyFrameTime(start, session.media?.proxy.fps ?? 24, duration)
      );
    session.updateEdit({
      ...gesture.track,
      keyframes: gesture.track.keyframes.map((key) =>
        key.id === gesture.key.id ? { ...key, transitionMs: gesture.key.timestampMs - start } : key
      ),
    });
    session.status = `Incoming fade ${gesture.key.timestampMs - start} ms · arrival ${format(gesture.key.timestampMs)}`;
  }

  function beginDiamond(event: PointerEvent, keyframeId: string) {
    const frame = session.track?.keyframes.find(
      (candidate: Keyframe) => candidate.id === keyframeId
    );
    if (frame) beginLane(event, frame.channelId, keyframeId);
  }
  onMount(() => {
    const blur = () => cancelGesture();
    const pointermove = (event: PointerEvent) => {
      movePan(event);
      updateFadeGesture(event);
      if (laneGesture?.pointerId === event.pointerId) {
        laneGesture.lastX = event.clientX;
        laneGesture.lastY = event.clientY;
        laneGesture.altKey = event.altKey;
        updateLaneGesture();
        if (laneGesture?.started) edgeScroll.update(event.clientX);
      }
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        (!pan && !activePointers.size && !session.pendingPointerSelectionId)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelGesture();
    };
    window.addEventListener('blur', blur);
    window.addEventListener('pointermove', pointermove);
    window.addEventListener('pointerup', endPointerGesture);
    window.addEventListener('pointercancel', endPointerGesture);
    window.addEventListener('keydown', keydown, true);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointermove', pointermove);
      window.removeEventListener('pointerup', endPointerGesture);
      window.removeEventListener('pointercancel', endPointerGesture);
      window.removeEventListener('keydown', keydown, true);
    };
  });
  onDestroy(() => {
    cancelGesture();
    edgeScroll.cleanup();
  });
  function fitTimeline() {
    if (timelineContainer?.clientWidth) {
      session.laneWidth = Math.max(1, timelineContainer.clientWidth - headerWidth);
      session.zoomFit();
    }
  }
  function runTimelineCommand(id: string) {
    const command = commandForId(id);
    const context = { session, target: null, modal: false, menu: false };
    if (command && !commandEnabledReason(command, context)) void command.execute(context);
  }
  function effectAnchors(): number[] {
    return [Math.round(session.playheadMs), ...sceneCutLines];
  }

  function acceptEffectDrag(event: DragEvent) {
    if (![...(event.dataTransfer?.types ?? [])].includes('application/x-openlightfx-effect'))
      return;
    event.preventDefault();
  }

  function dropEffect(event: DragEvent, channelId: string) {
    const type = event.dataTransfer?.getData('application/x-openlightfx-effect') as EffectType;
    if (!type) return;
    event.preventDefault();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const time = clientXToTimelineTime(event.clientX, {
      originClientX: bounds.left,
      scrollX: 0,
      pxPerMs: session.pxPerMs,
      durationMs: duration,
    });
    if (time === null) return;
    session.addEffect(type, {
      channelId,
      timeMs: snapEffectStart(time, effectAnchors()),
    });
  }

  function beginEffectGesture(
    event: PointerEvent,
    id: string,
    mode: 'move' | 'resize',
    origin: { timestampMs: number; durationMs: number }
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const move = (next: PointerEvent) => {
      const delta = (next.clientX - startX) / session.pxPerMs;
      if (mode === 'move') session.previewEffect(id, { timestampMs: origin.timestampMs + delta });
      else session.previewEffect(id, { durationMs: origin.durationMs + delta });
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      session.commitEdit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
  }

  function timelineWheel(event: WheelEvent) {
    if (
      (event.ctrlKey || event.metaKey) &&
      (event.target as Element).closest('.ruler, .lane, .lane-canvas')
    ) {
      event.preventDefault();
      const bounds = timelineContainer!.getBoundingClientRect();
      const x = event.clientX - bounds.left - headerWidth;
      session.zoomAt(Math.max(0, Math.min(session.laneWidth, x)), event.deltaY < 0 ? 1 : -1);
    } else if (event.shiftKey && timelineContainer) {
      event.preventDefault();
      session.manualFollowSuspended = true;
      timelineContainer.scrollLeft += event.deltaY + event.deltaX;
    } else if (event.deltaX !== 0) {
      // Preserve native trackpad scrolling, while treating its horizontal pan as manual navigation.
      session.manualFollowSuspended = true;
    }
  }
</script>

<section
  class="timeline"
  aria-label="Timeline"
  onpointerup={endPointerGesture}
  onpointercancel={endPointerGesture}
  onlostpointercapture={endPointerGesture}
>
  <EffectStrip {session} />
  <p class="tools-hint" aria-hidden="true">Timeline controls · scroll for more</p>
  <div class="timeline-tools" role="region" aria-label="Timeline controls">
    <div class="tool-group" role="group" aria-label="Timeline editing">
      <label class="layout-picker"
        >Layout
        <select
          aria-label="Track layout"
          value={session.track?.metadata.channelLayout ?? 'LAYOUT_2_0'}
          onchange={onLayout}
        >
          <option value="LAYOUT_AMBIENT">Ambient</option><option value="LAYOUT_2_0">2.0</option
          ><option value="LAYOUT_3_0">3.0</option><option value="LAYOUT_5_0">5.0</option>
        </select>
      </label>
      <label class="snap-toggle"
        ><input
          type="checkbox"
          aria-label="Magnetic snapping"
          checked={session.snapEnabled}
          onchange={(event) =>
            session.setSnapEnabled((event.currentTarget as HTMLInputElement).checked)}
        />Snap</label
      >
      <label class="spacing-picker"
        >Spacing
        <select
          aria-label="Minimum cue spacing"
          value={session.minSpacingMs}
          onchange={(event) => session.setSpacing((event.currentTarget as HTMLSelectElement).value)}
        >
          <option value="0">No extra spacing</option><option value="100">100 ms</option><option
            value="200">200 ms</option
          ><option value="1000">1 s</option>
        </select>
      </label>
      <button
        disabled={!session.activeChannelId}
        title={session.activeChannelId ? 'Add at the playhead (K)' : 'Select a lane first'}
        onclick={() => session.addAtPlayhead()}>Add keyframe</button
      >
      <button
        aria-label="Nudge earlier"
        disabled={!session.selection.length}
        title={session.selection.length
          ? 'Nudge selected keyframes one frame earlier (,)'
          : 'Select keyframes first'}
        onclick={() => session.nudgeSelection(-1)}>‹ frame</button
      >
      <button
        aria-label="Nudge later"
        disabled={!session.selection.length}
        title={session.selection.length
          ? 'Nudge selected keyframes one frame later (.)'
          : 'Select keyframes first'}
        onclick={() => session.nudgeSelection(1)}>frame ›</button
      >
    </div>
    <div class="tool-group" role="group" aria-label="Timeline view">
      <button aria-label="Zoom out" onclick={() => session.zoomKey('[', false)}>−</button>
      <button aria-label="Zoom in" onclick={() => session.zoomKey(']', false)}>+</button>
      <button aria-label="Fit movie" onclick={fitTimeline}>Fit movie</button>
      <button
        aria-label="Fit selection"
        disabled={!session.selection.length}
        title={session.selection.length
          ? 'Fit selected keyframes'
          : 'Select one or more keyframes first'}
        onclick={() => runTimelineCommand('zoom-fit-selection')}>Fit selection</button
      >
      <button
        aria-label="Frame detail"
        title="Zoom to one proxy frame per pixel"
        onclick={() => runTimelineCommand('zoom-frame-detail')}>Frame detail</button
      >
      <button
        aria-label="Follow playhead"
        aria-pressed={session.followPlayhead}
        onclick={() => (session.followPlayhead = !session.followPlayhead)}>Follow playhead</button
      >
      <button aria-label="Reveal playhead" onclick={revealPlayhead}>Reveal playhead</button>
    </div>
    <div class="tool-group" role="group" aria-label="Keyframe navigation">
      <button
        aria-label="All lanes"
        aria-pressed={!session.activeChannelId}
        title={session.activeChannelId
          ? 'Search all lanes for keyframes'
          : 'Keyframe navigation searches all lanes'}
        onclick={() => session.clearActiveChannel()}>All lanes</button
      >
      <label class="goto-time"
        >Go to time
        <input
          bind:this={timeInput}
          aria-label="Go to time"
          placeholder="hh:mm:ss.mmm"
          aria-invalid={Boolean(timeError)}
          aria-describedby="goto-time-error"
          bind:value={timeDraft}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTime();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              timeError = '';
              timeDraft = formatElapsedTime(Math.round(session.playheadMs));
            }
          }}
        />
      </label>
      <span id="goto-time-error"
        >{#if timeError}<span class="time-error" role="alert">{timeError}</span>{/if}</span
      >
      <button
        aria-label="Previous keyframe"
        title={session.canNavigateKeyframe(-1)
          ? `Previous keyframe (PageUp), ${session.activeChannelId ? 'active lane' : 'all lanes'}`
          : `No earlier keyframe in ${session.activeChannelId ? 'this lane' : 'any lane'}`}
        disabled={!session.canNavigateKeyframe(-1)}
        onclick={() => session.navigateKeyframe(-1)}>Previous key</button
      >
      <button
        aria-label="Next keyframe"
        title={session.canNavigateKeyframe(1)
          ? `Next keyframe (PageDown), ${session.activeChannelId ? 'active lane' : 'all lanes'}`
          : `No later keyframe in ${session.activeChannelId ? 'this lane' : 'any lane'}`}
        disabled={!session.canNavigateKeyframe(1)}
        onclick={() => session.navigateKeyframe(1)}>Next key</button
      >
    </div>
  </div>
  <EditorAuditionRange {session} />
  <EditorMarkers {session} />
  <div
    class="timeline-scroll"
    role="region"
    aria-label="Timeline scroll area"
    bind:this={timelineContainer}
    onscroll={() => {
      if (timelineContainer) {
        session.scrollX = timelineContainer.scrollLeft;
        visibleWidth = timelineContainer.clientWidth;
      }
    }}
  >
    <div
      class="ruler"
      style={`width:${timelineWidth}px;margin-left:${headerWidth}px`}
      bind:this={ruler}
      role="slider"
      aria-label="Timeline ruler"
      aria-valuemin="0"
      aria-valuemax={duration}
      aria-valuenow={Math.round(session.playheadMs)}
      tabindex="0"
      onpointerdown={(event) => {
        beginPan(event);
        if (event.button === 1) return;
        beginPointerGesture(event.currentTarget as HTMLElement, event);
        scrub(event);
      }}
      onpointermove={(event) => {
        if (event.buttons & 1) scrub(event);
      }}
      onkeydown={(event) => {
        if ((event.key === 'PageUp' || event.key === 'PageDown') && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          session.navigateKeyframe(event.key === 'PageUp' ? -1 : 1);
          return;
        }
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          event.stopPropagation();
          session.seekBoundary(event.key === 'End');
          return;
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) session.skip(event.key === 'ArrowLeft' ? -1 : 1);
          else session.step(event.key === 'ArrowLeft' ? -1 : 1);
        }
      }}
    >
      {#if session.auditionRange.startMs != null && session.auditionRange.endMs != null && !session.loopReason}
        <div
          class="audition-highlight"
          aria-hidden="true"
          style={`left:${session.auditionRange.startMs * session.pxPerMs}px;width:${(session.auditionRange.endMs - session.auditionRange.startMs) * session.pxPerMs}px`}
        ></div>
      {/if}
      {#each sceneCutLines as timeMs (timeMs)}
        <button
          type="button"
          class="scene-transition"
          aria-label={`Scene transition at ${format(timeMs)}`}
          title={`Scene transition · ${format(timeMs)}`}
          style={`left:${timeMs * session.pxPerMs}px`}
          onpointerdown={(event) => event.stopPropagation()}
          onclick={(event) => {
            event.stopPropagation();
            session.seek(timeMs);
          }}>▾</button
        >
      {/each}
      {#each session.projectSidecar.sceneMarkers as marker (marker.id)}
        <button
          class="scene-marker"
          aria-label={`Marker ${marker.label} at ${format(marker.timeMs)}`}
          title={`${marker.label} · ${format(marker.timeMs)}`}
          style={`left:${marker.timeMs * session.pxPerMs}px`}
          onpointerdown={(event) => event.stopPropagation()}
          onclick={(event) => {
            event.stopPropagation();
            session.selectedMarkerId = marker.id;
            session.seek(marker.timeMs);
          }}>◆</button
        >
      {/each}
      {#each ticks as tick (tick.timeMs)}
        <span
          class:major={tick.major}
          class="tick"
          aria-hidden="true"
          style={`left:${tick.timeMs * session.pxPerMs}px`}
          >{#if tick.major && (duration - tick.timeMs) * session.pxPerMs >= labelWidth}{format(
              tick.timeMs
            )}{/if}</span
        >
      {/each}
    </div>
    {#if snapGuide}
      <div
        class="snap-guide"
        role="status"
        style={`left:${headerWidth + snapGuide.timeMs * session.pxPerMs}px;height:${30 + session.channels.length * 40}px`}
      >
        <span>{snapGuide.label} {format(snapGuide.timeMs)}</span>
      </div>
    {/if}
    {#each sceneCutLines as timeMs (timeMs)}
      <i
        class="scene-cut"
        aria-hidden="true"
        title={`Scene cut ${format(timeMs)}`}
        style={`left:${headerWidth + timeMs * session.pxPerMs}px;height:${30 + session.channels.length * 40}px`}
      ></i>
    {/each}
    <i
      class="playhead"
      aria-hidden="true"
      style={`left:${headerWidth + session.playheadMs * session.pxPerMs}px;height:${30 + session.channels.length * 40}px`}
    ></i>
    {#each session.channels as channel (channel.id)}
      {@const laneKeyframes =
        renderedTrack?.keyframes.filter(
          (keyframe: Keyframe) => keyframe.channelId === channel.id
        ) ?? []}
      <div
        class="lane-row"
        style={`width:${timelineWidth + headerWidth}px;--timeline-header-width:${headerWidth}px`}
      >
        <div
          class="lane-header"
          role="group"
          aria-label={`${channel.displayName} channel controls`}
        >
          <button
            class="lane-name"
            oncontextmenu={(event) => {
              event.preventDefault();
              onCloseMenus();
              session.menuChannel = channel.id;
            }}
            onkeydown={(event) => {
              if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
                event.preventDefault();
                session.menuChannel = channel.id;
              }
            }}
            title={laneDescription(channel)}
            onclick={() => {
              session.clearSelection();
              onEffectSelected('');
              session.activeChannelId = channel.id;
            }}>{laneDescription(channel)}</button
          >
          <button
            type="button"
            aria-label={`Solo ${channel.displayName}`}
            aria-pressed={Boolean(session.solo[channel.id])}
            onclick={() => session.toggleSolo(channel.id)}>S</button
          >
          <button
            type="button"
            aria-label={`Mute ${channel.displayName}`}
            aria-pressed={Boolean(session.mute[channel.id])}
            onclick={() => session.toggleMute(channel.id)}>M</button
          >
        </div>
        <div
          class="lane"
          role="presentation"
          ondragover={acceptEffectDrag}
          ondrop={(event) => dropEffect(event, channel.id)}
          oncontextmenu={(event) => {
            event.preventDefault();
            session.menuChannel = channel.id;
          }}
          onpointerdown={(event) => {
            beginPan(event);
            if (event.target === event.currentTarget) beginLane(event, channel.id);
          }}
        >
          <TimelineLane
            frames={laneKeyframes}
            scale={session.pxPerMs}
            scroll={session.scrollX}
            width={session.laneWidth}
            selected={session.selection}
            label={channel.displayName}
            defaultRgb={displayedRgb({
              ...channel.defaultColor,
              brightness: channel.defaultBrightness,
            })}
            choose={(event, id) => chooseKeyframe(event, id)}
            begin={beginDiamond}
            beginBlank={(event) => beginLane(event, channel.id)}
          />
          {#if session.track?.keyframes.length === 0}
            <span class="lane-empty">Click to add a keyframe</span>
          {/if}
          {#each session.track?.effects.filter((effect: EffectKeyframe) => effect.channelId === channel.id) ?? [] as effect (effect.id)}
            <div
              class="effect-block"
              style={`left:${timeToContentX(effect.timestampMs, session.pxPerMs, duration) ?? 0}px;width:${Math.max(24, effect.durationMs * session.pxPerMs)}px`}
            >
              <button
                type="button"
                class="effect-body"
                aria-label={`${effect.effectType} effect at ${format(effect.timestampMs)}`}
                title="Drag to move. Use the edge to change duration."
                onpointerdown={(event) => {
                  onEffectSelected(effect.id);
                  session.clearSelection();
                  session.activeChannelId = channel.id;
                  beginEffectGesture(event, effect.id, 'move', effect);
                }}
                onclick={(event) => {
                  event.stopPropagation();
                  onEffectSelected(effect.id);
                  session.clearSelection();
                  session.activeChannelId = channel.id;
                }}>{effect.effectType}</button
              >
              <button
                type="button"
                class="effect-resize"
                aria-label={`Resize ${effect.effectType}`}
                title="Drag to change duration"
                onpointerdown={(event) => beginEffectGesture(event, effect.id, 'resize', effect)}
              ></button>
            </div>
          {/each}
          <!-- Only the focused selection gets a DOM focus target; all marks are canvas pixels. -->
          {#each laneKeyframes
            .filter((frame: Keyframe) => frame.id === session.primarySelectionId)
            .slice(0, 1) as keyframe (keyframe.id)}
            {#if session.selection.length === 1 && keyframe.interpolation === 'LINEAR'}
              <button
                class="fade-handle"
                aria-label="Incoming fade start"
                title="Drag incoming fade start; use Fade length in Inspector for an exact duration"
                style={`left:${Math.max(0, keyframe.timestampMs - keyframe.transitionMs) * session.pxPerMs}px`}
                onpointerdown={(event) => beginFadeGesture(event, keyframe)}
                onkeydown={(event) => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    event.stopPropagation();
                    const delta =
                      Math.round(1000 / (session.media?.proxy.fps ?? 24)) *
                      (event.shiftKey ? 10 : 1);
                    session.setTransition(
                      String(
                        Math.max(
                          0,
                          Math.min(
                            keyframe.timestampMs,
                            keyframe.transitionMs + (event.key === 'ArrowLeft' ? delta : -delta)
                          )
                        )
                      )
                    );
                  }
                }}>↔</button
              >
            {/if}
            <button
              class="diamond"
              aria-label={`${channel.displayName} keyframe at ${format(keyframe.timestampMs)}`}
              class:selected={session.selection.includes(keyframe.id)}
              aria-pressed="true"
              tabindex="0"
              style={`left:${timeToContentX(keyframe.timestampMs, session.pxPerMs, duration) ?? 0}px;background:transparent`}
              onpointerdown={(event) => beginDiamond(event, keyframe.id)}
              onclick={(event) => {
                event.stopPropagation();
                if (event.detail === 0) chooseKeyframe(event, keyframe.id);
              }}
            ></button>
          {/each}
        </div>
      </div>
    {/each}
    {#if marqueeRect}
      {@const left = Math.max(session.scrollX, Math.min(marqueeRect.x0, marqueeRect.x1))}
      {@const right = Math.min(
        session.scrollX + session.laneWidth,
        Math.max(marqueeRect.x0, marqueeRect.x1)
      )}
      {@const top = Math.max(0, Math.min(marqueeRect.y0, marqueeRect.y1))}
      {@const bottom = Math.min(
        session.channels.length * 40,
        Math.max(marqueeRect.y0, marqueeRect.y1)
      )}
      <div
        class="selection-rectangle"
        role="img"
        aria-label="Selection rectangle"
        style={`left:${headerWidth + left}px;top:${30 + top}px;width:${Math.max(0, right - left)}px;height:${Math.max(0, bottom - top)}px`}
      ></div>
    {/if}
  </div>
</section>

<style>
  .fade-handle {
    position: absolute;
    top: 0;
    min-height: 16px;
    height: 16px;
    width: 20px;
    padding: 0;
    transform: translateX(-50%);
    border: 1px solid var(--accent);
    background: var(--surface);
    color: var(--text);
    z-index: 3;
    cursor: ew-resize;
    touch-action: none;
  }
  .audition-highlight {
    position: absolute;
    top: 0;
    height: 100%;
    border-inline: 2px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    pointer-events: none;
  }
  .scene-marker,
  .scene-transition {
    position: absolute;
    top: 13px;
    transform: translateX(-50%);
    padding: 0;
    min-height: 16px;
    min-width: 16px;
    color: var(--accent);
    background: var(--surface);
    z-index: 3;
  }
  .scene-transition {
    top: 1px;
    color: var(--text);
    font-size: 12px;
    line-height: 14px;
  }
  .snap-guide {
    position: absolute;
    top: 0;
    border-left: 1px dashed var(--accent);
    pointer-events: none;
    z-index: 4;
  }
  .snap-guide span {
    position: absolute;
    top: 1px;
    left: 3px;
    white-space: nowrap;
    color: var(--text);
    background: var(--surface);
    font-size: 11px;
  }
  button {
    min-height: 32px;
    padding: 6px 10px;
  }
  select {
    min-height: 34px;
    padding: 6px 10px;
  }
  .timeline {
    display: flex;
    flex-direction: column;
    grid-column: 1 / -1;
    min-width: 0;
    min-height: 0;
    border-top: 1px solid var(--border-strong);
    background: var(--surface);
    padding: 8px 16px;
  }
  .tools-hint {
    display: none;
  }
  .timeline-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    height: auto;
    min-height: 36px;
    min-width: 0;
    flex: 0 0 auto;
  }
  .tool-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding-right: 8px;
    border-right: 1px solid var(--border);
  }
  .tool-group:last-child {
    border-right: 0;
  }
  .layout-picker {
    min-width: 0;
  }
  .goto-time {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .goto-time input {
    width: 124px;
    min-width: 0;
    font-family: var(--font-mono);
  }
  .time-error {
    display: block;
    max-width: min(260px, 100%);
    overflow-wrap: anywhere;
    color: var(--danger);
    font-size: 12px;
  }
  .goto-time input[aria-invalid='true'] {
    border-color: var(--danger);
  }
  @media (max-width: 750px) {
    .tools-hint {
      display: block;
      margin: 0 0 4px;
      color: var(--text-muted);
      font-size: 11px;
    }
    .tool-group[aria-label='Timeline view'] {
      order: -1;
    }
    .timeline-tools {
      height: auto;
      max-height: 108px;
      overflow-y: auto;
      overscroll-behavior: contain;
      align-content: flex-start;
      min-height: 36px;
      flex: 0 0 auto;
      flex-wrap: wrap;
    }
    .timeline-scroll {
      height: auto;
      min-height: 0;
      flex: 1 1 auto;
    }
  }
  .timeline-scroll {
    overflow: auto;
    flex: 1 1 0;
    min-height: 0;
    position: relative;
    cursor: grab;
  }
  .timeline-scroll:active {
    cursor: grabbing;
  }
  .ruler {
    height: 30px;
    display: flex;
    justify-content: space-between;
    position: relative;
    align-items: center;
    border-bottom: 1px solid var(--border-strong);
    background: var(--timeline-ruler-bg);
    cursor: ew-resize;
    touch-action: none;
  }
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    border-left: 1px solid var(--timeline-grid-line);
    pointer-events: none;
    color: var(--text-muted);
    font: 11px/1.2 var(--font-mono);
  }
  .tick.major {
    border-color: var(--border-strong);
  }
  .tick.major {
    white-space: nowrap;
  }
  .tick.major:not(:empty) {
    padding-top: 2px;
  }
  .scene-cut {
    position: absolute;
    z-index: 1;
    top: 0;
    width: 1px;
    background: color-mix(in srgb, var(--text) 45%, transparent);
    pointer-events: none;
  }
  .playhead {
    position: absolute;
    z-index: 2;
    top: 0;
    width: 2px;
    background: var(--timeline-playhead);
    pointer-events: none;
  }
  .lane-row {
    height: 40px;
    display: grid;
    grid-template-columns: var(--timeline-header-width) minmax(0, 1fr);
    border-bottom: 1px solid var(--border);
  }
  .lane-header {
    position: sticky;
    left: 0;
    z-index: 2;
    background: var(--surface);
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .lane-name {
    display: block;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 0;
    background: transparent;
  }
  .lane-header button[aria-pressed='true'] {
    color: var(--accent-text);
    border-color: var(--accent);
    background: var(--accent-soft);
    font-weight: 700;
  }
  .lane {
    touch-action: none;
    position: relative;
    background: var(--timeline-lane-bg);
    cursor: crosshair;
  }
  .lane-empty {
    position: absolute;
    left: 12px;
    top: 10px;
    color: var(--text-subtle);
    font-size: 11px;
    pointer-events: none;
  }
  .selection-rectangle {
    position: absolute;
    pointer-events: none;
    z-index: 1;
    border: 1px solid var(--accent-text);
    background: var(--accent-soft);
  }
  .diamond {
    position: absolute;
    top: 12px;
    width: 14px;
    height: 14px;
    padding: 0;
    transform: translateX(-50%) rotate(45deg);
    min-height: 0;
    border: 2px solid var(--bg);
  }
  .diamond.selected {
    outline: 2px solid var(--on-video);
  }
  .effect-block {
    position: absolute;
    top: 5px;
    bottom: 5px;
    display: flex;
    min-width: 24px;
    overflow: hidden;
    background: var(--effect-bg);
    border: 1px solid var(--effect-border);
    border-radius: 4px;
    z-index: 2;
  }
  .effect-body {
    flex: 1;
    min-width: 0;
    padding: 0 4px;
    overflow: hidden;
    color: var(--text);
    background: transparent;
    border: 0;
    font-size: 10px;
    text-align: left;
    cursor: grab;
  }
  .effect-resize {
    flex: 0 0 8px;
    padding: 0;
    background: var(--effect-border);
    border: 0;
    cursor: ew-resize;
  }
  @media (max-width: 500px) {
    .timeline-tools {
      height: auto;
      min-height: 36px;
      flex-wrap: wrap;
      justify-content: flex-start;
    }
    .timeline-scroll {
      height: auto;
      min-height: 0;
      flex: 1 1 auto;
    }
  }
  @media (max-width: 750px) {
    .timeline {
      grid-column: 1;
    }
  }
</style>
