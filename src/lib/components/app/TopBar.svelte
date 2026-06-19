<script lang="ts">
  import Button from '$lib/components/shared/Button.svelte';
  import IconButton from '$lib/components/shared/IconButton.svelte';
  import { undoStore } from '$lib/stores/undo.svelte.js';

  let {
    projectName,
    isDirty,
    saveProviderName = 'Local',
    onrename,
    onnewproject,
    onopen,
    onsave,
    onexport,
    oncommandpalette,
  }: {
    projectName: string;
    isDirty: boolean;
    saveProviderName?: string;
    onrename?: (name: string) => void;
    onnewproject?: () => void;
    onopen?: () => void;
    onsave?: () => void;
    onexport?: () => void;
    oncommandpalette?: () => void;
  } = $props();

  let isEditingName = $state(false);
  let editValue = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (isEditingName && inputEl) {
      inputEl.focus();
      inputEl.select();
    }
  });

  function startEditing() {
    editValue = projectName;
    isEditingName = true;
  }

  function commitEdit() {
    isEditingName = false;
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== projectName) {
      onrename?.(trimmed);
    }
  }

  function cancelEdit() {
    isEditingName = false;
    editValue = projectName;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') cancelEdit();
  }
</script>

<header
  class="flex items-center gap-2 px-3 h-12 bg-surface border-b border-surface3 flex-shrink-0 select-none"
>
  <!-- Logo -->
  <a href="/" class="flex items-center gap-2 mr-1 flex-shrink-0" aria-label="OpenLightFX Studio">
    <img src="/logo.svg" alt="OpenLightFX" class="w-7 h-7" />
  </a>

  <!-- Project name (inline editable) -->
  <div class="flex items-center gap-1.5 min-w-0 flex-1">
    {#if isEditingName}
      <input
        bind:this={inputEl}
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={onKeydown}
        class="bg-surface2 text-text-base text-sm font-medium rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent/50 min-w-0 w-48 max-w-xs"
        type="text"
        aria-label="Project name"
      />
    {:else}
      <button
        class="text-text-base text-sm font-medium hover:text-accent transition-colors truncate max-w-xs px-1 py-0.5 rounded hover:bg-surface2"
        onclick={startEditing}
        title="Click to rename project"
      >
        {projectName}
      </button>
    {/if}

    <!-- Save status indicator -->
    <span
      class="flex-shrink-0 w-2 h-2 rounded-full transition-colors"
      class:bg-warning={isDirty}
      class:bg-success={!isDirty}
      title={isDirty ? 'Unsaved changes' : 'Saved'}
      aria-label={isDirty ? 'Unsaved changes' : 'All changes saved'}
    ></span>
  </div>

  <!-- Toolbar actions -->
  <div class="flex items-center gap-0.5">
    <IconButton label="New project" onclick={onnewproject}>
      <!-- New icon -->
      <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 1H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6L9 1z" />
        <path d="M9 1v5h5M8 10V7m-1.5 1.5h3" stroke-linecap="round" />
      </svg>
    </IconButton>

    <IconButton label="Open project" onclick={onopen}>
      <!-- Folder open icon -->
      <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M1 4a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z" />
      </svg>
    </IconButton>

    <IconButton label="Save project" onclick={onsave}>
      <!-- Save icon -->
      <svg class="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M11 1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4l-4-3z" />
        <path d="M4 1v4h6V1M4 15v-5h8v5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </IconButton>

    <IconButton label="Undo" onclick={() => undoStore.undo()} disabled={!undoStore.canUndo}>
      <svg
        class="w-4 h-4"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M3 7h7a3 3 0 0 1 0 6H9" />
        <path d="M6 4 3 7l3 3" />
      </svg>
    </IconButton>

    <IconButton label="Redo" onclick={() => undoStore.redo()} disabled={!undoStore.canRedo}>
      <svg
        class="w-4 h-4"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M13 7H6a3 3 0 0 0 0 6h1" />
        <path d="M10 4l3 3-3 3" />
      </svg>
    </IconButton>

    <div class="w-px h-6 bg-surface3 mx-1 flex-shrink-0"></div>

    <Button variant="primary" size="sm" onclick={onexport}>Export</Button>

    <div class="w-px h-6 bg-surface3 mx-1 flex-shrink-0"></div>

    <!-- Command palette trigger -->
    <button
      class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-textMuted hover:text-text-base text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
      onclick={oncommandpalette}
      title="Open command palette"
      aria-label="Open command palette (Cmd+K)"
    >
      <svg
        class="w-3.5 h-3.5"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <circle cx="7" cy="7" r="5" />
        <path d="m13 13-2.5-2.5" stroke-linecap="round" />
      </svg>
      <span>Search</span>
      <kbd
        class="hidden sm:inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-surface3 text-textMuted text-xs font-mono"
        >⌘K</kbd
      >
    </button>
  </div>
</header>
