<script lang="ts">
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { CHANNEL_HEADER_WIDTH } from '$lib/types/timeline.js';
  import ChannelHeaders from './ChannelHeaders.svelte';
  import TimelineCanvas from './TimelineCanvas.svelte';
  import Minimap from './Minimap.svelte';

  // Shared vertical scroll position — keeps headers and canvas in sync
  let sharedScrollY = $state(0);

  // The canvas scroll container ref, for programmatic scroll sync
  let canvasScrollEl = $state<HTMLDivElement | null>(null);

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

  // Forward pointer events from canvas area to interaction handler (Task 16 stub)
  function handlePointerDown(e: PointerEvent) {
    // Task 16 interaction handler will be wired here
  }

  function handlePointerMove(e: PointerEvent) {
    // Task 16 interaction handler will be wired here
  }

  function handlePointerUp(e: PointerEvent) {
    // Task 16 interaction handler will be wired here
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
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onwheel={handleWheel}
      role="presentation"
      style="touch-action: none;"
    >
      <TimelineCanvas />
    </div>
  </div>

  <!-- Minimap spans full width below -->
  <Minimap />
</div>
