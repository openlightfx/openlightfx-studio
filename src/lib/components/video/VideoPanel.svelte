<script lang="ts">
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { SUPPORTED_VIDEO_TYPES, VIDEO_FILE_EXTENSIONS } from '$lib/types/index.js';
  import LightingOverlay from './LightingOverlay.svelte';
  import LightIcons from './LightIcons.svelte';
  import Eyedropper from './Eyedropper.svelte';

  let videoEl: HTMLVideoElement | undefined = $state();
  let containerEl: HTMLDivElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();

  const isLoaded = $derived(videoStore.state.isLoaded);
  const isLoading = $derived(videoStore.state.isLoading);
  const objectUrl = $derived(videoStore.state.objectUrl);
  const eyedropperActive = $derived(uiStore.state.eyedropperActive);

  $effect(() => {
    if (videoEl) {
      videoStore.bindVideoElement(videoEl);
      return () => {
        videoStore.unbindVideoElement();
      };
    }
  });

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      videoStore.loadFile(file);
    }
    input.value = '';
  }

  function openFilePicker() {
    fileInput?.click();
  }
</script>

<div
  bind:this={containerEl}
  class="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-black"
>
  <input
    bind:this={fileInput}
    type="file"
    accept={VIDEO_FILE_EXTENSIONS}
    onchange={handleFileSelect}
    class="hidden"
    aria-label="Load video file"
  />

  {#if isLoading}
    <!-- Loading overlay -->
    <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80">
      <svg
        class="h-10 w-10 animate-spin text-accent"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p class="text-sm text-textMuted">Loading video…</p>
    </div>
  {/if}

  {#if isLoaded && objectUrl}
    <!-- Video wrapper: aspect-ratio constrained -->
    <div class="relative flex h-full w-full items-center justify-center">
      <video
        bind:this={videoEl}
        src={objectUrl}
        class="max-h-full max-w-full"
        preload="auto"
        playsinline
      >
        <track kind="captions" />
      </video>

      <!-- Overlays positioned over the video element -->
      {#if videoEl}
        <LightingOverlay {videoEl} />
        <LightIcons {videoEl} />
        {#if eyedropperActive}
          <Eyedropper {videoEl} />
        {/if}
      {/if}
    </div>
  {:else}
    <!-- Unloaded state: keep video element bound for loadedmetadata to fire -->
    <video bind:this={videoEl} class="hidden" preload="auto" playsinline>
      <track kind="captions" />
    </video>

    {#if !isLoading}
      <div class="flex flex-col items-center gap-4 text-textMuted">
        <svg
          class="h-16 w-16 opacity-40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path
            d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z"
          />
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-sm">No video loaded</p>
        <button
          onclick={openFilePicker}
          class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Load Video
        </button>
        <p class="text-xs opacity-60">Supports MP4 (H.264), WebM (VP8/VP9)</p>
      </div>
    {/if}
  {/if}
</div>
