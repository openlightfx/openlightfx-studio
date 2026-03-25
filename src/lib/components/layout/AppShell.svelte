<script lang="ts">
  import type { Snippet } from 'svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { DEFAULT_PANEL_SIZES } from '$lib/types/index.js';
  import type { PanelSizes } from '$lib/types/index.js';
  import PanelSplitter from './PanelSplitter.svelte';

  let {
    menuBar,
    toolbar,
    videoPanel,
    propertiesPanel,
    playbackBar,
    timelinePanel,
  }: {
    menuBar: Snippet;
    toolbar: Snippet;
    videoPanel: Snippet;
    propertiesPanel: Snippet;
    playbackBar: Snippet;
    timelinePanel: Snippet;
  } = $props();

  // Panel sizes in percentages — initialized from project state
  let panelSizes = $state<PanelSizes>({
    ...DEFAULT_PANEL_SIZES,
    ...projectStore.project.file.uiState.panelSizes,
  });

  // Container refs for computing deltas as percentages
  let middleContainerEl = $state<HTMLDivElement | null>(null);
  let shellContainerEl = $state<HTMLDivElement | null>(null);

  function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val));
  }

  function handleVerticalSplitterResize(delta: number) {
    if (!middleContainerEl) return;
    const containerWidth = middleContainerEl.clientWidth;
    if (containerWidth === 0) return;
    const pctDelta = (delta / containerWidth) * 100;
    panelSizes = {
      ...panelSizes,
      propertiesPanelWidth: clamp(panelSizes.propertiesPanelWidth - pctDelta, 10, 50),
    };
  }

  function handleHorizontalSplitterResize(delta: number) {
    if (!shellContainerEl) return;
    const containerHeight = shellContainerEl.clientHeight;
    if (containerHeight === 0) return;
    const pctDelta = (delta / containerHeight) * 100;
    panelSizes = {
      ...panelSizes,
      timelinePanelHeight: clamp(panelSizes.timelinePanelHeight - pctDelta, 15, 70),
    };
  }

  // Persist panel sizes to project store
  $effect(() => {
    const ps = panelSizes;
    projectStore.project = {
      ...projectStore.project,
      file: {
        ...projectStore.project.file,
        uiState: {
          ...projectStore.project.file.uiState,
          panelSizes: { ...ps },
        },
      },
    };
  });

  // Document title — project name + dirty indicator (STU-005)
  $effect(() => {
    const name = projectStore.project.displayName;
    const dirty = projectStore.project.isDirty;
    document.title = `${dirty ? '● ' : ''}${name} — OpenLightFX Studio`;
  });

  // Allow external reset
  export function resetLayout() {
    panelSizes = { ...DEFAULT_PANEL_SIZES };
  }

  // Computed styles for grid areas
  const middleHeight = $derived(100 - panelSizes.timelinePanelHeight);
  const videoPanelWidth = $derived(100 - panelSizes.propertiesPanelWidth);
</script>

<div
  bind:this={shellContainerEl}
  class="flex flex-col h-screen w-screen bg-bg text-text-base overflow-hidden"
>
  <!-- Menu Bar -->
  {@render menuBar()}

  <!-- Toolbar -->
  {@render toolbar()}

  <!-- Content area (middle + timeline) fills remaining space -->
  <div class="flex flex-col flex-1 min-h-0">
    <!-- Middle section: video + properties -->
    <div
      bind:this={middleContainerEl}
      class="flex min-h-0"
      style="height: {middleHeight}%"
    >
      <!-- Video Panel -->
      <div class="min-w-0 overflow-hidden" style="width: {videoPanelWidth}%">
        {@render videoPanel()}
      </div>

      <!-- Vertical Splitter -->
      <PanelSplitter direction="vertical" onresize={handleVerticalSplitterResize} />

      <!-- Properties Panel -->
      <div class="min-w-0 overflow-hidden" style="width: {panelSizes.propertiesPanelWidth}%">
        {@render propertiesPanel()}
      </div>
    </div>

    <!-- Playback Bar (fixed height between middle and timeline) -->
    {@render playbackBar()}

    <!-- Horizontal Splitter -->
    <PanelSplitter direction="horizontal" onresize={handleHorizontalSplitterResize} />

    <!-- Timeline Panel -->
    <div class="min-h-0 overflow-hidden" style="height: {panelSizes.timelinePanelHeight}%">
      {@render timelinePanel()}
    </div>
  </div>
</div>
