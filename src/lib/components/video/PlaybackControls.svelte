<script lang="ts">
  import { videoStore } from '$lib/stores/video.svelte.js';
  import IconButton from '$lib/components/shared/IconButton.svelte';
  import { PLAYBACK_SPEEDS } from '$lib/types/video.js';
  import type { PlaybackSpeed } from '$lib/types/video.js';

  // ── Timestamp formatting ────────────────────────────────────────────────────
  function formatTime(ms: number): string {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor(ms % 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  }

  // ── Scrub bar pointer capture ───────────────────────────────────────────────
  let isScrubbing = $state(false);
  let scrubBarEl = $state<HTMLInputElement | null>(null);

  function getScrubValue(e: PointerEvent): number {
    if (!scrubBarEl) return videoStore.currentTimeMs;
    const rect = scrubBarEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return ratio * videoStore.durationMs;
  }

  function onScrubPointerDown(e: PointerEvent) {
    if (!videoStore.isLoaded) return;
    isScrubbing = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    videoStore.seek(getScrubValue(e));
  }

  function onScrubPointerMove(e: PointerEvent) {
    if (!isScrubbing) return;
    videoStore.seek(getScrubValue(e));
  }

  function onScrubPointerUp(e: PointerEvent) {
    if (!isScrubbing) return;
    isScrubbing = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    videoStore.seek(getScrubValue(e));
  }

  // ── Speed selector ──────────────────────────────────────────────────────────
  let speedValue = $derived(String(videoStore.playbackSpeed));

  function onSpeedChange(e: Event) {
    const val = parseFloat((e.currentTarget as HTMLSelectElement).value) as PlaybackSpeed;
    videoStore.setSpeed(val);
  }

  // ── Chapter navigation ──────────────────────────────────────────────────────
  // Chapters will be provided by a future task; for now always disabled
  const hasChapters = $derived(false);
</script>

<div
  class="h-full flex items-center gap-2 px-3 bg-surface border-t border-surface3"
  aria-label="Playback controls"
  role="toolbar"
>
  <!-- Step backward -->
  <IconButton
    label="Step backward (Left)"
    disabled={!videoStore.isLoaded}
    onclick={() => videoStore.stepBackward()}
  >
    <!-- Previous frame icon -->
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z"/>
    </svg>
  </IconButton>

  <!-- Play / Pause -->
  <IconButton
    label={videoStore.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
    disabled={!videoStore.isLoaded}
    onclick={() => videoStore.togglePlayback()}
  >
    {#if videoStore.isPlaying}
      <!-- Pause icon -->
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
      </svg>
    {:else}
      <!-- Play icon -->
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z"/>
      </svg>
    {/if}
  </IconButton>

  <!-- Step forward -->
  <IconButton
    label="Step forward (Right)"
    disabled={!videoStore.isLoaded}
    onclick={() => videoStore.stepForward()}
  >
    <!-- Next frame icon -->
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1L8.5 12zM16 6h2v12h-2V6z"/>
    </svg>
  </IconButton>

  <!-- Timestamp -->
  <span
    class="font-mono text-xs text-textMuted tabular-nums min-w-[7rem] text-center select-none"
    aria-label="Current time"
    aria-live="off"
  >
    {formatTime(videoStore.currentTimeMs)}
    {#if videoStore.durationMs > 0}
      <span class="opacity-50"> / {formatTime(videoStore.durationMs)}</span>
    {/if}
  </span>

  <!-- Scrub bar -->
  <div class="flex-1 flex items-center min-w-0 px-1">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <input
      bind:this={scrubBarEl}
      type="range"
      class="w-full h-1.5 appearance-none cursor-pointer rounded-full bg-surface3 accent-accent disabled:opacity-40 disabled:cursor-not-allowed"
      min={0}
      max={videoStore.durationMs || 100}
      step={videoStore.frameDurationMs || 1}
      value={videoStore.currentTimeMs}
      disabled={!videoStore.isLoaded}
      aria-label="Scrub timeline"
      onpointerdown={onScrubPointerDown}
      onpointermove={onScrubPointerMove}
      onpointerup={onScrubPointerUp}
      onpointercancel={onScrubPointerUp}
    />
  </div>

  <!-- Speed selector -->
  <div class="flex items-center gap-1.5 shrink-0">
    <label class="text-xs text-textMuted sr-only" for="playback-speed">Speed</label>
    <select
      id="playback-speed"
      class="bg-surface2 text-text-base rounded px-2 py-1 text-xs border border-surface3 focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-40 disabled:cursor-not-allowed"
      value={speedValue}
      disabled={!videoStore.isLoaded}
      onchange={onSpeedChange}
      aria-label="Playback speed"
    >
      {#each PLAYBACK_SPEEDS as speed}
        <option value={String(speed)}>{speed}x</option>
      {/each}
    </select>
  </div>

  <!-- Chapter navigation -->
  <IconButton
    label="Previous chapter"
    disabled={!videoStore.isLoaded || !hasChapters}
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6l-8.5 6z"/>
    </svg>
  </IconButton>

  <IconButton
    label="Next chapter"
    disabled={!videoStore.isLoaded || !hasChapters}
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1L8.5 12zM16 6h2v12h-2V6z"/>
    </svg>
  </IconButton>
</div>
