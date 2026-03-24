<script lang="ts">
  let {
    onAddKeyframe,
    onAddChannel,
    onToggleSnapping,
    onToggleOverlay,
    onLoadVideo,
    snappingEnabled = true,
    overlayVisible = true,
  }: {
    onAddKeyframe?: () => void;
    onAddChannel?: () => void;
    onToggleSnapping?: () => void;
    onToggleOverlay?: () => void;
    onLoadVideo?: () => void;
    snappingEnabled?: boolean;
    overlayVisible?: boolean;
  } = $props();
</script>

<div
  class="flex items-center gap-1 h-9 px-2 bg-[var(--surface)] border-b border-[var(--surface2)] select-none"
>
  <!-- Video -->
  <button class="btn-icon" title="Load Video File" aria-label="Load Video File" onclick={() => onLoadVideo?.()}>
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  </button>

  <div class="w-px h-5 bg-[var(--surface2)] mx-1"></div>

  <!-- Keyframe -->
  <button class="btn-icon" title="Add Keyframe (K)" aria-label="Add Keyframe" onclick={() => onAddKeyframe?.()}>
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 4l6 8-6 8-6-8 6-8z"
      />
    </svg>
  </button>

  <!-- Channel -->
  <button class="btn-icon" title="Add Channel" aria-label="Add Channel" onclick={() => onAddChannel?.()}>
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  </button>

  <div class="w-px h-5 bg-[var(--surface2)] mx-1"></div>

  <!-- Snapping toggle -->
  <button
    class="btn-icon"
    class:text-accent={snappingEnabled}
    title="Toggle Snapping"
    aria-label="Toggle Snapping"
    aria-pressed={snappingEnabled}
    onclick={() => onToggleSnapping?.()}
  >
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  </button>

  <!-- Overlay toggle -->
  <button
    class="btn-icon"
    class:text-accent2={overlayVisible}
    title="Toggle Lighting Overlay (L)"
    aria-label="Toggle Lighting Overlay"
    aria-pressed={overlayVisible}
    onclick={() => onToggleOverlay?.()}
  >
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  </button>

  <div class="flex-1"></div>

  <!-- Zoom controls -->
  <button class="btn-icon" title="Zoom Out (Ctrl+-)">
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
      />
    </svg>
  </button>
  <button class="btn-icon" title="Zoom In (Ctrl+=)">
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
      />
    </svg>
  </button>
  <button class="btn-icon" title="Zoom to Fit (Ctrl+0)">
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
      />
    </svg>
  </button>
</div>
