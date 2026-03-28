<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import { getShortcuts } from '$lib/services/keyboard-shortcuts.js';

  let { onclose }: { onclose: () => void } = $props();

  const shortcuts = getShortcuts();

  // Group by category
  const categories: Array<{ name: string; label: string }> = [
    { name: 'file', label: 'File' },
    { name: 'edit', label: 'Edit' },
    { name: 'playback', label: 'Playback' },
    { name: 'timeline', label: 'Timeline' },
    { name: 'keyframe', label: 'Keyframe' },
    { name: 'view', label: 'View' },
  ];

  const grouped = $derived(
    categories
      .map((cat) => ({
        ...cat,
        shortcuts: shortcuts.filter((s) => s.category === cat.name),
      }))
      .filter((g) => g.shortcuts.length > 0)
  );
</script>

<Modal title="Keyboard Shortcuts" {onclose}>
  <div class="max-h-[60vh] overflow-y-auto space-y-5 pr-1">
    {#each grouped as group}
      <div>
        <h3 class="text-xs font-semibold text-textMuted uppercase tracking-wider mb-2">{group.label}</h3>
        <div class="space-y-1">
          {#each group.shortcuts as shortcut}
            <div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-surface2 transition-colors">
              <span class="text-sm text-text-base">{shortcut.label}</span>
              <div class="flex items-center gap-1">
                {#each shortcut.keys.split('+') as part}
                  <kbd class="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded bg-surface2 border border-surface3 text-xs text-textMuted font-mono">{part.trim()}</kbd>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</Modal>
