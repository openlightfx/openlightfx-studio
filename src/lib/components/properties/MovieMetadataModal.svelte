<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import TextInput from '$lib/components/shared/TextInput.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { EditMetadataCommand } from '$lib/commands/edit-metadata.js';

  let { onclose }: { onclose: () => void } = $props();

  // Pre-fill from candidateMetadata if available
  const candidate = projectStore.file?.candidateMetadata;

  let imdbId = $state(candidate?.imdbId ?? '');
  let movieTitle = $state(candidate?.title ?? '');
  let yearRaw = $state(candidate?.year ? String(candidate.year) : '');
  let description = $state('');

  let yearError = $state('');

  function validateYear(raw: string): number | null {
    if (!raw.trim()) return null;
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1888 || n > 2100) return null;
    return n;
  }

  function handleSave(): void {
    const year = validateYear(yearRaw);
    if (yearRaw.trim() && year === null) {
      yearError = 'Enter a valid year (e.g. 2023)';
      return;
    }
    yearError = '';

    // 1. Update candidateMetadata directly (not undoable per spec)
    if (projectStore.file) {
      projectStore.file.candidateMetadata = {
        imdbId: imdbId.trim(),
        title: movieTitle.trim(),
        year: year ?? 0,
        durationMs: candidate?.durationMs ?? 0,
      };
      projectStore.markDirty();
    }

    // 2. Update movieReference in track metadata via EditMetadataCommand
    const existingRef = projectStore.getMetadata().movieReference;
    const newRef = {
      imdbId: imdbId.trim(),
      title: movieTitle.trim(),
      year: year ?? existingRef?.year ?? 0,
      runtimeMinutes: existingRef?.runtimeMinutes ?? 0,
    };

    const refChanged =
      newRef.imdbId !== existingRef?.imdbId ||
      newRef.title !== existingRef?.title ||
      newRef.year !== existingRef?.year;

    if (refChanged) {
      undoStore.execute(
        new EditMetadataCommand({ movieReference: newRef }, projectStore)
      );
    }

    onclose();
  }
</script>

<Modal title="Movie Metadata" {onclose}>
  <div class="space-y-4 w-full min-w-[28rem]">

    <p class="text-xs text-textMuted">
      Link this track to a movie. Used for marketplace metadata and export validation.
    </p>

    <TextInput label="IMDB ID" bind:value={imdbId} placeholder="tt0133093" />
    <TextInput label="Title" bind:value={movieTitle} placeholder="The Matrix" />
    <TextInput
      label="Year"
      bind:value={yearRaw}
      placeholder="1999"
      error={yearError}
    />

    <div class="flex flex-col gap-1">
      <label for="movie-description" class="text-xs text-textMuted">Description</label>
      <textarea
        id="movie-description"
        class="bg-surface2 text-text-base rounded-lg px-3 py-2 text-sm border border-surface3 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none min-h-[72px]"
        placeholder="Optional notes about this movie reference…"
        bind:value={description}
      ></textarea>
    </div>

    {#if candidate?.durationMs}
      <div class="rounded-lg bg-surface2 border border-surface3 p-3 text-xs text-textMuted">
        Detected duration: {Math.round(candidate.durationMs / 60000)} min
      </div>
    {/if}

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-2 border-t border-surface3">
      <Button variant="ghost" size="sm" onclick={onclose}>Cancel</Button>
      <Button variant="primary" size="sm" onclick={handleSave}>Save</Button>
    </div>

  </div>
</Modal>
