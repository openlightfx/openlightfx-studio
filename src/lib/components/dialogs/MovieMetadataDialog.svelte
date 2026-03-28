<script lang="ts">
  import { Modal, Button, TextInput } from '$lib/components/shared/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';

  let open = $derived(uiStore.state.activeModal === 'movie-metadata');

  const candidate = $derived(projectStore.project.file.candidateMetadata);
  const metadata = $derived(projectStore.project.file.track.metadata);

  let imdbId = $state('');
  let tmdbId = $state('');
  let title = $state('');
  let year = $state('');
  let description = $state('');

  // Pre-fill form from current metadata + candidate metadata when dialog opens
  $effect(() => {
    if (open) {
      imdbId = metadata.movieReference.imdbId || candidate.imdbId || '';
      tmdbId = '';
      title = metadata.movieReference.title || candidate.title || '';
      year = String(metadata.movieReference.year || candidate.year || '');
      description = metadata.description || '';
    }
  });

  function handleSave() {
    const yearNum = parseInt(year, 10);
    projectStore.updateMetadata({
      description,
      movieReference: {
        ...metadata.movieReference,
        imdbId,
        title,
        year: Number.isFinite(yearNum) ? yearNum : 0,
        runtimeMinutes: metadata.movieReference.runtimeMinutes,
      },
    });
    uiStore.closeModal();
  }

  function handleSkip() {
    uiStore.closeModal();
  }
</script>

<Modal {open} title="Movie Metadata" onclose={handleSkip}>
  <div class="flex flex-col gap-4">
    <TextInput value={title} label="Title" placeholder="Movie title" oninput={(v) => (title = v)} />

    <div class="flex flex-col gap-1.5">
      <TextInput
        value={imdbId}
        label="IMDB ID"
        placeholder="tt1234567"
        oninput={(v) => (imdbId = v)}
      />
      <p class="text-2xs text-textMuted">Format: tt followed by 7+ digits (e.g. tt1234567)</p>
    </div>

    <div class="flex flex-col gap-1.5">
      <TextInput value={tmdbId} label="TMDB ID" placeholder="12345" oninput={(v) => (tmdbId = v)} />
      <p class="text-2xs text-textMuted">
        Find your movie on themoviedb.org and copy the numeric ID from the URL
      </p>
    </div>

    <TextInput
      value={year}
      label="Year"
      placeholder="2024"
      type="number"
      oninput={(v) => (year = v)}
    />

    <div class="flex flex-col gap-1.5">
      <label for="meta-description" class="text-xs font-medium text-textMuted">Description</label>
      <textarea
        id="meta-description"
        bind:value={description}
        placeholder="Brief description of the lighting track"
        rows="3"
        class="w-full rounded-md border border-surface2 bg-surface2 px-3 py-1.5 text-sm text-text-base placeholder-textMuted/50 transition-colors hover:border-surface3 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-bg"
      ></textarea>
    </div>
  </div>

  {#snippet footer()}
    <Button variant="ghost" onclick={handleSkip}>Skip</Button>
    <Button variant="primary" onclick={handleSave}>Save</Button>
  {/snippet}
</Modal>
