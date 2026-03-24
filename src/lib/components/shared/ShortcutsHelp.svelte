<script lang="ts">
  let {
    open = false,
    onclose,
  }: {
    open?: boolean;
    onclose?: () => void;
  } = $props();

  interface ShortcutEntry {
    keys: string;
    description: string;
  }

  interface ShortcutCategory {
    title: string;
    shortcuts: ShortcutEntry[];
  }

  const categories: ShortcutCategory[] = [
    {
      title: 'Playback',
      shortcuts: [
        { keys: 'Space', description: 'Play / Pause' },
        { keys: '←', description: 'Step back one frame' },
        { keys: '→', description: 'Step forward one frame' },
      ],
    },
    {
      title: 'Keyframes',
      shortcuts: [
        { keys: 'K', description: 'Add keyframe at playhead' },
        { keys: 'Delete / Backspace', description: 'Delete selected' },
        { keys: 'Ctrl+C', description: 'Copy selection' },
        { keys: 'Ctrl+V', description: 'Paste' },
        { keys: 'Ctrl+X', description: 'Cut selection' },
      ],
    },
    {
      title: 'Timeline',
      shortcuts: [
        { keys: '+', description: 'Zoom in' },
        { keys: '−', description: 'Zoom out' },
        { keys: 'L', description: 'Toggle lighting overlay' },
        { keys: 'S', description: 'Toggle solo (on channel)' },
        { keys: 'M', description: 'Toggle mute (on channel)' },
      ],
    },
    {
      title: 'File',
      shortcuts: [
        { keys: 'Ctrl+S', description: 'Save project' },
        { keys: 'Ctrl+Shift+E', description: 'Export .lightfx' },
        { keys: 'Ctrl+Z', description: 'Undo' },
        { keys: 'Ctrl+Shift+Z', description: 'Redo' },
      ],
    },
    {
      title: 'View',
      shortcuts: [
        { keys: '? / F1', description: 'Show keyboard shortcuts' },
      ],
    },
  ];

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose?.();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if ((e.target as HTMLElement).dataset.backdrop) {
      onclose?.();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    data-backdrop="true"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <div class="w-full max-w-lg bg-[var(--surface)] border border-[var(--surface2)] rounded-xl shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-[var(--surface2)]">
        <h2 class="text-base font-semibold text-[var(--text)]">Keyboard Shortcuts</h2>
        <button
          class="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-lg leading-none px-1"
          onclick={() => onclose?.()}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <!-- Body -->
      <div class="px-5 py-4 max-h-[70vh] overflow-y-auto space-y-5">
        {#each categories as category}
          <div>
            <h3 class="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider mb-2">
              {category.title}
            </h3>
            <div class="space-y-1">
              {#each category.shortcuts as shortcut}
                <div class="flex items-center justify-between py-1">
                  <span class="text-sm text-[var(--text)]">{shortcut.description}</span>
                  <kbd class="px-2 py-0.5 text-xs font-mono bg-[var(--surface2)] text-[var(--text-muted)] rounded border border-[var(--surface2)]">
                    {shortcut.keys}
                  </kbd>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
