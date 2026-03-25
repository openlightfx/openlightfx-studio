<script lang="ts">
  import { onMount } from 'svelte';
  import { AppShell } from '$lib/components/layout/index.js';
  import MenuBar from '$lib/components/layout/MenuBar.svelte';
  import Toolbar from '$lib/components/layout/Toolbar.svelte';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';

  let appShell: AppShell;

  function resetLayout() {
    appShell?.resetLayout();
  }

  // Keyboard shortcut service (STU-006)
  function handleKeydown(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const key = e.key;

    // Ignore shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    if (ctrl && !shift && key === 's') {
      e.preventDefault();
      // Save project (placeholder — persistence handled elsewhere)
    } else if (ctrl && shift && (key === 'z' || key === 'Z')) {
      e.preventDefault();
      undoStore.redo();
    } else if (ctrl && !shift && key === 'z') {
      e.preventDefault();
      undoStore.undo();
    } else if (key === ' ') {
      e.preventDefault();
      videoStore.togglePlayback();
    } else if (!ctrl && key === 'ArrowRight') {
      e.preventDefault();
      videoStore.stepForward();
    } else if (!ctrl && key === 'ArrowLeft') {
      e.preventDefault();
      videoStore.stepBackward();
    } else if (key === 'Delete' || key === 'Backspace') {
      // Delete selected keyframes (placeholder)
    } else if (ctrl && key === 'x') {
      e.preventDefault();
      // Cut (placeholder)
    } else if (ctrl && key === 'c') {
      e.preventDefault();
      // Copy (placeholder)
    } else if (ctrl && key === 'v') {
      e.preventDefault();
      // Paste (placeholder)
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<AppShell bind:this={appShell}>
  {#snippet menuBar()}
    <MenuBar onresetlayout={resetLayout} />
  {/snippet}

  {#snippet toolbar()}
    <Toolbar />
  {/snippet}

  {#snippet videoPanel()}
    <div class="flex items-center justify-center h-full bg-bg text-textMuted text-sm">
      Video Panel
    </div>
  {/snippet}

  {#snippet propertiesPanel()}
    <div class="flex items-center justify-center h-full bg-surface text-textMuted text-sm">
      Properties Panel
    </div>
  {/snippet}

  {#snippet playbackBar()}
    <div class="flex items-center justify-center h-10 bg-surface border-y border-surface2 text-textMuted text-sm">
      Playback Bar
    </div>
  {/snippet}

  {#snippet timelinePanel()}
    <div class="flex items-center justify-center h-full bg-bg text-textMuted text-sm">
      Timeline Panel
    </div>
  {/snippet}
</AppShell>
