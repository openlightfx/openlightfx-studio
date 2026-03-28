<script lang="ts">
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { toastStore } from '$lib/stores/toast.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { SUPPORTED_VIDEO_TYPES } from '$lib/types/video.js';
  import Eyedropper from '$lib/components/video/Eyedropper.svelte';
  import LightingOverlay from '$lib/components/video/LightingOverlay.svelte';

  let videoEl = $state<HTMLVideoElement | null>(null);
  let isDragOver = $state(false);

  // Bind video element to store on mount
  $effect(() => {
    if (videoEl) {
      videoStore.bindElement(videoEl);
    }
  });

  // Sync src from store
  $effect(() => {
    if (videoEl && videoStore.objectUrl) {
      videoEl.src = videoStore.objectUrl;
    }
  });

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    isDragOver = true;
  }

  function handleDragLeave(e: DragEvent) {
    // Only clear if leaving the panel entirely (not entering a child)
    const related = e.relatedTarget as Node | null;
    const panel = (e.currentTarget as HTMLElement);
    if (!related || !panel.contains(related)) {
      isDragOver = false;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    if (!SUPPORTED_VIDEO_TYPES.includes(file.type)) {
      toastStore.error(`Unsupported file type: ${file.type || file.name}. Use MP4, WebM, or MKV.`);
      return;
    }

    projectStore.setVideoFile(file);
    const objectUrl = projectStore.videoObjectUrl!;
    videoStore.loadFile(file, objectUrl);
  }

  // Computed aspect ratio style
  const aspectStyle = $derived(
    videoStore.videoWidth > 0 && videoStore.videoHeight > 0
      ? `aspect-ratio: ${videoStore.videoWidth} / ${videoStore.videoHeight};`
      : 'aspect-ratio: 16 / 9;'
  );
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative h-full flex items-center justify-center overflow-hidden bg-black select-none"
  class:ring-2={isDragOver}
  class:ring-accent={isDragOver}
  class:ring-inset={isDragOver}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  role="region"
  aria-label="Video panel"
>
  <!-- Video element -->
  <div class="relative max-w-full max-h-full" style={aspectStyle}>
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={videoEl}
      class="w-full h-full object-contain"
      class:invisible={!videoStore.isLoaded}
      preload="metadata"
      playsinline
    ></video>

    <!-- Lighting overlay -->
    <LightingOverlay />
    <!-- Eyedropper overlay -->
    {#if videoStore.isLoaded}
      <Eyedropper />
    {/if}
  </div>

  <!-- Placeholder when no video loaded -->
  {#if !videoStore.isLoaded && !videoStore.isLoading}
    <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-12 h-12 text-textMuted opacity-40"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
      </svg>
      <p class="text-textMuted text-sm">Drop a video file here</p>
      <p class="text-textMuted text-xs opacity-60">MP4, WebM, MKV</p>
    </div>
  {/if}

  <!-- Loading spinner -->
  {#if videoStore.isLoading}
    <div class="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
      <div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
    </div>
  {/if}

  <!-- Drag-over overlay -->
  {#if isDragOver}
    <div class="absolute inset-0 flex flex-col items-center justify-center bg-accent/10 pointer-events-none">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-10 h-10 text-accent"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
      <p class="text-accent font-medium mt-2">Drop to load video</p>
    </div>
  {/if}
</div>
