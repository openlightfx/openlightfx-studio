<script lang="ts">
  import { onMount } from 'svelte';
  import Modal from '$lib/components/shared/Modal.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { toastStore } from '$lib/stores/toast.svelte.js';
  import { computeSafetyInfo } from '$lib/services/safety.js';
  import { validateTrack } from '$lib/services/validation.js';
  import { encodeLightFXTrack } from '$lib/services/protobuf.js';
  import type { ValidationResult } from '$lib/services/validation.js';
  import type { SafetyInfo, IntensityRating } from '$lib/types/track.js';

  let { onclose }: { onclose: () => void } = $props();

  let validationResult = $state<ValidationResult | null>(null);
  let safetyInfo = $state<SafetyInfo | null>(null);
  let isExporting = $state(false);

  const DURATION_MISMATCH_THRESHOLD_MS = 5000;

  const intensityColors: Record<IntensityRating, string> = {
    INTENSITY_UNSPECIFIED: 'text-textMuted',
    SUBTLE: 'text-success',
    MODERATE: 'text-warning',
    INTENSE: 'text-orange-400',
    EXTREME: 'text-danger',
  };

  const intensityLabels: Record<IntensityRating, string> = {
    INTENSITY_UNSPECIFIED: 'Unspecified',
    SUBTLE: 'Subtle',
    MODERATE: 'Moderate',
    INTENSE: 'Intense',
    EXTREME: 'Extreme',
  };

  const hasDurationMismatch = $derived((() => {
    if (!projectStore.file || !videoStore.durationMs) return false;
    const trackDuration = projectStore.file.track.metadata.durationMs;
    if (!trackDuration) return false;
    return Math.abs(trackDuration - videoStore.durationMs) > DURATION_MISMATCH_THRESHOLD_MS;
  })());

  const canExport = $derived(
    validationResult !== null && validationResult.errors.length === 0 && !isExporting
  );

  const hasMarketplaceMetadata = $derived((() => {
    if (!projectStore.file) return false;
    const meta = projectStore.file.track.metadata;
    return !!(meta.title && meta.description && meta.author && meta.movieReference?.imdbId);
  })());

  function downloadBlob(data: Uint8Array, filename: string): void {
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExport(): Promise<void> {
    if (!projectStore.file || !canExport) return;
    isExporting = true;
    try {
      // Recompute and embed safety info before encoding
      const track = projectStore.file.track;
      const freshSafety = computeSafetyInfo(track.keyframes, track.effectKeyframes);
      const trackWithSafety = { ...track, safetyInfo: freshSafety };
      const data = await encodeLightFXTrack(trackWithSafety);
      const filename = `${projectStore.displayName}.lightfx`;
      downloadBlob(data, filename);
      toastStore.success(`Exported "${filename}"`);
      onclose();
    } catch (err) {
      toastStore.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isExporting = false;
    }
  }

  onMount(() => {
    if (!projectStore.file) return;
    const track = projectStore.file.track;
    safetyInfo = computeSafetyInfo(track.keyframes, track.effectKeyframes);
    validationResult = validateTrack(track);
  });
</script>

<Modal title="Export Track" {onclose}>
  <div class="space-y-5 min-w-[28rem]">

    {#if validationResult === null}
      <p class="text-sm text-textMuted">Analyzing track…</p>
    {:else}

      <!-- Validation errors -->
      {#if validationResult.errors.length > 0}
        <div class="rounded-lg bg-danger/10 border border-danger/30 p-4 space-y-1.5">
          <p class="text-xs font-semibold text-danger uppercase tracking-wider">Errors — export blocked</p>
          <ul class="space-y-1">
            {#each validationResult.errors as error}
              <li class="flex items-start gap-2 text-sm text-danger">
                <svg class="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                </svg>
                {error}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Validation warnings -->
      {#if validationResult.warnings.length > 0}
        <div class="rounded-lg bg-warning/10 border border-warning/30 p-4 space-y-1.5">
          <p class="text-xs font-semibold text-warning uppercase tracking-wider">Warnings</p>
          <ul class="space-y-1">
            {#each validationResult.warnings as warning}
              <li class="flex items-start gap-2 text-sm text-warning">
                <svg class="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                </svg>
                {warning}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Duration mismatch warning -->
      {#if hasDurationMismatch}
        <div class="rounded-lg bg-warning/10 border border-warning/30 p-4 flex items-start gap-2">
          <svg class="w-4 h-4 mt-0.5 shrink-0 text-warning" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
          <div>
            <p class="text-sm font-medium text-warning">Duration mismatch</p>
            <p class="text-xs text-textMuted mt-0.5">
              Track duration ({Math.round((projectStore.file?.track.metadata.durationMs ?? 0) / 1000)}s) differs significantly from video duration ({Math.round(videoStore.durationMs / 1000)}s).
            </p>
          </div>
        </div>
      {/if}

      <!-- Safety info -->
      {#if safetyInfo}
        <div class="rounded-lg bg-surface2 border border-surface3 p-4 space-y-2">
          <p class="text-xs font-semibold text-textMuted uppercase tracking-wider">Safety Info</p>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <span class="text-textMuted">Intensity rating</span>
            <span class="font-medium {intensityColors[safetyInfo.intensityRating]}">{intensityLabels[safetyInfo.intensityRating]}</span>

            <span class="text-textMuted">Contains flashing</span>
            <span class="{safetyInfo.containsFlashing ? 'text-warning' : 'text-textMuted'}">{safetyInfo.containsFlashing ? 'Yes' : 'No'}</span>

            <span class="text-textMuted">Contains strobing</span>
            <span class="{safetyInfo.containsStrobing ? 'text-danger' : 'text-textMuted'}">{safetyInfo.containsStrobing ? 'Yes' : 'No'}</span>

            {#if safetyInfo.maxFlashFrequencyHz > 0}
              <span class="text-textMuted">Max flash frequency</span>
              <span class="text-text-base">{safetyInfo.maxFlashFrequencyHz.toFixed(1)} Hz</span>
            {/if}
          </div>
          {#if safetyInfo.warningText}
            <p class="text-xs text-warning mt-1">{safetyInfo.warningText}</p>
          {/if}
        </div>
      {/if}

      <!-- All clear -->
      {#if validationResult.errors.length === 0 && validationResult.warnings.length === 0 && !hasDurationMismatch}
        <div class="rounded-lg bg-success/10 border border-success/30 p-4 flex items-center gap-2">
          <svg class="w-4 h-4 shrink-0 text-success" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
          <p class="text-sm text-success">Track is valid and ready to export.</p>
        </div>
      {/if}

    {/if}

    <!-- Actions -->
    <div class="flex items-center justify-between pt-2 border-t border-surface3">
      <div class="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={true}>
          <span class="text-textMuted">Marketplace export</span>
          <span class="ml-2 text-xs bg-surface3 text-textMuted px-1.5 py-0.5 rounded">Coming soon</span>
        </Button>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" onclick={onclose}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!canExport}
          onclick={handleExport}
        >
          {isExporting ? 'Exporting…' : 'Export .lightfx'}
        </Button>
      </div>
    </div>

  </div>
</Modal>
