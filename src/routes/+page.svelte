<script lang="ts">
  import { onMount } from 'svelte';

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
  } from '$lib/components/dialogs/index.js';

  // Shared
  import { Toast } from '$lib/components/shared/index.js';

  // Stores
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { timelineStore } from '$lib/stores/timeline.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { clipboardStore } from '$lib/stores/clipboard.svelte.js';
  import { snapshotStore } from '$lib/stores/snapshot.svelte.js';
  import { toastStore } from '$lib/stores/toast.svelte.js';

  // Services
  import { saveProjectFile } from '$lib/services/project-io.js';

  let appShell: AppShell;

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
    if (ctrl && !shift && key === 's') {
      e.preventDefault();
      saveProjectFile(projectStore.project.file).then(() => {
        projectStore.markClean();
        toastStore.success('Project saved');
      }).catch(() => {
        toastStore.error('Save failed');
      });
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

  // ── Clipboard helpers ──────────────────────────────────────
  function getSelectedKeyframes() {
    const ids = timelineStore.selection.keyframeIds;
    if (ids.length === 0) return null;
    const keyframes = ids.map((id) => projectStore.getKeyframe(id)).filter(Boolean) as import('$lib/types/index.js').Keyframe[];
    if (keyframes.length === 0) return null;
    const channelId = keyframes[0].channelId;
    return { keyframes, channelId };
  }

  function copySelectedKeyframes() {
    const sel = getSelectedKeyframes();
    if (!sel) return;
    clipboardStore.copy(sel.keyframes, sel.channelId);
    toastStore.info(`Copied ${sel.keyframes.length} keyframe${sel.keyframes.length > 1 ? 's' : ''}`);
  }

  function cutSelectedKeyframes() {
    const sel = getSelectedKeyframes();
    if (!sel) return;
    clipboardStore.cut(sel.keyframes, sel.channelId);
    for (const kf of sel.keyframes) {
      projectStore.removeKeyframe(kf.id);
    }
    timelineStore.clearSelection();
    toastStore.info(`Cut ${sel.keyframes.length} keyframe${sel.keyframes.length > 1 ? 's' : ''}`);
  }

  function pasteKeyframes() {
    const activeChannelId = timelineStore.selection.activeChannelId;
    if (!activeChannelId || !clipboardStore.hasContent) return;
    const currentTimeMs = videoStore.state.currentTimeMs;
    const result = clipboardStore.paste(activeChannelId, currentTimeMs);
    if (!result) return;

    if (result.type === 'keyframes') {
      for (const kf of result.keyframes) {
        projectStore.addKeyframe(kf.channelId, kf.timestampMs, kf);
      }
      toastStore.info(`Pasted ${result.keyframes.length} keyframe${result.keyframes.length > 1 ? 's' : ''}`);
    } else if (result.type === 'effect') {
      projectStore.addEffectKeyframe(result.effect);
      toastStore.info('Pasted effect');
    }
  }

  function selectAllInActiveChannel() {
    const channelId = timelineStore.selection.activeChannelId;
    if (!channelId) return;
    const keyframeIds = projectStore.keyframesByChannel(channelId).map((kf) => kf.id);
    timelineStore.selectAllInChannel(channelId, keyframeIds);
  }

  function deleteSelected() {
    const { keyframeIds, effectKeyframeIds, sceneMarkerIds } = timelineStore.selection;
    let count = 0;
    for (const id of keyframeIds) {
      projectStore.removeKeyframe(id);
      count++;
    }
    for (const id of effectKeyframeIds) {
      projectStore.removeEffectKeyframe(id);
      count++;
    }
    for (const id of sceneMarkerIds) {
      projectStore.removeSceneMarker(id);
      count++;
    }
    if (count > 0) {
      timelineStore.clearSelection();
    }
  }

  function addKeyframeAtPlayhead() {
    const channelId = timelineStore.selection.activeChannelId;
    if (!channelId) {
      toastStore.warning('Select a channel first');
      return;
    }
    const timestampMs = videoStore.state.currentTimeMs;
    projectStore.addKeyframe(channelId, timestampMs);
  }

  function addSceneMarkerAtPlayhead() {
    const timestampMs = videoStore.state.currentTimeMs;
    projectStore.addSceneMarker(timestampMs, '');
  }

  // ── Properties context sync ────────────────────────────────
  $effect(() => {
    const { keyframeIds, effectKeyframeIds, sceneMarkerIds, activeChannelId } = timelineStore.selection;

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
    <div class="flex flex-col h-full overflow-y-auto">
      <PropertiesPanel />
      <div class="border-t border-surface2">
        <ChannelManager />
      </div>
      <div class="border-t border-surface2">
        <EffectsPalette />
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
