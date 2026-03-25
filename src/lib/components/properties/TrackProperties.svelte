<script lang="ts">
  import type {
    TrackMetadata,
    BoundaryBehavior,
    PreshowState,
    CreditsBehavior,
    SafetyInfo,
    IntensityRating,
  } from '$lib/types/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { computeSafetyInfo } from '$lib/services/safety.js';
  import { TextInput, Select, Slider, Button, Badge } from '$lib/components/shared/index.js';

  const metadata = $derived(projectStore.project.file.track.metadata);
  const track = $derived(projectStore.project.file.track);

  const safetyInfo: SafetyInfo = $derived(computeSafetyInfo(track));

  // Tag input state
  let tagInput = $state('');

  // Collapsible sections
  let showBehavior = $state(true);
  let showSafety = $state(true);

  function update(updates: Partial<TrackMetadata>) {
    projectStore.updateMetadata(updates);
  }

  // --- Field handlers ---
  function handleTitle(value: string) { update({ title: value }); }
  function handleDescription(value: string) { update({ description: value }); }
  function handleAuthor(value: string) { update({ author: value }); }
  function handleTrackVersion(value: string) { update({ trackVersion: value }); }

  function handleImdbId(value: string) {
    update({
      movieReference: { ...metadata.movieReference, imdbId: value },
    });
  }

  function handleStartBehavior(value: string) {
    update({ startBehavior: value as BoundaryBehavior });
  }

  function handleEndBehavior(value: string) {
    update({ endBehavior: value as BoundaryBehavior });
  }

  function handlePreshowState(value: string) {
    update({ preshowState: value as PreshowState });
  }

  function handlePreshowDuration(value: string) {
    const ms = parseInt(value, 10);
    if (!Number.isNaN(ms) && ms >= 0) {
      update({ preshowDurationMs: ms });
    }
  }

  function handleCreditsStart(value: string) {
    const ms = parseInt(value, 10);
    if (!Number.isNaN(ms) && ms >= 0) {
      update({ creditsStartMs: ms });
    }
  }

  function handleCreditsBehavior(value: string) {
    update({ creditsBehavior: value as CreditsBehavior });
  }

  // --- Tag management ---
  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  }

  function addTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !metadata.tags.includes(trimmed)) {
      update({ tags: [...metadata.tags, trimmed] });
    }
    tagInput = '';
  }

  function removeTag(tag: string) {
    update({ tags: metadata.tags.filter((t: string) => t !== tag) });
  }

  function handleOpenMovieMetadata() {
    uiStore.openModal('movie-metadata');
  }

  // --- Safety info helpers ---
  const INTENSITY_BADGE_VARIANT: Record<IntensityRating, 'success' | 'warning' | 'danger' | 'default'> = {
    INTENSITY_UNSPECIFIED: 'default',
    SUBTLE: 'success',
    MODERATE: 'warning',
    INTENSE: 'danger',
    EXTREME: 'danger',
  };

  const INTENSITY_LABELS: Record<IntensityRating, string> = {
    INTENSITY_UNSPECIFIED: 'Unspecified',
    SUBTLE: 'Subtle',
    MODERATE: 'Moderate',
    INTENSE: 'Intense',
    EXTREME: 'Extreme',
  };

  // --- Select options ---
  const boundaryOptions: { value: string; label: string }[] = [
    { value: 'BOUNDARY_UNSPECIFIED', label: 'Unspecified' },
    { value: 'LEAVE', label: 'Leave' },
    { value: 'OFF', label: 'Off' },
    { value: 'ON', label: 'On' },
  ];

  const preshowOptions: { value: string; label: string }[] = [
    { value: 'PRESHOW_UNSPECIFIED', label: 'Unspecified' },
    { value: 'PRESHOW_DIM', label: 'Dim' },
    { value: 'PRESHOW_OFF', label: 'Off' },
    { value: 'PRESHOW_WARM', label: 'Warm' },
  ];

  const creditsOptions: { value: string; label: string }[] = [
    { value: 'CREDITS_UNSPECIFIED', label: 'Unspecified' },
    { value: 'CREDITS_CONTINUE', label: 'Continue' },
    { value: 'CREDITS_DIM_UP', label: 'Dim Up' },
    { value: 'CREDITS_RAISE', label: 'Raise' },
    { value: 'CREDITS_OFF', label: 'Off' },
  ];
</script>

<div class="flex flex-col gap-4">
  <!-- Basic Metadata -->
  <section class="flex flex-col gap-3">
    <TextInput value={metadata.title} label="Title" placeholder="Track title" oninput={handleTitle} />
    <TextInput value={metadata.description} label="Description" placeholder="Track description" oninput={handleDescription} />
    <TextInput value={metadata.author} label="Author" placeholder="Author name" oninput={handleAuthor} />
    <TextInput value={metadata.trackVersion} label="Version" placeholder="1.0.0" oninput={handleTrackVersion} />
    <TextInput
      value={metadata.movieReference.imdbId}
      label="IMDB ID"
      placeholder="tt1234567"
      oninput={handleImdbId}
    />
  </section>

  <hr class="border-surface2" />

  <!-- Tags -->
  <section class="flex flex-col gap-2">
    <span class="text-xs font-medium text-textMuted">Tags</span>
    <div class="flex flex-wrap gap-1.5">
      {#each metadata.tags as tag (tag)}
        <span class="inline-flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-xs text-text-base">
          {tag}
          <button
            onclick={() => removeTag(tag)}
            class="ml-0.5 rounded-full p-0.5 text-textMuted hover:bg-surface3 hover:text-text-base"
            title="Remove tag"
            aria-label="Remove tag {tag}"
          >
            <svg class="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </span>
      {/each}
    </div>
    <div class="flex gap-2">
      <input
        type="text"
        bind:value={tagInput}
        onkeydown={handleTagKeydown}
        placeholder="Add tag..."
        class="min-w-0 flex-1 rounded-md border border-surface2 bg-surface2 px-3 py-1.5 text-sm text-text-base placeholder-textMuted/50 transition-colors hover:border-surface3 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-bg"
      />
      <Button variant="secondary" size="sm" onclick={addTag}>Add</Button>
    </div>
  </section>

  <hr class="border-surface2" />

  <!-- Behavior Settings -->
  <section class="flex flex-col gap-3">
    <button
      class="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-textMuted"
      onclick={() => (showBehavior = !showBehavior)}
      aria-expanded={showBehavior}
    >
      Playback Behavior
      <svg
        class="h-3.5 w-3.5 transition-transform {showBehavior ? 'rotate-180' : ''}"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
      </svg>
    </button>

    {#if showBehavior}
      <Select value={metadata.startBehavior} options={boundaryOptions} label="Start Behavior" onchange={handleStartBehavior} />
      <Select value={metadata.endBehavior} options={boundaryOptions} label="End Behavior" onchange={handleEndBehavior} />
      <Select value={metadata.preshowState} options={preshowOptions} label="Preshow State" onchange={handlePreshowState} />

      <TextInput
        value={String(metadata.preshowDurationMs)}
        label="Preshow Duration (ms)"
        type="number"
        placeholder="0"
        oninput={handlePreshowDuration}
      />

      <TextInput
        value={String(metadata.creditsStartMs)}
        label="Credits Start (ms)"
        type="number"
        placeholder="0"
        oninput={handleCreditsStart}
      />

      <Select value={metadata.creditsBehavior} options={creditsOptions} label="Credits Behavior" onchange={handleCreditsBehavior} />
    {/if}
  </section>

  <hr class="border-surface2" />

  <!-- Movie Metadata Button -->
  <Button variant="secondary" size="sm" onclick={handleOpenMovieMetadata}>
    Movie Metadata…
  </Button>

  <hr class="border-surface2" />

  <!-- Safety Info (read-only) -->
  <section class="flex flex-col gap-3">
    <button
      class="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-textMuted"
      onclick={() => (showSafety = !showSafety)}
      aria-expanded={showSafety}
    >
      Safety Info
      <svg
        class="h-3.5 w-3.5 transition-transform {showSafety ? 'rotate-180' : ''}"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
      </svg>
    </button>

    {#if showSafety}
      <div class="flex flex-col gap-2.5 rounded-md border border-surface2 bg-surface2/30 p-3">
        <div class="flex items-center justify-between">
          <span class="text-xs text-textMuted">Intensity Rating</span>
          <Badge
            text={INTENSITY_LABELS[safetyInfo.intensityRating]}
            variant={INTENSITY_BADGE_VARIANT[safetyInfo.intensityRating]}
          />
        </div>

        <div class="flex items-center justify-between">
          <span class="text-xs text-textMuted">Contains Flashing</span>
          <span class="text-xs font-medium {safetyInfo.containsFlashing ? 'text-warning' : 'text-success'}">
            {safetyInfo.containsFlashing ? 'Yes' : 'No'}
          </span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-xs text-textMuted">Contains Strobing</span>
          <span class="text-xs font-medium {safetyInfo.containsStrobing ? 'text-danger' : 'text-success'}">
            {safetyInfo.containsStrobing ? 'Yes' : 'No'}
          </span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-xs text-textMuted">Max Flash Frequency</span>
          <span class="text-xs font-mono text-text-base">{safetyInfo.maxFlashFrequencyHz.toFixed(1)} Hz</span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-xs text-textMuted">Max Brightness Delta</span>
          <span class="text-xs font-mono text-text-base">{safetyInfo.maxBrightnessDelta}</span>
        </div>
      </div>
    {/if}
  </section>
</div>
