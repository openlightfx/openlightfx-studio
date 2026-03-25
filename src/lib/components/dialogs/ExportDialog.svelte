<script lang="ts">
  import { Modal, Button, Badge, Spinner } from '$lib/components/shared/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { validateTrack, type ValidationResult, type ValidationIssue } from '$lib/services/validation.js';
  import { exportLightFXTrack } from '$lib/services/project-io.js';
  import { saveProjectFile } from '$lib/services/project-io.js';
  import { computeSafetyInfo } from '$lib/services/safety.js';

  let open = $derived(uiStore.state.activeModal === 'export');

  const track = $derived(projectStore.project.file.track);
  const metadata = $derived(track.metadata);
  const channelGroups = $derived(projectStore.channelGroups);
  const sceneMarkers = $derived(projectStore.sceneMarkers);

  let validationResult = $state<ValidationResult | null>(null);
  let exporting = $state(false);
  let exportError = $state('');

  // Run validation when dialog opens
  $effect(() => {
    if (open) {
      // Sort keyframes before validation (users may add keyframes out of order)
      const sorted = {
        ...track,
        keyframes: [...track.keyframes].sort((a, b) =>
          a.channelId === b.channelId
            ? a.timestampMs - b.timestampMs
            : a.channelId.localeCompare(b.channelId),
        ),
        effectKeyframes: [...track.effectKeyframes].sort((a, b) =>
          a.channelId === b.channelId
            ? a.timestampMs - b.timestampMs
            : a.channelId.localeCompare(b.channelId),
        ),
        safetyInfo: computeSafetyInfo(track),
      };
      validationResult = validateTrack(sorted);
      exportError = '';
      exporting = false;
    }
  });

  const errors: ValidationIssue[] = $derived(
    validationResult !== null ? validationResult.issues.filter((i) => i.severity === 'error') : []
  );
  const warnings: ValidationIssue[] = $derived(
    validationResult !== null ? validationResult.issues.filter((i) => i.severity === 'warning') : []
  );
  const hasErrors = $derived(errors.length > 0);

  const totalKeyframes = $derived(track.keyframes.length + track.effectKeyframes.length);

  function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }

  const durationMismatch = $derived(
    videoStore.state.isLoaded &&
    metadata.durationMs > 0 &&
    Math.abs(metadata.durationMs - videoStore.state.durationMs) > 5000
  );

  const missingMetadata = $derived(
    !metadata.movieReference.imdbId ||
    !metadata.movieReference.title ||
    !metadata.description
  );

  async function handleExportLightFX() {
    exporting = true;
    exportError = '';
    try {
      const bytes = exportLightFXTrack(track, channelGroups, sceneMarkers);
      const blob = new Blob(
        [(bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)],
        { type: 'application/octet-stream' },
      );
      const fileName =
        (metadata.title || 'untitled').replace(/[^a-zA-Z0-9 _\-()]/g, '').replace(/\s+/g, '_') +
        '.lightfx';
      triggerDownload(blob, fileName);
      uiStore.closeModal();
    } catch (err: unknown) {
      exportError = err instanceof Error ? err.message : 'Export failed';
    } finally {
      exporting = false;
    }
  }

  async function handleExportProject() {
    exporting = true;
    exportError = '';
    try {
      await saveProjectFile(projectStore.project.file);
      projectStore.markClean();
      uiStore.closeModal();
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled picker
      } else {
        exportError = err instanceof Error ? err.message : 'Save failed';
      }
    } finally {
      exporting = false;
    }
  }

  function handleOpenMetadata() {
    uiStore.openModal('movie-metadata');
  }

  function handleClose() {
    uiStore.closeModal();
  }

  function triggerDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
</script>

<Modal {open} title="Export Track" onclose={handleClose} size="lg">
  <div class="flex flex-col gap-4">
    <!-- Track Summary -->
    <div class="rounded-md border border-surface2 bg-surface2/50 p-3">
      <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">Track Summary</h3>
      <div class="grid grid-cols-2 gap-y-1.5 text-sm">
        <span class="text-textMuted">Title</span>
        <span class="text-text-base">{metadata.title || '(Untitled)'}</span>
        <span class="text-textMuted">Channels</span>
        <span class="text-text-base">{track.channels.length}</span>
        <span class="text-textMuted">Keyframes</span>
        <span class="text-text-base">{totalKeyframes}</span>
        <span class="text-textMuted">Duration</span>
        <span class="text-text-base">{metadata.durationMs > 0 ? formatDuration(metadata.durationMs) : 'Not set'}</span>
      </div>
    </div>

    <!-- Duration Mismatch Warning -->
    {#if durationMismatch}
      <div class="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
        ⚠ Track duration differs from video duration by more than 5 seconds.
      </div>
    {/if}

    <!-- Missing Metadata Prompt -->
    {#if missingMetadata}
      <div class="flex items-center justify-between rounded-md border border-accent/30 bg-accent/10 px-3 py-2">
        <span class="text-sm text-accent">Movie metadata is incomplete.</span>
        <Button variant="ghost" size="sm" onclick={handleOpenMetadata}>Edit Metadata</Button>
      </div>
    {/if}

    <!-- Validation Results -->
    {#if validationResult}
      <div>
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">Validation</h3>
        {#if errors.length === 0 && warnings.length === 0}
          <p class="text-sm text-success">✓ All validation checks passed</p>
        {:else}
          <ul class="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {#each errors as issue (issue.ruleId + issue.message)}
              <li class="flex items-start gap-2 text-sm text-danger">
                <Badge text={issue.ruleId} variant="danger" />
                <span>{issue.message}</span>
              </li>
            {/each}
            {#each warnings as issue (issue.ruleId + issue.message)}
              <li class="flex items-start gap-2 text-sm text-warning">
                <Badge text={issue.ruleId} variant="warning" />
                <span>{issue.message}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    <!-- Export Error -->
    {#if exportError}
      <div class="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
        {exportError}
      </div>
    {/if}
  </div>

  {#snippet footer()}
    {#if exporting}
      <Spinner size="sm" />
    {/if}
    <Button variant="ghost" onclick={handleClose}>Cancel</Button>
    <Button variant="secondary" onclick={handleExportProject} disabled={exporting}>
      Export Project (.lightfx-project)
    </Button>
    <Button variant="primary" onclick={handleExportLightFX} disabled={hasErrors || exporting}>
      Export .lightfx
    </Button>
  {/snippet}
</Modal>
