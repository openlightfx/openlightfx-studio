<script lang="ts">
  let {
    currentTimeMs = 0,
    durationMs = 0,
    isPlaying = false,
    playbackSpeed = 1,
    hasChapters = false,
    onplay,
    onpause,
    onseek,
    onstepforward,
    onstepbackward,
    onprevchapter,
    onnextchapter,
    onspeedchange,
  }: {
    currentTimeMs?: number;
    durationMs?: number;
    isPlaying?: boolean;
    playbackSpeed?: number;
    hasChapters?: boolean;
    onplay?: () => void;
    onpause?: () => void;
    onseek?: (ms: number) => void;
    onstepforward?: () => void;
    onstepbackward?: () => void;
    onprevchapter?: () => void;
    onnextchapter?: () => void;
    onspeedchange?: (speed: number) => void;
  } = $props();

  let scrubBarEl: HTMLDivElement;
  let isScrubbing = $state(false);
  let progress = $derived(durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0);
  let speeds = [0.25, 0.5, 1, 2];

  function formatTime(ms: number): string {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const millis = Math.floor((ms % 1000) / 10);
    if (hours > 0) {
      return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}.${String(millis).padStart(2, '0')}`;
  }

  function handleScrubBarClick(e: MouseEvent) {
    if (!scrubBarEl || durationMs <= 0) return;
    const rect = scrubBarEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onseek?.(ratio * durationMs);
  }

  function handleScrubPointerDown(e: PointerEvent) {
    isScrubbing = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleScrubBarClick(e as unknown as MouseEvent);
  }

  function handleScrubPointerMove(e: PointerEvent) {
    if (!isScrubbing || !scrubBarEl || durationMs <= 0) return;
    const rect = scrubBarEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onseek?.(ratio * durationMs);
  }

  function handleScrubPointerUp() {
    isScrubbing = false;
  }

  function togglePlayPause() {
    if (isPlaying) {
      onpause?.();
    } else {
      onplay?.();
    }
  }

  function cycleSpeed() {
    const idx = speeds.indexOf(playbackSpeed);
    const nextIdx = (idx + 1) % speeds.length;
    onspeedchange?.(speeds[nextIdx]);
  }
</script>

<div class="flex items-center gap-2 h-10 px-3 bg-[var(--surface)] border-y border-[var(--surface2)] select-none">
  <!-- Prev Chapter -->
  <button
    class="btn-icon"
    title="Previous Chapter"
    disabled={!hasChapters}
    onclick={() => onprevchapter?.()}
  >
    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
    </svg>
  </button>

  <!-- Step Back -->
  <button class="btn-icon" title="Step Back 1 Frame" aria-label="Step Back 1 Frame" onclick={() => onstepbackward?.()}>
    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  </button>

  <!-- Play/Pause -->
  <button class="btn-icon" title={isPlaying ? 'Pause' : 'Play'} aria-label={isPlaying ? 'Pause' : 'Play'} onclick={togglePlayPause}>
    {#if isPlaying}
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
    {:else}
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    {/if}
  </button>

  <!-- Step Forward -->
  <button class="btn-icon" title="Step Forward 1 Frame" aria-label="Step Forward 1 Frame" onclick={() => onstepforward?.()}>
    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  </button>

  <!-- Next Chapter -->
  <button
    class="btn-icon"
    title="Next Chapter"
    disabled={!hasChapters}
    onclick={() => onnextchapter?.()}
  >
    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
    </svg>
  </button>

  <!-- Timestamp -->
  <span class="text-xs font-mono text-[var(--text)] min-w-[80px]">
    {formatTime(currentTimeMs)}
  </span>

  <!-- Scrub Bar -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={scrubBarEl}
    class="flex-1 h-2 bg-[var(--surface2)] rounded-full cursor-pointer relative group"
    onpointerdown={handleScrubPointerDown}
    onpointermove={handleScrubPointerMove}
    onpointerup={handleScrubPointerUp}
  >
    <!-- Progress fill -->
    <div
      class="absolute inset-y-0 left-0 bg-accent rounded-full transition-none"
      style="width: {progress}%"
    ></div>
    <!-- Scrub handle -->
    <div
      class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-accent rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
      style="left: calc({progress}% - 6px)"
    ></div>
  </div>

  <!-- Duration -->
  <span class="text-xs font-mono text-[var(--text-muted)] min-w-[80px] text-right">
    {formatTime(durationMs)}
  </span>

  <!-- Speed -->
  <button
    class="btn-ghost text-xs font-mono min-w-[40px] text-center"
    title="Playback Speed"
    onclick={cycleSpeed}
  >
    {playbackSpeed}x
  </button>
</div>
