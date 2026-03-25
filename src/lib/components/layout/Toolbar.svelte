<script lang="ts">
  import { IconButton, Tooltip } from '$lib/components/shared/index.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
</script>

<div class="flex h-toolbar-h items-center bg-surface border-b border-surface2 px-2 gap-1 no-select">
  <!-- Tool buttons -->
  <Tooltip text="Select tool">
    <IconButton icon="🔲" title="Select tool" />
  </Tooltip>
  <Tooltip text="Add Keyframe (K)">
    <IconButton icon="◆" title="Add Keyframe" />
  </Tooltip>
  <Tooltip text="Add Channel">
    <IconButton icon="➕" title="Add Channel" />
  </Tooltip>
  <Tooltip text="Add Scene Marker">
    <IconButton icon="📍" title="Add Scene Marker" />
  </Tooltip>

  <!-- Separator -->
  <div class="w-px h-5 bg-surface2 mx-1"></div>

  <!-- Toggle buttons -->
  <Tooltip text="Toggle Snapping">
    <IconButton
      icon="🧲"
      title="Snapping"
      active={uiStore.state.snappingEnabled}
      onclick={() => uiStore.toggleSnapping()}
    />
  </Tooltip>
  <Tooltip text="Toggle Overlay">
    <IconButton
      icon="💡"
      title="Overlay"
      active={uiStore.state.overlayEnabled}
      onclick={() => uiStore.toggleOverlay()}
    />
  </Tooltip>

  <!-- Separator -->
  <div class="w-px h-5 bg-surface2 mx-1"></div>

  <!-- Zoom controls -->
  <Tooltip text="Zoom In">
    <IconButton icon="🔍+" title="Zoom In" size="sm" />
  </Tooltip>
  <Tooltip text="Zoom Out">
    <IconButton icon="🔍-" title="Zoom Out" size="sm" />
  </Tooltip>
  <Tooltip text="Zoom to Fit">
    <IconButton icon="⊞" title="Zoom to Fit" size="sm" />
  </Tooltip>

  <!-- Spacer -->
  <div class="flex-1"></div>

  <!-- Project name + dirty indicator -->
  <div class="flex items-center gap-1.5 text-xs text-textMuted pr-1">
    <span class="truncate max-w-[200px]">{projectStore.project.displayName}</span>
    {#if projectStore.project.isDirty}
      <span class="w-2 h-2 rounded-full bg-accent flex-shrink-0" title="Unsaved changes"></span>
    {/if}
  </div>
</div>
