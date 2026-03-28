<script lang="ts">
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import type { ShortcutCategory } from '$lib/types/ui.js';

  // ── Props ────────────────────────────────────────────────────────────────────
  let { isOpen = $bindable(false) }: { isOpen: boolean } = $props();

  // ── Types ────────────────────────────────────────────────────────────────────
  interface Command {
    id: string;
    label: string;
    keys: string;
    category: ShortcutCategory | 'file' | 'view';
    action: () => void;
  }

  // ── Command registry ─────────────────────────────────────────────────────────
  // Defined as a $derived so actions always close over fresh store state.
  const commands: Command[] = [
    // File
    {
      id: 'file.new',
      label: 'New Project',
      keys: 'Ctrl+N',
      category: 'file',
      action: () => { uiStore.openModal('new-project'); close(); },
    },
    {
      id: 'file.export',
      label: 'Export',
      keys: 'Ctrl+E',
      category: 'file',
      action: () => { uiStore.openModal('export'); close(); },
    },
    {
      id: 'file.movie-metadata',
      label: 'Movie Metadata',
      keys: '',
      category: 'file',
      action: () => { uiStore.openModal('movie-metadata'); close(); },
    },
    // Edit
    {
      id: 'edit.undo',
      label: 'Undo',
      keys: 'Ctrl+Z',
      category: 'edit',
      action: () => { undoStore.undo(); close(); },
    },
    {
      id: 'edit.redo',
      label: 'Redo',
      keys: 'Ctrl+Shift+Z',
      category: 'edit',
      action: () => { undoStore.redo(); close(); },
    },
    {
      id: 'edit.deselect',
      label: 'Deselect All',
      keys: 'Escape',
      category: 'edit',
      action: () => { timelineStore.clearSelection(); close(); },
    },
    // Playback
    {
      id: 'playback.toggle',
      label: 'Play / Pause',
      keys: 'Space',
      category: 'playback',
      action: () => { videoStore.togglePlayback(); close(); },
    },
    {
      id: 'playback.step-forward',
      label: 'Step Forward',
      keys: '→',
      category: 'playback',
      action: () => { videoStore.stepForward(); close(); },
    },
    {
      id: 'playback.step-backward',
      label: 'Step Backward',
      keys: '←',
      category: 'playback',
      action: () => { videoStore.stepBackward(); close(); },
    },
    // Timeline
    {
      id: 'timeline.zoom-in',
      label: 'Zoom In',
      keys: '+',
      category: 'timeline',
      action: () => { timelineStore.zoom(1.5); close(); },
    },
    {
      id: 'timeline.zoom-out',
      label: 'Zoom Out',
      keys: '-',
      category: 'timeline',
      action: () => { timelineStore.zoom(1 / 1.5); close(); },
    },
    {
      id: 'timeline.zoom-fit',
      label: 'Zoom to Fit',
      keys: 'Ctrl+0',
      category: 'timeline',
      action: () => {
        if (videoStore.durationMs > 0) timelineStore.zoomToFit(videoStore.durationMs);
        close();
      },
    },
    // View
    {
      id: 'view.toggle-overlay',
      label: 'Toggle Overlay',
      keys: 'O',
      category: 'view',
      action: () => { uiStore.toggleOverlay(); close(); },
    },
    {
      id: 'view.toggle-snapping',
      label: 'Toggle Snapping',
      keys: 'S',
      category: 'view',
      action: () => { uiStore.toggleSnapping(); close(); },
    },
    {
      id: 'view.keyboard-shortcuts',
      label: 'Keyboard Shortcuts',
      keys: '?',
      category: 'view',
      action: () => { uiStore.openModal('keyboard-shortcuts'); close(); },
    },
    {
      id: 'view.about',
      label: 'About',
      keys: '',
      category: 'view',
      action: () => { uiStore.openModal('about'); close(); },
    },
    // Channels
    {
      id: 'channels.add',
      label: 'Add Channel from Template',
      keys: '',
      category: 'keyframe',
      action: () => { uiStore.openModal('channel-template'); close(); },
    },
    {
      id: 'channels.publish',
      label: 'Publish',
      keys: '',
      category: 'file',
      action: () => { uiStore.openModal('publish'); close(); },
    },
  ];

  // ── State ────────────────────────────────────────────────────────────────────
  let query = $state('');
  let activeIndex = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);

  // ── Filtered results ─────────────────────────────────────────────────────────
  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const results = q
      ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
      : commands;
    return results.slice(0, 10);
  });

  // Reset active index whenever the filtered list changes
  $effect(() => {
    // reading filtered.length triggers re-run when the list changes
    filtered.length; // eslint-disable-line @typescript-eslint/no-unused-expressions
    activeIndex = 0;
  });

  // Auto-focus input when palette opens; reset query on close
  $effect(() => {
    if (isOpen) {
      query = '';
      activeIndex = 0;
      // defer to next microtask so the element is mounted
      Promise.resolve().then(() => inputEl?.focus());
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function close() {
    isOpen = false;
  }

  function execute(index: number) {
    const cmd = filtered[index];
    if (cmd) cmd.action();
  }

  function onKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        activeIndex = (activeIndex + 1) % Math.max(1, filtered.length);
        scrollItemIntoView(activeIndex);
        break;
      case 'ArrowUp':
        e.preventDefault();
        activeIndex = (activeIndex - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length);
        scrollItemIntoView(activeIndex);
        break;
      case 'Enter':
        e.preventDefault();
        execute(activeIndex);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  }

  let listEl = $state<HTMLUListElement | null>(null);

  function scrollItemIntoView(index: number) {
    const item = listEl?.children[index] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }

  // Category display labels
  const CATEGORY_LABELS: Record<string, string> = {
    file: 'File',
    edit: 'Edit',
    playback: 'Playback',
    timeline: 'Timeline',
    keyframe: 'Channels',
    view: 'View',
  };
</script>

<!-- Global Cmd/Ctrl+K listener to toggle palette open -->
<svelte:window
  onkeydown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      isOpen = !isOpen;
    }
  }}
/>

{#if isOpen}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
    onclick={close}
  >
    <!-- Palette panel — stop click propagation so backdrop doesn't catch it -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="relative mx-auto mt-16 w-full max-w-[600px] px-4"
      onclick={(e) => e.stopPropagation()}
    >
      <div
        class="bg-surface rounded-xl shadow-2xl border border-surface3 overflow-hidden animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <!-- Search input -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-surface3">
          <!-- Search icon -->
          <svg
            class="w-4 h-4 text-textMuted flex-shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="5" />
            <path d="m13 13-2.5-2.5" stroke-linecap="round" />
          </svg>

          <input
            bind:this={inputEl}
            bind:value={query}
            onkeydown={onKeydown}
            type="text"
            placeholder="Search commands…"
            autocomplete="off"
            spellcheck="false"
            class="flex-1 bg-transparent text-text-base text-sm placeholder:text-textMuted focus:outline-none"
            aria-label="Search commands"
            aria-controls="command-palette-list"
            aria-activedescendant={filtered.length > 0 ? `cmd-item-${activeIndex}` : undefined}
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
          />

          <kbd
            class="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-surface2 text-textMuted text-xs font-mono border border-surface3 flex-shrink-0"
          >Esc</kbd>
        </div>

        <!-- Results list -->
        <ul
          bind:this={listEl}
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          class="max-h-[360px] overflow-y-auto py-1"
        >
          {#if filtered.length === 0}
            <li class="px-4 py-8 text-center text-textMuted text-sm">
              No commands found
            </li>
          {:else}
            {#each filtered as cmd, i (cmd.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <li
                id="cmd-item-{i}"
                role="option"
                aria-selected={i === activeIndex}
                class="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none transition-colors"
                class:bg-surface2={i === activeIndex}
                class:text-text-base={i === activeIndex}
                class:text-textMuted={i !== activeIndex}
                onmouseenter={() => { activeIndex = i; }}
                onclick={() => execute(i)}
              >
                <!-- Label -->
                <span
                  class="flex-1 text-sm truncate"
                  class:text-text-base={i === activeIndex}
                  class:text-textMuted={i !== activeIndex}
                >
                  {cmd.label}
                </span>

                <!-- Category badge -->
                <span class="text-xs text-textMuted/70 flex-shrink-0 hidden sm:block">
                  {CATEGORY_LABELS[cmd.category] ?? cmd.category}
                </span>

                <!-- Shortcut badge -->
                {#if cmd.keys}
                  <kbd
                    class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-surface3 text-textMuted text-xs font-mono border border-surface2 flex-shrink-0"
                  >
                    {cmd.keys}
                  </kbd>
                {/if}
              </li>
            {/each}
          {/if}
        </ul>

        <!-- Footer hint -->
        <div class="flex items-center gap-4 px-4 py-2 border-t border-surface3 text-xs text-textMuted/60">
          <span><kbd class="font-mono">↑↓</kbd> navigate</span>
          <span><kbd class="font-mono">↵</kbd> select</span>
          <span><kbd class="font-mono">Esc</kbd> dismiss</span>
        </div>
      </div>
    </div>
  </div>
{/if}
