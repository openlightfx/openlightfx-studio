<script lang="ts">
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { DEFAULT_PX_PER_MS } from '$lib/types/timeline.js';

  let {
    saveProviderName = 'Local',
  }: {
    saveProviderName?: string;
  } = $props();

  // Zoom expressed as a percentage relative to the default zoom level
  const zoomPercent = $derived(Math.round((timelineStore.pxPerMs / DEFAULT_PX_PER_MS) * 100));
</script>

<footer
  class="flex items-center gap-4 px-3 h-6 bg-surface border-t border-surface3 flex-shrink-0 text-xs text-textMuted select-none"
>
  <!-- HDR badge -->
  {#if videoStore.isHdr}
    <span
      class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent2/15 text-accent2 leading-none"
      title="HDR10 video"
    >HDR10</span>
  {/if}

  <!-- Color space -->
  {#if videoStore.colorSpace}
    <span class="text-textMuted" title="Color space">{videoStore.colorSpace}</span>
  {/if}

  <!-- Zoom -->
  <span title="Timeline zoom">Zoom {zoomPercent}%</span>

  <!-- Spacer -->
  <span class="flex-1"></span>

  <!-- Save provider -->
  <span title="Save provider" class="flex items-center gap-1">
    <svg class="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M11 1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4l-4-3z" />
      <path d="M4 1v4h6V1M4 15v-5h8v5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    {saveProviderName}
  </span>

  <!-- Dirty indicator -->
  <span
    class="flex items-center gap-1"
    title={projectStore.isDirty ? 'Unsaved changes' : 'All changes saved'}
  >
    <span
      class="w-1.5 h-1.5 rounded-full transition-colors"
      class:bg-warning={projectStore.isDirty}
      class:bg-success={!projectStore.isDirty}
    ></span>
    {projectStore.isDirty ? 'Unsaved' : 'Saved'}
  </span>
</footer>
