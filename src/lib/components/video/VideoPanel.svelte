<script lang="ts">
  import { onMount } from 'svelte';

  let {
    videoUrl = $bindable<string | null>(null),
    currentTime = $bindable(0),
    duration = $bindable(0),
    isPlaying = $bindable(false),
    playbackSpeed = $bindable(1),
    overlayVisible = true,
    onloadedmetadata,
    ontimeupdate,
  }: {
    videoUrl?: string | null;
    currentTime?: number;
    duration?: number;
    isPlaying?: boolean;
    playbackSpeed?: number;
    overlayVisible?: boolean;
    onloadedmetadata?: (e: { duration: number; videoWidth: number; videoHeight: number }) => void;
    ontimeupdate?: (time: number) => void;
  } = $props();

  let videoEl: HTMLVideoElement;
  let containerEl: HTMLDivElement;
  let fileInputEl: HTMLInputElement;
  let hasVideo = $derived(!!videoUrl);

  export function seekTo(timeMs: number) {
    if (videoEl) {
      videoEl.currentTime = timeMs / 1000;
    }
  }

  export function play() {
    videoEl?.play();
    isPlaying = true;
  }

  export function pause() {
    videoEl?.pause();
    isPlaying = false;
  }

  export function getVideoElement(): HTMLVideoElement | null {
    return videoEl ?? null;
  }

  function handleFileSelect() {
    fileInputEl?.click();
  }

  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    videoUrl = URL.createObjectURL(file);
  }

  function handleLoadedMetadata() {
    if (!videoEl) return;
    duration = videoEl.duration * 1000;
    onloadedmetadata?.({
      duration: videoEl.duration * 1000,
      videoWidth: videoEl.videoWidth,
      videoHeight: videoEl.videoHeight,
    });
  }

  function handlePlay() {
    isPlaying = true;
  }
  function handlePause() {
    isPlaying = false;
  }

  $effect(() => {
    if (videoEl) {
      videoEl.playbackRate = playbackSpeed;
    }
  });

  // rAF-based time sync for smooth 60fps playhead updates
  let rafId: number;
  function syncTime() {
    if (videoEl && isPlaying) {
      currentTime = videoEl.currentTime * 1000;
      ontimeupdate?.(currentTime);
    }
    rafId = requestAnimationFrame(syncTime);
  }

  onMount(() => {
    rafId = requestAnimationFrame(syncTime);
    return () => cancelAnimationFrame(rafId);
  });
</script>

<div class="relative flex-1 flex items-center justify-center bg-black overflow-hidden" bind:this={containerEl}>
  <input
    type="file"
    accept="video/*"
    class="hidden"
    bind:this={fileInputEl}
    onchange={handleFileChange}
  />

  {#if hasVideo}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={videoEl}
      src={videoUrl}
      class="max-w-full max-h-full object-contain"
      preload="metadata"
      onloadedmetadata={handleLoadedMetadata}
      onplay={handlePlay}
      onpause={handlePause}
    ></video>

    <!-- Lighting overlay container -->
    {#if overlayVisible}
      <div class="absolute inset-0 pointer-events-none">
        <!-- Overlay layers will be rendered here by the LightingOverlay component -->
      </div>
    {/if}

    <!-- Channel light icons will be rendered here -->
  {:else}
    <!-- Empty state: prompt to load video -->
    <div class="flex flex-col items-center gap-4 text-[var(--text-muted)]">
      <svg class="w-16 h-16 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      <div class="text-center">
        <p class="text-sm font-medium mb-1">No video loaded</p>
        <p class="text-xs">Load a video file to begin authoring</p>
      </div>
      <button class="btn-primary text-sm" onclick={handleFileSelect}>
        Load Video File
      </button>
    </div>
  {/if}
</div>
