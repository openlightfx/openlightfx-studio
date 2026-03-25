<script lang="ts">
  import { Modal, TextInput } from '$lib/components/shared/index.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import type { ShortcutCategory } from '$lib/types/ui.js';

  let open = $derived(uiStore.state.activeModal === 'keyboard-shortcuts');
  let filterText = $state('');

  interface ShortcutEntry {
    description: string;
    keys: string;
    category: ShortcutCategory;
  }

  const allShortcuts: ShortcutEntry[] = [
    // File
    { description: 'Save', keys: 'Ctrl+S', category: 'file' },
    { description: 'Save As', keys: 'Ctrl+Shift+S', category: 'file' },
    { description: 'Open', keys: 'Ctrl+O', category: 'file' },
    { description: 'Export', keys: 'Ctrl+E', category: 'file' },
    // Edit
    { description: 'Undo', keys: 'Ctrl+Z', category: 'edit' },
    { description: 'Redo', keys: 'Ctrl+Shift+Z', category: 'edit' },
    { description: 'Cut', keys: 'Ctrl+X', category: 'edit' },
    { description: 'Copy', keys: 'Ctrl+C', category: 'edit' },
    { description: 'Paste', keys: 'Ctrl+V', category: 'edit' },
    { description: 'Delete', keys: 'Delete', category: 'edit' },
    { description: 'Select All in Channel', keys: 'Ctrl+A', category: 'edit' },
    // Playback
    { description: 'Play/Pause', keys: 'Space', category: 'playback' },
    { description: 'Frame Forward', keys: '→', category: 'playback' },
    { description: 'Frame Backward', keys: '←', category: 'playback' },
    // Timeline
    { description: 'Zoom In', keys: 'Ctrl+=', category: 'timeline' },
    { description: 'Zoom Out', keys: 'Ctrl+-', category: 'timeline' },
    { description: 'Zoom to Fit', keys: 'Ctrl+0', category: 'timeline' },
    // Keyframe
    { description: 'Add Keyframe', keys: 'K', category: 'keyframe' },
    { description: 'Eyedropper', keys: 'I', category: 'keyframe' },
    // View
    { description: 'Toggle Dark Mode', keys: 'Ctrl+D', category: 'view' },
    { description: 'Toggle Overlay', keys: 'Ctrl+L', category: 'view' },
  ];

  const categoryOrder: ShortcutCategory[] = ['file', 'edit', 'playback', 'timeline', 'keyframe', 'view'];
  const categoryLabels: Record<ShortcutCategory, string> = {
    file: 'File',
    edit: 'Edit',
    playback: 'Playback',
    timeline: 'Timeline',
    keyframe: 'Keyframe',
    view: 'View',
  };

  const filteredShortcuts = $derived.by(() => {
    const query = filterText.toLowerCase().trim();
    if (!query) return allShortcuts;
    return allShortcuts.filter(
      (s) =>
        s.description.toLowerCase().includes(query) ||
        s.keys.toLowerCase().includes(query) ||
        categoryLabels[s.category].toLowerCase().includes(query)
    );
  });

  function shortcutsByCategory(category: ShortcutCategory): ShortcutEntry[] {
    return filteredShortcuts.filter((s) => s.category === category);
  }

  const visibleCategories = $derived(
    categoryOrder.filter((c) => shortcutsByCategory(c).length > 0)
  );

  function handleClose() {
    uiStore.closeModal();
    filterText = '';
  }

  function formatKeyParts(keys: string): string[] {
    return keys.split('+').map((k) => k.trim());
  }
</script>

<Modal {open} title="Keyboard Shortcuts" onclose={handleClose} size="lg">
  <div class="flex flex-col gap-4">
    <TextInput
      value={filterText}
      placeholder="Search shortcuts…"
      oninput={(v) => (filterText = v)}
    />

    <div class="max-h-[28rem] overflow-y-auto">
      {#each visibleCategories as category (category)}
        <div class="mb-4">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-textMuted">
            {categoryLabels[category]}
          </h3>
          <div class="flex flex-col">
            {#each shortcutsByCategory(category) as shortcut (shortcut.keys)}
              <div
                class="flex items-center justify-between border-b border-surface2/50 py-1.5 last:border-b-0"
              >
                <span class="text-sm text-text-base">{shortcut.description}</span>
                <span class="flex items-center gap-1">
                  {#each formatKeyParts(shortcut.keys) as part (part)}
                    <kbd
                      class="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-surface2 bg-surface2 px-1.5 py-0.5 text-2xs font-medium text-textMuted"
                    >
                      {part}
                    </kbd>
                  {/each}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/each}

      {#if filteredShortcuts.length === 0}
        <p class="py-4 text-center text-sm text-textMuted">No shortcuts match your search.</p>
      {/if}
    </div>
  </div>
</Modal>
