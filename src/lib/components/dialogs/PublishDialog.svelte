<script lang="ts">
  // TODO: Implement marketplace API integration (STU-100-102)
  import { Modal, Button, Badge } from '$lib/components/shared/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';

  let open = $derived(uiStore.state.activeModal === 'publish');
  const metadata = $derived(projectStore.project.file.track.metadata);

  interface MissingField {
    field: string;
    label: string;
  }

  const missingFields: MissingField[] = $derived.by(() => {
    const fields: MissingField[] = [];
    if (!metadata.title) fields.push({ field: 'title', label: 'Title' });
    if (!metadata.description) fields.push({ field: 'description', label: 'Description' });
    if (!metadata.movieReference.imdbId) fields.push({ field: 'imdbId', label: 'IMDB ID' });
    if (!metadata.tags || metadata.tags.length === 0) fields.push({ field: 'tags', label: 'Tags' });
    return fields;
  });

  function handleClose() {
    uiStore.closeModal();
  }
</script>

<Modal {open} title="Publish to Marketplace" onclose={handleClose}>
  <div class="flex flex-col gap-4">
    <!-- Stub Notice -->
    <div class="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
      Marketplace publishing is not yet available. This feature will be added in a future update.
    </div>

    <!-- Track Info Preview -->
    <div class="rounded-md border border-surface2 bg-surface2/50 p-3">
      <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">Track Info</h3>
      <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <span class="text-textMuted">Title</span>
        <span class="text-text-base">{metadata.title || '(Not set)'}</span>
        <span class="text-textMuted">Author</span>
        <span class="text-text-base">{metadata.author || '(Not set)'}</span>
        <span class="text-textMuted">IMDB ID</span>
        <span class="text-text-base">{metadata.movieReference.imdbId || '(Not set)'}</span>
        <span class="text-textMuted">Tags</span>
        <span class="text-text-base">
          {#if metadata.tags.length > 0}
            <span class="flex flex-wrap gap-1">
              {#each metadata.tags as tag (tag)}
                <Badge text={tag} variant="accent" />
              {/each}
            </span>
          {:else}
            (None)
          {/if}
        </span>
      </div>
    </div>

    <!-- Missing Fields -->
    {#if missingFields.length > 0}
      <div>
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">Required Fields Missing</h3>
        <ul class="flex flex-col gap-1">
          {#each missingFields as { label } (label)}
            <li class="flex items-center gap-2 text-sm text-danger">
              <span>✕</span>
              <span>{label} is required for publishing</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <Button variant="secondary" onclick={handleClose}>Close</Button>
  {/snippet}
</Modal>
