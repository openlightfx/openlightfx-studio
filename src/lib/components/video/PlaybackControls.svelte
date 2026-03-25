<script lang="ts">
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { PLAYBACK_SPEEDS } from '$lib/types/index.js';
  import type { PlaybackSpeed } from '$lib/types/index.js';
  import { IconButton, Tooltip } from '$lib/components/shared/index.js';

  const vs = $derived(videoStore.state);
  const isLoaded = $derived(vs.isLoaded);
  const isPlaying = $derived(vs.isPlaying);
  const currentTimeMs = $derived(vs.currentTimeMs);
  const durationMs = $derived(vs.durationMs);
  const playbackSpeed = $derived(vs.playbackSpeed);
  const progress = $derived(durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0);

  // Chapter markers from project scene markers
  const chapterMarkers = $derived(
    projectStore.sceneMarkers
      .filter((m) => m.type === 'MARKER_CHAPTER')
      .sort((a, b) => a.timestampMs - b.timestampMs)
  );
  const hasChapters = $derived(chapterMarkers.length > 0);

  let scrubBarEl: HTMLDivElement | undefined = $state();
  let isScrubbing = $state(false);

  function togglePlayback() {
    videoStore.togglePlayback();
  }

  function stepBackward() {
    videoStore.stepBackward();
  }

  function stepForward() {
    videoStore.stepForward();
  }

  function previousChapter() {
    if (!hasChapters) return;
    const current = currentTimeMs;
    // Find the last chapter before current time (with 500ms tolerance to go to previous)
    for (let i = chapterMarkers.length - 1; i >= 0; i--) {
      if (chapterMarkers[i].timestampMs < current - 500) {
        videoStore.seek(chapterMarkers[i].timestampMs);
        return;
      }
    }
    // If no previous chapter, seek to start
    videoStore.seek(0);
  }

  function nextChapter() {
    if (!hasChapters) return;
    const current = currentTimeMs;
    for (const marker of chapterMarkers) {
      if (marker.timestampMs > current + 100) {
        videoStore.seek(marker.timestampMs);
        return;
      }
    }
  }

  function handleSpeedChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    videoStore.setSpeed(Number(target.value) as PlaybackSpeed);
  }

  // Scrub bar pointer handling (STU-015)
  function scrubSeek(clientX: number) {
    if (!scrubBarEl || !isLoaded) return;
    const rect = scrubBarEl.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const seekMs = fraction * durationMs;
    videoStore.seek(seekMs);
  }

  function handleScrubPointerDown(e: PointerEvent) {
    if (!isLoaded) return;
    e.preventDefault();
    isScrubbing = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    scrubSeek(e.clientX);
  }

  function handleScrubPointerMove(e: PointerEvent) {
    if (!isScrubbing) return;
    scrubSeek(e.clientX);
  }

  function handleScrubPointerUp(e: PointerEvent) {
    if (!isScrubbing) return;
    isScrubbing = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  function formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.floor(ms % 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }

  const speedOptions = PLAYBACK_SPEEDS.map((s) => ({
    value: String(s),
    label: `${s}x`,
  }));
</script>

<div
  class="flex h-10 w-full items-center gap-2 border-y border-surface2 bg-surface px-3"
  role="toolbar"
  aria-label="Playback controls"
>
  <!-- Previous Chapter -->
  <Tooltip text="Previous chapter">
    <IconButton
      icon="⏪"
      title="Previous chapter"
      disabled={!isLoaded || !hasChapters}
      onclick={previousChapter}
      size="sm"
    />
  </Tooltip>

  <!-- Step Backward -->
  <Tooltip text="Step backward">
    <IconButton
      icon="⏮"
      title="Step backward"
      disabled={!isLoaded}
      onclick={stepBackward}
      size="sm"
    />
  </Tooltip>

  <!-- Play/Pause -->
  <Tooltip text={isPlaying ? 'Pause' : 'Play'}>
    <IconButton
      icon={isPlaying ? '⏸' : '▶'}
      title={isPlaying ? 'Pause' : 'Play'}
      disabled={!isLoaded}
      onclick={togglePlayback}
      size="sm"
    />
  </Tooltip>

  <!-- Step Forward -->
  <Tooltip text="Step forward">
    <IconButton
      icon="⏭"
      title="Step forward"
      disabled={!isLoaded}
      onclick={stepForward}
      size="sm"
    />
  </Tooltip>

  <!-- Next Chapter -->
  <Tooltip text="Next chapter">
    <IconButton
      icon="⏩"
      title="Next chapter"
      disabled={!isLoaded || !hasChapters}
      onclick={nextChapter}
      size="sm"
    />
  </Tooltip>

  <!-- Scrub Bar -->
  <div
    bind:this={scrubBarEl}
    class="relative mx-2 flex h-2 flex-1 cursor-pointer items-center rounded-full bg-surface2"
    role="slider"
    aria-label="Seek bar"
    aria-valuemin={0}
    aria-valuemax={durationMs}
    aria-valuenow={currentTimeMs}
    tabindex={isLoaded ? 0 : -1}
    onpointerdown={handleScrubPointerDown}
    onpointermove={handleScrubPointerMove}
    onpointerup={handleScrubPointerUp}
  >
    <!-- Filled portion -->
    <div
      class="pointer-events-none absolute left-0 top-0 h-full rounded-full bg-accent transition-none"
      style="width: {progress}%;"
    ></div>
    <!-- Thumb -->
    {#if isLoaded}
      <div
        class="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-bg bg-accent shadow-sm"
        style="left: calc({progress}% - 7px);"
      ></div>
    {/if}
  </div>

  <!-- Timestamp -->
  <span class="min-w-[100px] text-right font-mono text-xs tabular-nums text-textMuted">
    {formatTimestamp(currentTimeMs)}
  </span>
  <span class="text-xs text-textMuted">/</span>
  <span class="min-w-[100px] font-mono text-xs tabular-nums text-textMuted">
    {formatTimestamp(durationMs)}
  </span>

  <!-- Speed selector -->
  <select
    value={String(playbackSpeed)}
    onchange={handleSpeedChange}
    disabled={!isLoaded}
    aria-label="Playback speed"
    class="appearance-none rounded border border-surface2 bg-surface2 px-2 py-0.5 text-xs text-text-base transition-colors hover:border-surface3 focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
  >
    {#each speedOptions as opt (opt.value)}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>
</div>
