<script lang="ts">
  import type { ChannelTemplate, ChannelTemplateEntry } from '$lib/types/index.js';
  import { CHANNEL_TEMPLATES } from '$lib/types/index.js';
  import { Modal, Button, Badge } from '$lib/components/shared/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';

  let {
    open,
    onclose,
  }: {
    open: boolean;
    onclose: () => void;
  } = $props();

  let selectedTemplate = $state<ChannelTemplate | null>(null);

  const existingIds = $derived(new Set(projectStore.channels.map((ch) => ch.id)));

  const conflicts = $derived.by(() => {
    if (!selectedTemplate) return [];
    return selectedTemplate.channels.filter((ch) => existingIds.has(ch.id));
  });

  const channelsToCreate = $derived.by(() => {
    if (!selectedTemplate) return [];
    return selectedTemplate.channels.filter((ch) => !existingIds.has(ch.id));
  });

  function spatialLabel(hint: string): string {
    return hint
      .replace('SPATIAL_', '')
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
  }

  function handleCreate() {
    if (!selectedTemplate) return;
    for (const entry of channelsToCreate) {
      projectStore.addChannel({
        id: entry.id,
        displayName: entry.displayName,
        spatialHint: entry.spatialHint,
      });
    }
    selectedTemplate = null;
    onclose();
  }

  function handleClose() {
    selectedTemplate = null;
    onclose();
  }

  function handleBack() {
    selectedTemplate = null;
  }
</script>

<Modal open={open} title="Create from Template" onclose={handleClose} size="lg">
  {#if selectedTemplate === null}
    <!-- Template selection list -->
    <div class="flex flex-col gap-2">
      {#each CHANNEL_TEMPLATES as template (template.name)}
        <button
          class="flex flex-col gap-1.5 rounded-lg border border-surface2 px-4 py-3 text-left transition-colors hover:border-accent hover:bg-surface2/50"
          onclick={() => (selectedTemplate = template)}
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-text-base">{template.name}</span>
            <Badge text="{template.channels.length} ch" />
          </div>
          <p class="text-xs text-textMuted">{template.description}</p>
          <div class="mt-1 flex flex-wrap gap-1.5">
            {#each template.channels as ch (ch.id)}
              <span class="inline-flex items-center gap-1 rounded bg-surface2 px-2 py-0.5 text-2xs text-textMuted">
                <code>{ch.id}</code>
                <span class="text-textMuted/60">({spatialLabel(ch.spatialHint)})</span>
              </span>
            {/each}
          </div>
        </button>
      {/each}
    </div>

    {#snippet footer()}
      <Button variant="ghost" onclick={handleClose}>Cancel</Button>
    {/snippet}
  {:else}
    <!-- Confirmation view -->
    <div class="flex flex-col gap-3">
      <p class="text-sm text-text-base">
        Template <strong>{selectedTemplate.name}</strong> will create the following channels:
      </p>

      <div class="flex flex-col gap-1 rounded-lg border border-surface2 bg-surface2/30 p-3">
        {#each selectedTemplate.channels as ch (ch.id)}
          {@const isConflict = existingIds.has(ch.id)}
          <div class="flex items-center gap-2 py-1 text-sm {isConflict ? 'opacity-50' : ''}">
            {#if isConflict}
              <span class="text-warning" title="Already exists — will be skipped">⚠</span>
            {:else}
              <span class="text-success">✓</span>
            {/if}
            <code class="text-xs text-textMuted">{ch.id}</code>
            <span class="text-text-base">{ch.displayName}</span>
            <Badge text={spatialLabel(ch.spatialHint)} />
            {#if isConflict}
              <span class="text-2xs text-warning">(exists — skip)</span>
            {/if}
          </div>
        {/each}
      </div>

      {#if conflicts.length > 0}
        <p class="text-xs text-warning">
          {conflicts.length} channel{conflicts.length > 1 ? 's' : ''} already exist{conflicts.length === 1 ? 's' : ''} and will be skipped.
        </p>
      {/if}

      {#if channelsToCreate.length === 0}
        <p class="text-xs text-danger">All channels in this template already exist.</p>
      {/if}
    </div>

    {#snippet footer()}
      <Button variant="ghost" onclick={handleBack}>Back</Button>
      <Button variant="ghost" onclick={handleClose}>Cancel</Button>
      <Button variant="primary" disabled={channelsToCreate.length === 0} onclick={handleCreate}>
        Create {channelsToCreate.length} Channel{channelsToCreate.length !== 1 ? 's' : ''}
      </Button>
    {/snippet}
  {/if}
</Modal>
