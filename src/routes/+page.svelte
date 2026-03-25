<script lang="ts">
  import { onMount, untrack } from 'svelte';

  // Layout
  import { AppShell } from '$lib/components/layout/index.js';
  import MenuBar from '$lib/components/layout/MenuBar.svelte';
  import Toolbar from '$lib/components/layout/Toolbar.svelte';

  // Panels
  import { VideoPanel, PlaybackControls } from '$lib/components/video/index.js';
  import { TimelinePanel } from '$lib/components/timeline/index.js';
  import { PropertiesPanel } from '$lib/components/properties/index.js';
  import { ChannelManager } from '$lib/components/channels/index.js';
  import { EffectsPalette, EffectDropHandler } from '$lib/components/effects/index.js';

  // Dialogs
  import {
    WelcomeDialog,
    ExportDialog,
    PublishDialog,
    MovieMetadataDialog,
    SceneDetectionDialog,
    KeyboardShortcutsDialog,
    AboutDialog,
    NewProjectWizard,
  } from '$lib/components/dialogs/index.js';

  // Shared
  import { Toast } from '$lib/components/shared/index.js';

  // Stores
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { snapshotStore } from '$lib/stores/snapshot.svelte.js';
  import { toastStore } from '$lib/stores/toast.svelte.js';

  // Shared edit actions
  import {
    copySelectedKeyframes,
    cutSelectedKeyframes,
    pasteKeyframes,
    selectAllInActiveChannel,
    deleteSelected,
    addKeyframeAtPlayhead,
    addSceneMarkerAtPlayhead,
    openProject,
    saveProject,
    saveProjectAs,
  } from '$lib/services/edit-actions.js';

  let appShell: AppShell;
  let sidebarTab = $state<'properties' | 'channels' | 'effects'>('properties');

  function resetLayout() {
    appShell?.resetLayout();
  }

  // ── Keyboard shortcuts (STU-006) ──────────────────────────
  function handleKeydown(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const key = e.key;

    // Ignore shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // ── File ─────────────────────────────────────────────────
    if (ctrl && shift && (key === 's' || key === 'S')) {
      e.preventDefault();
      saveProjectAs();
    } else if (ctrl && !shift && key === 's') {
      e.preventDefault();
      saveProject();
    } else if (ctrl && !shift && key === 'o') {
      e.preventDefault();
      openProject();
    } else if (ctrl && !shift && key === 'e') {
      e.preventDefault();
      uiStore.openModal('export');

      // ── Undo/Redo ────────────────────────────────────────────
    } else if (ctrl && shift && (key === 'z' || key === 'Z')) {
      e.preventDefault();
      undoStore.redo();
    } else if (ctrl && !shift && key === 'z') {
      e.preventDefault();
      undoStore.undo();

      // ── Clipboard ────────────────────────────────────────────
    } else if (ctrl && key === 'x') {
      e.preventDefault();
      cutSelectedKeyframes();
    } else if (ctrl && key === 'c') {
      e.preventDefault();
      copySelectedKeyframes();
    } else if (ctrl && key === 'v') {
      e.preventDefault();
      pasteKeyframes();

      // ── Select all in active channel ─────────────────────────
    } else if (ctrl && key === 'a') {
      e.preventDefault();
      selectAllInActiveChannel();

      // ── Delete ───────────────────────────────────────────────
    } else if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      deleteSelected();

      // ── Playback ─────────────────────────────────────────────
    } else if (key === ' ') {
      e.preventDefault();
      videoStore.togglePlayback();
    } else if (!ctrl && key === 'ArrowRight') {
      e.preventDefault();
      videoStore.stepForward();
    } else if (!ctrl && key === 'ArrowLeft') {
      e.preventDefault();
      videoStore.stepBackward();

      // ── Zoom ──────────────────────────────────────────────────
    } else if (ctrl && (key === '=' || key === '+')) {
      e.preventDefault();
      timelineStore.zoomIn();
    } else if (ctrl && key === '-') {
      e.preventDefault();
      timelineStore.zoomOut();
    } else if (ctrl && key === '0') {
      e.preventDefault();
      if (videoStore.state.isLoaded) {
        timelineStore.zoomToFit(videoStore.state.durationMs);
      }

      // ── Quick-add shortcuts ──────────────────────────────────
    } else if (key === 'k' || key === 'K') {
      addKeyframeAtPlayhead();
    } else if (key === 'm' && !ctrl) {
      addSceneMarkerAtPlayhead();

      // ── Escape ───────────────────────────────────────────────
    } else if (key === 'Escape') {
      timelineStore.clearSelection();
      uiStore.setEyedropperActive(false);
      uiStore.closeModal();

      // ── Help ─────────────────────────────────────────────────
    } else if (key === '?') {
      uiStore.openModal('keyboard-shortcuts');
    }
  }

  // ── Properties context sync ────────────────────────────────
  $effect(() => {
    const { keyframeIds, effectKeyframeIds, sceneMarkerIds, activeChannelId } =
      timelineStore.selection;

    // Use untrack to prevent the uiStore write from creating a dependency
    // cycle (setPropertiesContext reads this.state via spread, which would
    // re-trigger this effect).
    untrack(() => {
      if (keyframeIds.length > 0) {
        uiStore.setPropertiesContext({ type: 'keyframe', keyframeIds: [...keyframeIds] });
      } else if (effectKeyframeIds.length > 0) {
        uiStore.setPropertiesContext({ type: 'effect', effectKeyframeId: effectKeyframeIds[0] });
      } else if (sceneMarkerIds.length > 0) {
        uiStore.setPropertiesContext({ type: 'scene-marker', sceneMarkerId: sceneMarkerIds[0] });
      } else if (activeChannelId) {
        uiStore.setPropertiesContext({ type: 'channel', channelId: activeChannelId });
      } else {
        uiStore.setPropertiesContext({ type: 'track' });
      }
    });
  });

  // ── Auto-save / restore (STU-064-069) ─────────────────────
  onMount(() => {
    // Restore snapshot if available
    const snapshot = snapshotStore.restore() ?? snapshotStore.findAnySnapshot();
    if (snapshot) {
      projectStore.loadProject(snapshot);
      toastStore.info('Restored from auto-save');
    }

    // Start auto-snapshot every 1 minute
    snapshotStore.startAutoSave();

    // Show welcome dialog on first launch
    if (!uiStore.state.onboardingComplete) {
      uiStore.openModal('welcome');
    }

    // Global keyboard shortcuts
    window.addEventListener('keydown', handleKeydown);

    // Unsaved changes warning
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (projectStore.project.isDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      snapshotStore.saveNow();
      snapshotStore.stopAutoSave();
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  });
</script>

<!-- All dialogs (hidden by default, shown via uiStore.state.activeModal) -->
<WelcomeDialog />
<ExportDialog />
<PublishDialog />
<MovieMetadataDialog />
<SceneDetectionDialog />
<KeyboardShortcutsDialog />
<AboutDialog />
<NewProjectWizard />

<!-- Toast notifications -->
<Toast toasts={toastStore.toasts} ondismiss={(id) => toastStore.dismiss(id)} />

<AppShell bind:this={appShell}>
  {#snippet menuBar()}
    <MenuBar onresetlayout={resetLayout} />
  {/snippet}

  {#snippet toolbar()}
    <Toolbar />
  {/snippet}

  {#snippet videoPanel()}
    <div class="flex flex-col h-full">
      <div class="flex-1 min-h-0">
        <VideoPanel />
      </div>
    </div>
  {/snippet}

  {#snippet propertiesPanel()}
    <div class="flex flex-col h-full">
      <div class="flex shrink-0 border-b border-surface2">
        <button
          class="flex-1 px-3 py-1.5 text-xs font-medium transition-colors
            {sidebarTab === 'properties'
            ? 'text-text-base border-b-2 border-accent'
            : 'text-textMuted hover:text-text-base'}"
          onclick={() => (sidebarTab = 'properties')}
        >
          Properties
        </button>
        <button
          class="flex-1 px-3 py-1.5 text-xs font-medium transition-colors
            {sidebarTab === 'channels'
            ? 'text-text-base border-b-2 border-accent'
            : 'text-textMuted hover:text-text-base'}"
          onclick={() => (sidebarTab = 'channels')}
        >
          Channels
        </button>
        <button
          class="flex-1 px-3 py-1.5 text-xs font-medium transition-colors
            {sidebarTab === 'effects'
            ? 'text-text-base border-b-2 border-accent'
            : 'text-textMuted hover:text-text-base'}"
          onclick={() => (sidebarTab = 'effects')}
        >
          Effects
        </button>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto">
        {#if sidebarTab === 'properties'}
          <PropertiesPanel />
        {:else if sidebarTab === 'channels'}
          <ChannelManager />
        {:else}
          <EffectsPalette />
        {/if}
      </div>
    </div>
  {/snippet}

  {#snippet playbackBar()}
    <PlaybackControls />
  {/snippet}

  {#snippet timelinePanel()}
    <EffectDropHandler>
      {#snippet children()}
        <TimelinePanel />
      {/snippet}
    </EffectDropHandler>
  {/snippet}
</AppShell>
