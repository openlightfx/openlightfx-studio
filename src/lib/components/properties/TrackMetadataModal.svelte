<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import TextInput from '$lib/components/shared/TextInput.svelte';
  import Select from '$lib/components/shared/Select.svelte';
  import Slider from '$lib/components/shared/Slider.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { EditMetadataCommand } from '$lib/commands/edit-metadata.js';
  import type { BoundaryBehavior, PreshowState, CreditsBehavior, IntensityRating, SafetyInfo, TrackMetadata } from '$lib/types/track.js';

  let { onclose }: { onclose: () => void } = $props();

  // Load current metadata into local state
  const original = projectStore.getMetadata();

  let title = $state(original.title);
  let description = $state(original.description);
  let author = $state(original.author);
  let tagsRaw = $state(original.tags.join(', '));
  let trackVersion = $state(original.trackVersion);
  let startBehavior = $state<BoundaryBehavior>(original.startBehavior);
  let endBehavior = $state<BoundaryBehavior>(original.endBehavior);
  let preshowDurationMs = $state(original.preshowDurationMs);
  let preshowState = $state<PreshowState>(original.preshowState);
  let creditsStartMs = $state(original.creditsStartMs);
  let creditsBehavior = $state<CreditsBehavior>(original.creditsBehavior);

  const durationMs = original.durationMs;

  const safetyInfo = $derived<SafetyInfo | null>(
    projectStore.file?.track.safetyInfo ?? null
  );

  function formatDuration(ms: number): string {
    if (!ms) return '0:00';
    const totalSec = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  const boundaryOptions: { value: BoundaryBehavior; label: string }[] = [
    { value: 'BOUNDARY_UNSPECIFIED', label: 'Unspecified' },
    { value: 'LEAVE', label: 'Leave (last state)' },
    { value: 'OFF', label: 'Off' },
    { value: 'ON', label: 'On' },
  ];

  const preshowOptions: { value: PreshowState; label: string }[] = [
    { value: 'PRESHOW_UNSPECIFIED', label: 'Unspecified' },
    { value: 'PRESHOW_DIM', label: 'Dim' },
    { value: 'PRESHOW_OFF', label: 'Off' },
    { value: 'PRESHOW_WARM', label: 'Warm' },
  ];

  const creditsOptions: { value: CreditsBehavior; label: string }[] = [
    { value: 'CREDITS_UNSPECIFIED', label: 'Unspecified' },
    { value: 'CREDITS_CONTINUE', label: 'Continue' },
    { value: 'CREDITS_DIM_UP', label: 'Dim Up' },
    { value: 'CREDITS_RAISE', label: 'Raise' },
    { value: 'CREDITS_OFF', label: 'Off' },
  ];

  const intensityColors: Record<IntensityRating, string> = {
    INTENSITY_UNSPECIFIED: 'bg-surface3 text-textMuted',
    SUBTLE: 'bg-success/20 text-success',
    MODERATE: 'bg-warning/20 text-warning',
    INTENSE: 'bg-orange-400/20 text-orange-400',
    EXTREME: 'bg-danger/20 text-danger',
  };

  const intensityLabels: Record<IntensityRating, string> = {
    INTENSITY_UNSPECIFIED: 'Unspecified',
    SUBTLE: 'Subtle',
    MODERATE: 'Moderate',
    INTENSE: 'Intense',
    EXTREME: 'Extreme',
  };

  function handleSave(): void {
    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const patch: Partial<TrackMetadata> = {};

    if (title !== original.title) patch.title = title;
    if (description !== original.description) patch.description = description;
    if (author !== original.author) patch.author = author;
    if (trackVersion !== original.trackVersion) patch.trackVersion = trackVersion;
    if (startBehavior !== original.startBehavior) patch.startBehavior = startBehavior;
    if (endBehavior !== original.endBehavior) patch.endBehavior = endBehavior;
    if (preshowDurationMs !== original.preshowDurationMs) patch.preshowDurationMs = preshowDurationMs;
    if (preshowState !== original.preshowState) patch.preshowState = preshowState;
    if (creditsStartMs !== original.creditsStartMs) patch.creditsStartMs = creditsStartMs;
    if (creditsBehavior !== original.creditsBehavior) patch.creditsBehavior = creditsBehavior;
    if (JSON.stringify(tags) !== JSON.stringify(original.tags)) patch.tags = tags;

    if (Object.keys(patch).length > 0) {
      undoStore.execute(new EditMetadataCommand(patch, projectStore));
    }

    onclose();
  }
</script>

<Modal title="Track Metadata" {onclose}>
  <div class="space-y-5 w-full min-w-[32rem] max-w-2xl max-h-[80vh] overflow-y-auto pr-1">

    <!-- Track Info -->
    <section class="space-y-3">
      <h3 class="text-xs font-semibold text-textMuted uppercase tracking-wider">Track Info</h3>
      <TextInput label="Title" bind:value={title} placeholder="Track title" />
      <div class="flex flex-col gap-1">
        <label for="track-description" class="text-xs text-textMuted">Description</label>
        <textarea
          id="track-description"
          class="bg-surface2 text-text-base rounded-lg px-3 py-2 text-sm border border-surface3 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none min-h-[80px]"
          placeholder="Describe this track…"
          bind:value={description}
        ></textarea>
      </div>
      <TextInput label="Author" bind:value={author} placeholder="Your name or handle" />
      <TextInput label="Tags" bind:value={tagsRaw} placeholder="action, drama, sci-fi" />
      <TextInput label="Version" bind:value={trackVersion} placeholder="1.0.0" />
      <div class="flex flex-col gap-1">
        <span class="text-xs text-textMuted">Duration</span>
        <div class="bg-surface2 text-textMuted rounded-lg px-3 py-2 text-sm border border-surface3 min-h-[44px] flex items-center select-none" aria-label="Track duration" role="status">
          {formatDuration(durationMs)}
        </div>
      </div>
    </section>

    <div class="border-t border-surface3"></div>

    <!-- Boundary Behavior -->
    <section class="space-y-3">
      <h3 class="text-xs font-semibold text-textMuted uppercase tracking-wider">Boundary Behavior</h3>
      <Select label="Start" bind:value={startBehavior} options={boundaryOptions} />
      <Select label="End" bind:value={endBehavior} options={boundaryOptions} />
    </section>

    <div class="border-t border-surface3"></div>

    <!-- Preshow -->
    <section class="space-y-3">
      <h3 class="text-xs font-semibold text-textMuted uppercase tracking-wider">Preshow</h3>
      <Select label="State" bind:value={preshowState} options={preshowOptions} />
      <Slider label="Duration" bind:value={preshowDurationMs} min={0} max={300000} step={1000} unit=" ms" />
    </section>

    <div class="border-t border-surface3"></div>

    <!-- Credits -->
    <section class="space-y-3">
      <h3 class="text-xs font-semibold text-textMuted uppercase tracking-wider">Credits</h3>
      <Select label="Behavior" bind:value={creditsBehavior} options={creditsOptions} />
      <Slider label="Start" bind:value={creditsStartMs} min={0} max={Math.max(durationMs, 3600000)} step={1000} unit=" ms" />
    </section>

    <div class="border-t border-surface3"></div>

    <!-- Safety Info (read-only) -->
    <section class="space-y-3">
      <h3 class="text-xs font-semibold text-textMuted uppercase tracking-wider">Safety Info</h3>
      {#if safetyInfo}
        <div class="flex flex-wrap gap-2">
          <span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full {intensityColors[safetyInfo.intensityRating]}">
            <span class="font-medium">Intensity:</span> {intensityLabels[safetyInfo.intensityRating]}
          </span>
          <span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full {safetyInfo.containsFlashing ? 'bg-warning/20 text-warning' : 'bg-surface3 text-textMuted'}">
            Flashing: {safetyInfo.containsFlashing ? 'Yes' : 'No'}
          </span>
          <span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full {safetyInfo.containsStrobing ? 'bg-danger/20 text-danger' : 'bg-surface3 text-textMuted'}">
            Strobing: {safetyInfo.containsStrobing ? 'Yes' : 'No'}
          </span>
          {#if safetyInfo.maxFlashFrequencyHz > 0}
            <span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface3 text-textMuted">
              Max freq: {safetyInfo.maxFlashFrequencyHz.toFixed(1)} Hz
            </span>
          {/if}
          {#if safetyInfo.maxBrightnessDelta > 0}
            <span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface3 text-textMuted">
              Max &Delta;brightness: {safetyInfo.maxBrightnessDelta.toFixed(2)}
            </span>
          {/if}
        </div>
        {#if safetyInfo.warningText}
          <p class="text-xs text-warning">{safetyInfo.warningText}</p>
        {/if}
      {:else}
        <p class="text-xs text-textMuted">No safety analysis available.</p>
      {/if}
    </section>

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-2 border-t border-surface3">
      <Button variant="ghost" size="sm" onclick={onclose}>Cancel</Button>
      <Button variant="primary" size="sm" onclick={handleSave}>Save</Button>
    </div>

  </div>
</Modal>
