<script lang="ts">
  import TopBar from './TopBar.svelte';
  import StatusBar from './StatusBar.svelte';
  import CommandPalette from './CommandPalette.svelte';
  import VideoPanel from '$lib/components/video/VideoPanel.svelte';
  import PlaybackControls from '$lib/components/video/PlaybackControls.svelte';
  import TimelinePanel from '$lib/components/timeline/TimelinePanel.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';

  let {
    saveProviderName = 'Local',
    onrename,
    onnewproject,
    onopen,
    onsave,
    onexport,
    oncommandpalette,
  }: {
    saveProviderName?: string;
    onrename?: (name: string) => void;
    onnewproject?: () => void;
    onopen?: () => void;
    onsave?: () => void;
    onexport?: () => void;
    oncommandpalette?: () => void;
  } = $props();

  let commandPaletteOpen = $state(false);

  function openCommandPalette() {
    commandPaletteOpen = true;
    oncommandpalette?.();
  }

  // ── Resizable split: video panel + timeline area ─────────────────────────
  // Stored as percentage of the "inner" area (between TopBar/PlaybackControls/Minimap/StatusBar).
  // Default: 40% video, 60% timeline.
  let videoPct = $state(40);
  const MIN_PCT = 15;
  const MAX_PCT = 75;

  let isDragging = $state(false);
  let containerEl = $state<HTMLDivElement | null>(null);

  function onDragStart(e: PointerEvent) {
    isDragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: PointerEvent) {
    if (!isDragging || !containerEl) return;

    const rect = containerEl.getBoundingClientRect();
    // Fixed rows: TopBar (48px) + PlaybackControls (48px) + StatusBar (24px) + drag handle (8px)
    const FIXED_PX = 48 + 48 + 24 + 8;
    const innerHeight = rect.height - FIXED_PX;
    if (innerHeight <= 0) return;

    const relY = e.clientY - rect.top - 48; // offset below TopBar
    const pct = Math.round((relY / innerHeight) * 100);
    videoPct = Math.max(MIN_PCT, Math.min(MAX_PCT, pct));
  }

  function onDragEnd(e: PointerEvent) {
    isDragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }
</script>

<!--
  CSS Grid layout:
    Row 0: TopBar (auto)
    Row 1: VideoPanel ({videoPct}fr of resizable area)
    Row 2: drag handle (8px)
    Row 3: PlaybackControls (auto ~48px)
    Row 4: TimelinePanel ({100-videoPct}fr, includes Minimap)
    Row 5: StatusBar (auto)
-->
<div
  bind:this={containerEl}
  role="application"
  aria-label="OpenLightFX Studio"
  class="h-screen w-screen bg-bg text-text-base overflow-hidden"
  style="display: grid; grid-template-rows: auto {videoPct}fr 8px auto {100 - videoPct}fr auto;"
  onpointermove={isDragging ? onDragMove : undefined}
>
  <!-- Row 0: TopBar -->
  <TopBar
    projectName={projectStore.displayName}
    isDirty={projectStore.isDirty}
    {saveProviderName}
    {onrename}
    {onnewproject}
    {onopen}
    {onsave}
    {onexport}
    oncommandpalette={openCommandPalette}
  />

  <!-- Row 1: Video Panel -->
  <div class="bg-bg overflow-hidden min-h-0">
    <VideoPanel />
  </div>

  <!-- Row 2: Drag handle between video and timeline -->
  <div
    class="relative flex items-center justify-center cursor-row-resize flex-shrink-0 group z-10"
    class:bg-accent={isDragging}
    class:bg-surface3={!isDragging}
    role="separator"
    aria-orientation="horizontal"
    aria-label="Resize video and timeline panels"
    onpointerdown={onDragStart}
    onpointermove={onDragMove}
    onpointerup={onDragEnd}
    onpointercancel={onDragEnd}
  >
    <!-- Visual grip dots -->
    <div class="flex gap-1 opacity-40 group-hover:opacity-80 transition-opacity">
      {#each [0, 1, 2] as _}
        <span class="w-1 h-1 rounded-full bg-textMuted"></span>
      {/each}
    </div>
  </div>

  <!-- Row 3: Playback Controls -->
  <div class="bg-surface border-t border-surface3 flex-shrink-0 h-12">
    <PlaybackControls />
  </div>

  <!-- Row 4: Timeline (includes Minimap internally) -->
  <div class="bg-bg overflow-hidden min-h-0">
    <TimelinePanel />
  </div>

  <!-- Row 5: StatusBar -->
  <StatusBar {saveProviderName} />
</div>

<!-- Command Palette (portal-level overlay, outside grid) -->
<CommandPalette bind:isOpen={commandPaletteOpen} />
