<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import ChannelTemplateSelector from './ChannelTemplateSelector.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { newProject } from '$lib/services/project-io.js';
  import type { ChannelTemplate } from '$lib/types/channels.js';

  let {
    isOpen = $bindable(),
  }: {
    isOpen: boolean;
  } = $props();

  let step = $state<1 | 2>(1);
  let selectedTemplate = $state<ChannelTemplate | null>(null);

  function handleSelect(template: ChannelTemplate) {
    selectedTemplate = template;
    step = 2;
  }

  function handleManual() {
    isOpen = false;
    uiStore.openModal('channel-template');
  }

  function handleBack() {
    step = 1;
  }

  function handleCreate() {
    if (!selectedTemplate) return;
    const project = newProject(selectedTemplate.channels);
    projectStore.load(project);
    undoStore.clear();
    isOpen = false;
    uiStore.closeModal();
    // Reset for next open
    step = 1;
    selectedTemplate = null;
  }

  function handleClose() {
    isOpen = false;
    step = 1;
    selectedTemplate = null;
  }
</script>

{#if isOpen}
  <Modal
    title={step === 1 ? 'New Project' : 'Confirm Template'}
    onclose={handleClose}
  >
    {#if step === 1}
      <ChannelTemplateSelector
        bind:selected={selectedTemplate}
        onselect={handleSelect}
        onmanual={handleManual}
      />
    {:else if step === 2 && selectedTemplate}
      <div class="flex flex-col gap-4">
        <div class="rounded-xl border border-surface3 bg-surface2 p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold text-sm text-text-base">{selectedTemplate.name}</span>
            <span class="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">
              {selectedTemplate.channels.length} {selectedTemplate.channels.length === 1 ? 'channel' : 'channels'}
            </span>
          </div>
          <p class="text-xs text-textMuted">{selectedTemplate.description}</p>
          <ul class="flex flex-col gap-1">
            {#each selectedTemplate.channels as ch (ch.id)}
              <li class="flex items-center gap-2 text-xs text-text-base">
                <span class="font-mono text-textMuted">{ch.id}</span>
                <span class="text-surface3">—</span>
                <span>{ch.displayName}</span>
              </li>
            {/each}
          </ul>
        </div>

        <p class="text-xs text-textMuted">
          This will create a new project. Any unsaved changes to the current project will be lost.
        </p>

        <div class="flex gap-2 justify-end pt-1">
          <Button variant="secondary" size="md" onclick={handleBack}>
            Back
          </Button>
          <Button variant="primary" size="md" onclick={handleCreate}>
            Create Project
          </Button>
        </div>
      </div>
    {/if}
  </Modal>
{/if}
