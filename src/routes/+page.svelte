<script lang="ts">
  import { onMount } from 'svelte';
  import AppShell from '$lib/components/app/AppShell.svelte';
  import Toast from '$lib/components/shared/Toast.svelte';
  import NewProjectDialog from '$lib/components/channels/NewProjectDialog.svelte';
  import AddChannelDialog from '$lib/components/channels/AddChannelDialog.svelte';
  import ExportDialog from '$lib/components/dialogs/ExportDialog.svelte';
  import AboutDialog from '$lib/components/dialogs/AboutDialog.svelte';
  import KeyboardShortcutsDialog from '$lib/components/dialogs/KeyboardShortcutsDialog.svelte';
  import TrackMetadataModal from '$lib/components/properties/TrackMetadataModal.svelte';
  import MovieMetadataModal from '$lib/components/properties/MovieMetadataModal.svelte';
  import SceneDetectionDialog from '$lib/components/dialogs/SceneDetectionDialog.svelte';
  import ChannelGroupDialog from '$lib/components/channels/ChannelGroupDialog.svelte';
  import EffectCatalog from '$lib/components/effects/EffectCatalog.svelte';
  import Modal from '$lib/components/shared/Modal.svelte';

  import { projectStore } from '$lib/stores/project.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { snapshotStore } from '$lib/stores/snapshot.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';

  import { createSaveProvider } from '$lib/save/index.js';
  import { initKeyboardShortcuts } from '$lib/services/keyboard-shortcuts.js';
  import { probeVideo } from '$lib/services/frame-extractor.js';
  import { LS_KEY_SNAPSHOT_PREFIX } from '$lib/types/ui.js';

  // ── Save provider ─────────────────────────────────────────────────────────────
  const saveProvider = createSaveProvider();

  // ── Bindable state for dialogs that use isOpen ────────────────────────────────
  let newProjectOpen = $state(false);
  let addChannelOpen = $state(false);

  // ── Sync modal state from uiStore ─────────────────────────────────────────────
  $effect(() => {
    newProjectOpen = uiStore.activeModal === 'new-project';
    addChannelOpen = uiStore.activeModal === 'channel-template';
  });

  // When the bindable dialogs self-close (isOpen set to false internally),
  // clear the uiStore modal so it stays in sync.
  $effect(() => {
    if (!newProjectOpen && uiStore.activeModal === 'new-project') {
      uiStore.closeModal();
    }
  });
  $effect(() => {
    if (!addChannelOpen && uiStore.activeModal === 'channel-template') {
      uiStore.closeModal();
    }
  });

  // ── Initialization ────────────────────────────────────────────────────────────
  onMount(() => {
    // 1. Init UI store (reads localStorage preferences)
    uiStore.init();

    // 2. Attempt snapshot restore: scan localStorage for any snapshot key
    let restored = false;
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(LS_KEY_SNAPSHOT_PREFIX)) {
          const projectId = key.slice(LS_KEY_SNAPSHOT_PREFIX.length);
          const project = snapshotStore.restore(projectId);
          if (project) {
            projectStore.load(project);
            undoStore.clear();
            // Re-load video if there was one (videoFilePath stored in project)
            // We can only do this if the user drags in the video again — no auto video restore
            restored = true;
            break;
          }
        }
      }
    }

    // 3. If no snapshot, show NewProjectDialog (no pre-loaded project state)
    if (!restored) {
      uiStore.openModal('new-project');
    }

    // 4. Keyboard shortcuts
    const cleanupKeyboard = initKeyboardShortcuts({ onOpen: handleOpen, onSave: handleSave });

    // Expose stores for e2e testing
    if (typeof window !== 'undefined') {
      (window as any).__stores = {
        projectStore,
        timelineStore,
        videoStore,
        undoStore,
        uiStore,
      };
    }

    // 5. Auto-save snapshot
    snapshotStore.startAutoSave(() => projectStore.file);

    // 6. beforeunload warning for unsaved changes
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (projectStore.isDirty) {
        e.preventDefault();
        // Legacy browsers need returnValue set
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup on destroy
    return () => {
      cleanupKeyboard();
      snapshotStore.destroy();
      videoStore.destroy();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  });

  // ── Save / open handlers ──────────────────────────────────────────────────────
  async function handleSave() {
    if (!projectStore.file) return;
    try {
      await saveProvider.save(projectStore.file);
      projectStore.markClean();
    } catch (err) {
      // User cancelled save dialog — ignore
      if ((err as DOMException)?.name !== 'AbortError') {
        console.error('Save failed:', err);
      }
    }
  }

  async function handleOpen() {
    try {
      const project = await saveProvider.load();
      projectStore.load(project);
      undoStore.clear();
      videoStore.destroy();
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        console.error('Open failed:', err);
      }
    }
  }

  // ── Video file selection (from file input, not drag-drop) ─────────────────────
  // VideoPanel already handles drag-drop internally.
  // Page-level video loading: triggered by a hidden file input if needed.
  async function handleVideoFile(file: File) {
    projectStore.setVideoFile(file);
    videoStore.loadFile(file, projectStore.videoObjectUrl!);
    // Probe for HDR info in background
    try {
      const result = await probeVideo(file);
      videoStore.applyProbeResult(result);
    } catch (err) {
      console.warn('Video probe failed:', err);
    }
  }

  // Expose for TopBar "Open Video" if needed — passed through AppShell
  // (VideoPanel handles its own drag-drop; this is for potential future menu action)
</script>

<!-- Main app layout -->
<AppShell
  saveProviderName={saveProvider.displayName}
  onrename={(name) => projectStore.updateMetadata({ title: name })}
  onnewproject={() => uiStore.openModal('new-project')}
  onopen={handleOpen}
  onsave={handleSave}
  onexport={() => uiStore.openModal('export')}
  oncommandpalette={() => {
    /* CommandPalette handles its own Ctrl+K listener */
  }}
/>

<!-- ── Modals ─────────────────────────────────────────────────────────────────── -->

<!-- new-project and channel-template use isOpen bindable -->
<NewProjectDialog bind:isOpen={newProjectOpen} />
<AddChannelDialog bind:isOpen={addChannelOpen} />

<!-- onclose-style modals -->
{#if uiStore.activeModal === 'export'}
  <ExportDialog onclose={() => uiStore.closeModal()} />
{:else if uiStore.activeModal === 'about'}
  <AboutDialog onclose={() => uiStore.closeModal()} />
{:else if uiStore.activeModal === 'keyboard-shortcuts'}
  <KeyboardShortcutsDialog onclose={() => uiStore.closeModal()} />
{:else if uiStore.activeModal === 'track-metadata'}
  <TrackMetadataModal onclose={() => uiStore.closeModal()} />
{:else if uiStore.activeModal === 'movie-metadata'}
  <MovieMetadataModal onclose={() => uiStore.closeModal()} />
{:else if uiStore.activeModal === 'scene-detection'}
  <SceneDetectionDialog onclose={() => uiStore.closeModal()} />
{:else if uiStore.activeModal === 'channel-group'}
  <ChannelGroupDialog onclose={() => uiStore.closeModal()} />
{:else if uiStore.activeModal === 'effect-catalog'}
  <Modal title="Add Effect" onclose={() => uiStore.closeModal()}>
    <EffectCatalog onclose={() => uiStore.closeModal()} />
  </Modal>
{/if}

<!-- Toast notifications -->
<Toast />
