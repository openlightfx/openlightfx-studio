<script lang="ts">
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { CHANNEL_HEADER_WIDTH, CHANNEL_LANE_HEIGHT, RULER_HEIGHT } from '$lib/types/timeline.js';
  import { hitTest, handleContextMenu as handleContextMenuFn } from './interaction.js';
  import type { ContextMenuItem } from '$lib/types/ui.js';
  import ChannelHeaders from './ChannelHeaders.svelte';
  import TimelineCanvas from './TimelineCanvas.svelte';
  import Minimap from './Minimap.svelte';
  import KeyframePopover from '$lib/components/properties/KeyframePopover.svelte';
  import EffectPopover from '$lib/components/effects/EffectPopover.svelte';
  import SceneMarkerPopover from '$lib/components/timeline/SceneMarkerPopover.svelte';
  import ContextMenu from '$lib/components/shared/ContextMenu.svelte';

  // Shared vertical scroll position — keeps headers and canvas in sync
  let sharedScrollY = $state(0);

  // The canvas scroll container ref, for programmatic scroll sync
  let canvasScrollEl = $state<HTMLDivElement | null>(null);

  // --- Popover state ---
  let keyframePopoverOpen = $state(false);
  let keyframePopoverAnchor = $state({ x: 0, y: 0, width: 0, height: 0 });

  let effectPopoverOpen = $state(false);
  let effectPopoverAnchor = $state({ x: 0, y: 0, width: 0, height: 0 });

  let sceneMarkerPopoverOpen = $state(false);
  let sceneMarkerPopoverAnchor = $state({ x: 0, y: 0, width: 0, height: 0 });
  let sceneMarkerPopoverId = $state<string | null>(null);

  let contextMenuState = $state<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  function handleHeaderScrollY(y: number) {
    if (sharedScrollY === y) return;
    sharedScrollY = y;
    // Sync canvas scroll container
    const el = canvasScrollEl;
    if (el && el.scrollTop !== y) el.scrollTop = y;
    timelineStore.scrollY = y;
  }

  function handleCanvasScroll(e: Event) {
    const el = e.currentTarget as HTMLDivElement;
    const y = el.scrollTop;
    if (sharedScrollY === y) return;
    sharedScrollY = y;
    timelineStore.scrollY = y;
  }

  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      // Use pointer x relative to canvas area as zoom center
      const canvasEl = canvasScrollEl;
      if (canvasEl) {
        const rect = canvasEl.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const centerMs = timelineStore.scrollX + relX / timelineStore.pxPerMs;
        timelineStore.zoom(factor, centerMs);
      } else {
        timelineStore.zoom(factor);
      }
    } else if (e.shiftKey) {
      // Horizontal scroll
      e.preventDefault();
      timelineStore.scrollBy(e.deltaY / timelineStore.pxPerMs);
    } else {
      // Vertical scroll — let natural scroll happen, sync after
      sharedScrollY = (canvasScrollEl?.scrollTop ?? sharedScrollY) + e.deltaY;
      timelineStore.scrollY = sharedScrollY;
    }
  }

  // Compute anchor rect for a keyframe/effect at a given timestamp + channelId
  function computeAnchorRect(
    timestampMs: number,
    channelId: string,
  ): { x: number; y: number; width: number; height: number } {
    const rect = canvasScrollEl?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0, width: 0, height: 0 };
    const channels = projectStore.file?.track.channels ?? [];
    const laneIndex = channels.findIndex((c) => c.id === channelId);
    const pxX = (timestampMs - timelineStore.scrollX) * timelineStore.pxPerMs;
    const pxY = RULER_HEIGHT + laneIndex * CHANNEL_LANE_HEIGHT + CHANNEL_LANE_HEIGHT / 2;
    return {
      x: rect.left + pxX,
      y: rect.top + pxY - (canvasScrollEl?.scrollTop ?? 0),
      width: 1,
      height: 1,
    };
  }

  // React to selection changes to open/close popovers
  $effect(() => {
    const kfIds = timelineStore.selectedKeyframeIds;
    const efIds = timelineStore.selectedEffectIds;

    if (kfIds.length > 0) {
      const kf = projectStore.file?.track.keyframes.find((k) => k.id === kfIds[0]);
      if (kf) {
        const anchor = computeAnchorRect(kf.timestampMs, kf.channelId);
        // Only update anchor when actually opening (avoid infinite loops from isOpen binding)
        if (!keyframePopoverOpen) {
          keyframePopoverAnchor = anchor;
          keyframePopoverOpen = true;
        }
        effectPopoverOpen = false;
        sceneMarkerPopoverOpen = false;
      }
    } else if (efIds.length > 0) {
      const ef = projectStore.file?.track.effectKeyframes.find((e) => e.id === efIds[0]);
      if (ef) {
        const anchor = computeAnchorRect(ef.timestampMs, ef.channelId);
        if (!effectPopoverOpen) {
          effectPopoverAnchor = anchor;
          effectPopoverOpen = true;
        }
        keyframePopoverOpen = false;
        sceneMarkerPopoverOpen = false;
      }
    } else {
      keyframePopoverOpen = false;
      effectPopoverOpen = false;
      sceneMarkerPopoverOpen = false;
    }
  });

  // Handle scene marker click from TimelineCanvas
  function handleSceneMarkerClick(
    markerId: string,
    anchorRect: { x: number; y: number; width: number; height: number },
  ) {
    sceneMarkerPopoverId = markerId;
    sceneMarkerPopoverAnchor = anchorRect;
    sceneMarkerPopoverOpen = true;
    // Close other popovers
    keyframePopoverOpen = false;
    effectPopoverOpen = false;
  }

  // Right-click context menu on the canvas scroll container
  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    const rect = canvasScrollEl?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + (canvasScrollEl?.scrollTop ?? 0);

    const vp = {
      pxPerMs: timelineStore.pxPerMs,
      scrollX: timelineStore.scrollX,
      width: timelineStore.viewportWidth,
      height: timelineStore.viewportHeight,
    };
    const channels = projectStore.file?.track.channels ?? [];
    const keyframes = projectStore.file?.track.keyframes ?? [];
    const effects = projectStore.file?.track.effectKeyframes ?? [];
    const markers = projectStore.file?.sceneMarkers ?? [];

    const hit = hitTest(x, y, vp, channels, keyframes, effects, markers);
    const items = handleContextMenuFn(e, hit, undoStore, projectStore, timelineStore, projectStore);
    if (items.length > 0) {
      contextMenuState = { x: e.clientX, y: e.clientY, items };
    }
  }

  const minimapHeight = $derived(timelineStore.minimapHeight);
</script>

<div class="timeline-panel flex flex-col w-full h-full bg-[#0f0f1a] overflow-hidden">
  <!-- Main area: headers (left) + canvas (right) -->
  <div class="flex flex-1 min-h-0 overflow-hidden">
    <!-- Channel headers column (fixed width, scrolls vertically) -->
    <ChannelHeaders
      scrollY={sharedScrollY}
      onScrollY={handleHeaderScrollY}
    />

    <!-- Timeline canvas area (fills remaining width, scrolls vertically) -->
    <div
      class="flex-1 min-w-0 overflow-y-auto overflow-x-hidden"
      bind:this={canvasScrollEl}
      onscroll={handleCanvasScroll}
      onwheel={handleWheel}
      oncontextmenu={handleContextMenu}
      role="presentation"
      style="touch-action: none;"
    >
      <TimelineCanvas onscenemarkerclick={handleSceneMarkerClick} />
    </div>
  </div>

  <!-- Minimap spans full width below -->
  <Minimap />
</div>

<!-- Popovers and context menu (rendered outside scroll container, use fixed positioning via Popover) -->
{#if keyframePopoverOpen}
  <KeyframePopover anchorRect={keyframePopoverAnchor} bind:isOpen={keyframePopoverOpen} />
{/if}

{#if effectPopoverOpen && effectPopoverAnchor}
  <EffectPopover
    anchorRect={effectPopoverAnchor}
    onclose={() => { effectPopoverOpen = false; }}
  />
{/if}

{#if sceneMarkerPopoverOpen && sceneMarkerPopoverAnchor && sceneMarkerPopoverId}
  <SceneMarkerPopover
    anchorRect={sceneMarkerPopoverAnchor}
    onclose={() => { sceneMarkerPopoverOpen = false; sceneMarkerPopoverId = null; }}
    markerId={sceneMarkerPopoverId}
  />
{/if}

{#if contextMenuState}
  <ContextMenu
    x={contextMenuState.x}
    y={contextMenuState.y}
    items={contextMenuState.items}
    onclose={() => { contextMenuState = null; }}
  />
{/if}
