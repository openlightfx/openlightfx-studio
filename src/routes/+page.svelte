<script lang="ts">
  import MenuBar from '$lib/components/layout/MenuBar.svelte';
  import Toolbar from '$lib/components/layout/Toolbar.svelte';
  import Splitter from '$lib/components/layout/Splitter.svelte';
  import VideoPanel from '$lib/components/video/VideoPanel.svelte';
  import PlaybackControls from '$lib/components/video/PlaybackControls.svelte';
  import TimelineCanvas from '$lib/components/timeline/TimelineCanvas.svelte';
  import TimelineContextMenu from '$lib/components/timeline/TimelineContextMenu.svelte';
  import Minimap from '$lib/components/timeline/Minimap.svelte';
  import PropertiesPanel from '$lib/components/properties/PropertiesPanel.svelte';
  import EffectsPalette from '$lib/components/effects/EffectsPalette.svelte';
  import LightingOverlay from '$lib/components/video/LightingOverlay.svelte';
  import LightIcons from '$lib/components/video/LightIcons.svelte';
  import ChannelList from '$lib/components/channels/ChannelList.svelte';
  import Toast from '$lib/components/shared/Toast.svelte';
  import ShortcutsHelp from '$lib/components/shared/ShortcutsHelp.svelte';
  import WelcomeFlow from '$lib/components/onboarding/WelcomeFlow.svelte';
  import ChannelTemplateModal from '$lib/components/modals/ChannelTemplateModal.svelte';
  import ChannelCreateModal from '$lib/components/modals/ChannelCreateModal.svelte';
  import MovieMetadataModal from '$lib/components/modals/MovieMetadataModal.svelte';
  import ExportDialog from '$lib/components/modals/ExportDialog.svelte';

  import { projectStore } from '$lib/stores/project.svelte';
  import { timelineStore } from '$lib/stores/timeline.svelte';
  import { historyStore } from '$lib/stores/history.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import {
    createDefaultChannel,
    createDefaultKeyframe,
    createDefaultEffectKeyframe,
    type Keyframe,
    type EffectType,
    type Channel,
  } from '$lib/types';
  import { computeSafetyInfo } from '$lib/services/safety';
  import { exportTrack, exportForMarketplace } from '$lib/services/export';
  import { importTrack } from '$lib/services/import';
  import { saveProject, loadProject } from '$lib/services/project';
  import { extractMetadata, type VideoMetadata } from '$lib/services/video-metadata';
  import { validateTrack } from '$lib/proto';
  import { snapToFrame, snapToInterval } from '$lib/utils/time';

  // --- Local UI state ---
  let videoUrl = $state<string | null>(null);
  let videoPanel = $state<VideoPanel | undefined>(undefined);
  let propertiesPanelWidth = $state(280);
  let timelinePanelHeight = $state(300);
  let videoFile = $state<File | null>(null);
  let videoPanelWidth = $state(0);
  let videoPanelHeight = $state(0);

  // Modal state
  let showShortcutsHelp = $state(false);
  let showWelcome = $state(false);
  let showChannelTemplate = $state(false);
  let showChannelCreate = $state(false);
  let showMovieMetadata = $state(false);
  let showExportDialog = $state(false);

  // Context menu state
  let contextMenu = $state<{
    x: number;
    y: number;
    channelId: string;
    timestampMs: number;
  } | null>(null);

  // Video metadata for prefill
  let videoMetadata = $state<VideoMetadata | null>(null);

  // --- Derived from stores ---
  let channels = $derived(projectStore.track.channels);
  let keyframes = $derived(projectStore.track.keyframes);
  let effectKeyframes = $derived(projectStore.track.effectKeyframes);
  let sceneMarkers = $derived(projectStore.sceneMarkers);
  let selectedKeyframeIds = $derived(timelineStore.selection.selectedKeyframeIds);
  let selectedEffectIds = $derived(timelineStore.selection.selectedEffectIds);
  let selectedChannelId = $derived(timelineStore.selection.selectedChannelId);

  let safetyInfo = $derived.by(() => computeSafetyInfo(projectStore.track));

  // Properties panel mode
  let propertiesMode = $derived.by(() => {
    if (selectedKeyframeIds.size > 0) return 'keyframe' as const;
    if (selectedChannelId) return 'channel' as const;
    return 'track' as const;
  });

  let selectedKeyframeData = $derived.by(() => {
    if (selectedKeyframeIds.size !== 1) return undefined;
    const id = [...selectedKeyframeIds][0];
    return keyframes.find((kf: Keyframe) => kf.id === id);
  });

  let selectedChannelData = $derived.by(() => {
    if (!selectedChannelId) return undefined;
    return channels.find((c) => c.id === selectedChannelId);
  });

  let trackMetadata = $derived(projectStore.track.metadata);

  let validationErrors = $derived.by(() => {
    try {
      return validateTrack(projectStore.track).map(
        (e: { field: string; message: string }) => `${e.field}: ${e.message}`
      );
    } catch {
      return [];
    }
  });

  let durationWarning = $derived.by(() => {
    const trackDur = projectStore.track.metadata.durationMs;
    const videoDur = projectStore.track.metadata.durationMs;
    if (trackDur > 0 && videoDur > 0 && Math.abs(trackDur - videoDur) > 5000) {
      return `Track duration differs from video by ${Math.round(Math.abs(trackDur - videoDur) / 1000)}s`;
    }
    return null;
  });

  // Check onboarding on mount
  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      const done = localStorage.getItem('openlightfx-studio:onboarding-complete');
      if (!done) showWelcome = true;
    }
  });

  // --- Handlers ---
  function handleSeek(ms: number) {
    const clamped = Math.max(0, Math.min(ms, projectStore.track.metadata.durationMs || Infinity));
    timelineStore.setPlayhead(clamped);
    videoPanel?.seekTo(clamped);
  }

  function handlePlay() {
    videoPanel?.play();
    timelineStore.play();
  }

  function handlePause() {
    videoPanel?.pause();
    timelineStore.pause();
  }

  function handleStepForward() {
    handleSeek(timelineStore.playheadMs + 1000 / 24);
  }

  function handleStepBackward() {
    handleSeek(timelineStore.playheadMs - 1000 / 24);
  }

  function handleSpeedChange(speed: number) {
    timelineStore.setPlaybackSpeed(speed);
  }

  function handleVideoLoaded(e: { duration: number }) {
    projectStore.track.metadata.durationMs = e.duration;
    timelineStore.setViewport(0, Math.min(60000, e.duration));
    projectStore.markDirty();
  }

  function handleLoadVideo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (file) {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        videoUrl = URL.createObjectURL(file);
        videoFile = file;
        projectStore.videoFilePath = file.name;

        // Extract metadata from container
        try {
          const meta = await extractMetadata(file);
          videoMetadata = meta;

          // Auto-place chapter markers
          if (meta.chapters.length > 0) {
            for (const ch of meta.chapters) {
              projectStore.addSceneMarker({
                id: `marker-ch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                timestampMs: ch.timestampMs,
                label: ch.label || `Chapter`,
                type: 'MARKER_CHAPTER',
              });
            }
            toastStore.info(`Placed ${meta.chapters.length} chapter markers from video`);
          }
        } catch {
          // Metadata extraction failed — not critical
        }
      }
    };
    input.click();
  }

  function handleKeyframeClick(id: string, e: MouseEvent) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      timelineStore.toggleKeyframeSelection(id);
    } else {
      timelineStore.selectKeyframe(id);
    }
  }

  function handleLaneClick(channelId: string) {
    timelineStore.selectChannel(channelId);
  }

  // Snapping + min interval settings
  const DEFAULT_FPS = 24;
  const DEFAULT_MIN_INTERVAL_MS = 200;

  function getMinInterval(): number {
    try {
      const stored = localStorage.getItem('openlightfx-studio:min-interval');
      if (stored) return Math.max(100, Math.min(1000, parseInt(stored)));
    } catch {}
    return DEFAULT_MIN_INTERVAL_MS;
  }

  function applySnapping(ms: number): number {
    let snapped = Math.max(0, Math.round(ms));
    if (timelineStore.snappingEnabled) {
      snapped = snapToFrame(snapped, DEFAULT_FPS);
      snapped = snapToInterval(snapped, 500);
    }
    return snapped;
  }

  function enforceMinInterval(channelId: string, timestampMs: number, excludeId?: string): number {
    const minInterval = getMinInterval();
    const existing = projectStore
      .getKeyframesForChannel(channelId)
      .filter((k) => (excludeId ? k.id !== excludeId : true))
      .map((k) => k.timestampMs)
      .sort((a, b) => a - b);

    let ts = timestampMs;
    for (const t of existing) {
      if (Math.abs(ts - t) < minInterval) {
        ts = ts >= t ? t + minInterval : t - minInterval;
      }
    }
    return Math.max(0, Math.round(ts));
  }

  function handleLaneDblClick(channelId: string, timestampMs: number) {
    let ts = applySnapping(timestampMs);
    ts = enforceMinInterval(channelId, ts);

    const id = `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const prev = projectStore
      .getKeyframesForChannel(channelId)
      .filter((k) => k.timestampMs < ts)
      .pop();

    const newKf = createDefaultKeyframe(id, channelId, ts);
    if (prev) {
      newKf.color = { ...prev.color };
      newKf.brightness = prev.brightness;
      newKf.colorMode = prev.colorMode;
      newKf.colorTemperature = prev.colorTemperature;
      newKf.powerOn = prev.powerOn;
    }

    historyStore.push({
      type: 'add-keyframe',
      description: `Add keyframe on ${channelId}`,
      redo: () => projectStore.addKeyframe(newKf),
      undo: () => projectStore.removeKeyframe(id),
    });

    timelineStore.selectKeyframe(id);
  }

  function handleAddKeyframe() {
    const chId = timelineStore.selection.selectedChannelId;
    if (!chId) {
      toastStore.info('No channel selected — click a channel lane to select it.');
      return;
    }
    handleLaneDblClick(chId, timelineStore.playheadMs);
  }

  function handleAddChannel() {
    const num = projectStore.track.channels.length + 1;
    const id = `ch-${num}`;
    const channel = createDefaultChannel(id, `Channel ${num}`);
    channel.optional = true;

    const blackKf = createDefaultKeyframe(
      `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      id,
      0
    );

    historyStore.push({
      type: 'add-channel',
      description: `Add channel ${id}`,
      redo: () => {
        projectStore.addChannel(channel);
        projectStore.addKeyframe(blackKf);
      },
      undo: () => projectStore.removeChannel(id),
    });
  }

  function handleKeyframeChange(field: string, value: unknown) {
    if (selectedKeyframeIds.size < 1) return;
    for (const id of selectedKeyframeIds) {
      const prev = keyframes.find((kf: Keyframe) => kf.id === id);
      if (!prev) continue;
      const oldVal = (prev as Record<string, unknown>)[field];
      historyStore.push({
        type: 'edit-keyframe',
        description: `Edit ${field}`,
        redo: () => projectStore.updateKeyframe(id, { [field]: value }),
        undo: () => projectStore.updateKeyframe(id, { [field]: oldVal }),
      });
    }
  }

  function handleMetadataChange(field: string, value: unknown) {
    const oldVal = (trackMetadata as Record<string, unknown>)[field];
    historyStore.push({
      type: 'edit-metadata',
      description: `Edit ${field}`,
      redo: () => {
        (projectStore.track.metadata as Record<string, unknown>)[field] = value;
        projectStore.markDirty();
      },
      undo: () => {
        (projectStore.track.metadata as Record<string, unknown>)[field] = oldVal;
        projectStore.markDirty();
      },
    });
  }

  function handleKeyframeDrag(id: string, newTimestampMs: number) {
    const kf = keyframes.find((k: Keyframe) => k.id === id);
    if (!kf) return;
    let newTs = applySnapping(newTimestampMs);
    newTs = enforceMinInterval(kf.channelId, newTs, id);
    projectStore.updateKeyframe(id, { timestampMs: newTs });
  }

  // Timeline zoom via wheel
  function handleTimelineWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) timelineStore.zoomIn();
      else timelineStore.zoomOut();
    } else {
      const scrollMs = (e.deltaX || e.deltaY) / timelineStore.viewport.pixelsPerMs;
      const start = Math.max(0, timelineStore.viewport.startMs + scrollMs);
      const span = timelineStore.viewport.endMs - timelineStore.viewport.startMs;
      timelineStore.setViewport(start, start + span);
    }
  }

  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      historyStore.undo();
      return;
    }
    if (ctrl && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      historyStore.redo();
      return;
    }
    if (ctrl && e.key === 'Z') {
      e.preventDefault();
      historyStore.redo();
      return;
    }
    if (ctrl && e.key === 'c') {
      e.preventDefault();
      timelineStore.copySelection();
      return;
    }
    if (ctrl && e.key === 'v') {
      e.preventDefault();
      timelineStore.pasteAtPlayhead(timelineStore.selection.selectedChannelId ?? undefined);
      return;
    }
    if (ctrl && e.key === 'x') {
      e.preventDefault();
      timelineStore.copySelection();
      timelineStore.deleteSelection();
      return;
    }
    if (e.key === 'k' || e.key === 'K') {
      handleAddKeyframe();
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (timelineStore.isPlaying) handlePause();
      else handlePlay();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedKeyframeIds.size > 0 || selectedEffectIds.size > 0) {
        timelineStore.deleteSelection();
      }
      return;
    }
    if (e.key === 'l' || e.key === 'L') {
      uiStore.toggleOverlay();
      return;
    }
    if (e.key === 'ArrowRight') {
      handleStepForward();
      return;
    }
    if (e.key === 'ArrowLeft') {
      handleStepBackward();
      return;
    }
    if (e.key === '=' || e.key === '+') {
      timelineStore.zoomIn();
      return;
    }
    if (e.key === '-') {
      timelineStore.zoomOut();
      return;
    }
    if (e.key === '?' || e.key === 'F1') {
      e.preventDefault();
      showShortcutsHelp = true;
      return;
    }
    if (ctrl && e.key === 's') {
      e.preventDefault();
      handleSaveProject();
      return;
    }
    if (ctrl && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      showExportDialog = true;
      return;
    }
  }

  // --- Context menu handler ---
  function handleTimelineContextMenu(e: { x: number; y: number; channelId: string; timestampMs: number }) {
    contextMenu = e;
  }

  function handleContextMenuAddEffect(effectType: EffectType) {
    if (!contextMenu) return;
    const id = `ek-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const ek = createDefaultEffectKeyframe(id, contextMenu.channelId, contextMenu.timestampMs);
    ek.effectType = effectType;
    historyStore.push({
      type: 'add-effect',
      description: `Add ${effectType} effect`,
      redo: () => projectStore.addEffectKeyframe(ek),
      undo: () => projectStore.removeEffectKeyframe(id),
    });
    contextMenu = null;
  }

  // --- Channel template/create handlers ---
  function handleApplyTemplate(templateChannels: Array<{ id: string; displayName: string; spatialHint: string }>) {
    for (const tc of templateChannels) {
      const ch = createDefaultChannel(tc.id, tc.displayName);
      ch.spatialHint = tc.spatialHint;
      ch.optional = true;
      projectStore.addChannel(ch);

      // Auto black keyframe at 0ms
      const kf = createDefaultKeyframe(
        `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tc.id,
        0
      );
      projectStore.addKeyframe(kf);
    }
    showChannelTemplate = false;
    toastStore.success(`Created ${templateChannels.length} channels from template`);
  }

  function handleCreateChannel(data: { id: string; displayName: string; spatialHint: string }) {
    const ch = createDefaultChannel(data.id, data.displayName);
    ch.spatialHint = data.spatialHint;
    ch.optional = true;
    const kf = createDefaultKeyframe(
      `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      data.id,
      0
    );
    historyStore.push({
      type: 'add-channel',
      description: `Add channel ${data.id}`,
      redo: () => {
        projectStore.addChannel(ch);
        projectStore.addKeyframe(kf);
      },
      undo: () => projectStore.removeChannel(data.id),
    });
    showChannelCreate = false;
  }

  // --- Save/Load/Export handlers ---
  async function handleSaveProject() {
    try {
      await saveProject({
        version: 1,
        track: projectStore.track,
        channelGroups: projectStore.channelGroups,
        sceneMarkers: projectStore.sceneMarkers,
        channelOrder: projectStore.channelOrder,
        mutedChannels: [...projectStore.mutedChannels],
        soloedChannels: [...projectStore.soloedChannels],
        videoFilePath: projectStore.videoFilePath,
        ui: {
          zoom: timelineStore.zoom,
          scrollX: timelineStore.scrollX,
          scrollY: timelineStore.scrollY,
        },
        undoHistory: [],
        redoHistory: [],
      });
      projectStore.markClean();
      toastStore.success('Project saved');
    } catch (err) {
      toastStore.error('Failed to save project');
    }
  }

  async function handleLoadProject() {
    try {
      const pf = await loadProject();
      projectStore.track = pf.track;
      projectStore.channelGroups = pf.channelGroups;
      projectStore.sceneMarkers = pf.sceneMarkers;
      projectStore.channelOrder = pf.channelOrder;
      projectStore.mutedChannels = new Set(pf.mutedChannels);
      projectStore.soloedChannels = new Set(pf.soloedChannels);
      projectStore.videoFilePath = pf.videoFilePath;
      projectStore.markClean();
      historyStore.clear();
      toastStore.success('Project loaded');
    } catch {
      toastStore.error('Failed to load project');
    }
  }

  function handleExport(type: 'lightfx' | 'marketplace' | 'project') {
    try {
      if (type === 'project') {
        handleSaveProject();
      } else if (type === 'lightfx') {
        const data = exportTrack(projectStore.track);
        downloadFile(data, `${projectStore.projectName || 'track'}.lightfx`);
        toastStore.success('Track exported');
      } else if (type === 'marketplace') {
        const data = exportForMarketplace(projectStore.track);
        downloadFile(data, `${projectStore.projectName || 'track'}.lightfx`);
        toastStore.success('Track exported for marketplace');
      }
    } catch (err) {
      toastStore.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    showExportDialog = false;
  }

  function downloadFile(data: Uint8Array, filename: string) {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lightfx';
    input.onchange = async (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        const track = importTrack(new Uint8Array(buf));
        projectStore.track = track;
        projectStore.markDirty();
        historyStore.clear();
        toastStore.success('Track imported');
      } catch (err) {
        toastStore.error(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    input.click();
  }
</script>

<svelte:head>
  <title>{projectStore.projectName}{projectStore.isDirty ? ' •' : ''} — OpenLightFX Studio</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex flex-col h-screen w-screen overflow-hidden">
  <!-- Menu Bar -->
  <MenuBar
    projectName={projectStore.projectName}
    isDirty={projectStore.isDirty}
    canUndo={historyStore.canUndo}
    canRedo={historyStore.canRedo}
    onAddKeyframe={handleAddKeyframe}
    onUndo={() => historyStore.undo()}
    onRedo={() => historyStore.redo()}
  />

  <!-- Toolbar -->
  <Toolbar
    snappingEnabled={timelineStore.snappingEnabled}
    overlayVisible={uiStore.showOverlay}
    onAddKeyframe={handleAddKeyframe}
    onAddChannel={handleAddChannel}
    onToggleSnapping={() => (timelineStore.snappingEnabled = !timelineStore.snappingEnabled)}
    onToggleOverlay={() => uiStore.toggleOverlay()}
    onLoadVideo={handleLoadVideo}
  />

  <!-- Main content area -->
  <div class="flex-1 flex flex-col min-h-0">
    <!-- Top section: Video + Properties -->
    <div class="flex flex-1 min-h-0">
      <!-- Video Panel with overlay -->
      <div class="flex-1 flex flex-col min-w-0 relative"
        bind:clientWidth={videoPanelWidth}
        bind:clientHeight={videoPanelHeight}
      >
        <VideoPanel
          bind:this={videoPanel}
          bind:videoUrl
          currentTime={timelineStore.playheadMs}
          duration={projectStore.track.metadata.durationMs}
          isPlaying={timelineStore.isPlaying}
          playbackSpeed={timelineStore.playbackSpeed}
          overlayVisible={uiStore.showOverlay}
          onloadedmetadata={handleVideoLoaded}
          ontimeupdate={(t) => timelineStore.setPlayhead(t)}
        />
        {#if uiStore.showOverlay && videoPanelWidth > 0}
          <LightingOverlay
            channels={channels}
            keyframes={keyframes}
            effectKeyframes={effectKeyframes}
            currentTimeMs={timelineStore.playheadMs}
            visible={uiStore.showOverlay}
            mutedChannels={projectStore.mutedChannels}
            soloedChannels={projectStore.soloedChannels}
            width={videoPanelWidth}
            height={videoPanelHeight}
          />
          <LightIcons
            channels={channels}
            keyframes={keyframes}
            currentTimeMs={timelineStore.playheadMs}
            width={videoPanelWidth}
            height={videoPanelHeight}
            onaddKeyframe={(chId) => handleLaneDblClick(chId, timelineStore.playheadMs)}
            oneditKeyframe={(kfId) => timelineStore.selectKeyframe(kfId)}
          />
        {/if}
      </div>

      <!-- Splitter -->
      <Splitter
        direction="horizontal"
        onresize={(delta) => {
          propertiesPanelWidth = Math.max(200, Math.min(500, propertiesPanelWidth - delta));
        }}
      />

      <!-- Properties Panel -->
      <div style="width: {propertiesPanelWidth}px" class="flex-shrink-0">
        <PropertiesPanel
          mode={propertiesMode}
          {trackMetadata}
          channelData={selectedChannelData}
          keyframeData={selectedKeyframeData}
          {safetyInfo}
          onmetadatachange={handleMetadataChange}
          onkeyframechange={handleKeyframeChange}
        />
      </div>
    </div>

    <!-- Playback Controls (full width between video and timeline) -->
    <PlaybackControls
      currentTimeMs={timelineStore.playheadMs}
      durationMs={projectStore.track.metadata.durationMs}
      isPlaying={timelineStore.isPlaying}
      playbackSpeed={timelineStore.playbackSpeed}
      onplay={handlePlay}
      onpause={handlePause}
      onseek={handleSeek}
      onstepforward={handleStepForward}
      onstepbackward={handleStepBackward}
      onspeedchange={handleSpeedChange}
    />

    <!-- Splitter -->
    <Splitter
      direction="vertical"
      onresize={(delta) => {
        timelinePanelHeight = Math.max(150, Math.min(600, timelinePanelHeight - delta));
      }}
    />

    <!-- Timeline section -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex flex-col"
      style="height: {timelinePanelHeight}px"
      onwheel={handleTimelineWheel}
    >
      <TimelineCanvas
        {channels}
        {keyframes}
        {effectKeyframes}
        {sceneMarkers}
        playheadMs={timelineStore.playheadMs}
        viewportStartMs={timelineStore.viewport.startMs}
        viewportEndMs={timelineStore.viewport.endMs}
        pixelsPerMs={timelineStore.viewport.pixelsPerMs}
        {selectedKeyframeIds}
        {selectedEffectIds}
        {selectedChannelId}
        onseek={handleSeek}
        onkeyframeclick={handleKeyframeClick}
        onlanedblclick={handleLaneDblClick}
        onlaneclick={handleLaneClick}
        onkeyframedrag={handleKeyframeDrag}
        oncontextmenu={handleTimelineContextMenu}
      />

      {#if contextMenu}
        <TimelineContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          channelId={contextMenu.channelId}
          timestampMs={contextMenu.timestampMs}
          hasSelection={selectedKeyframeIds.size > 0 || selectedEffectIds.size > 0}
          hasClipboard={timelineStore.clipboard !== null}
          hasEffectSelected={selectedEffectIds.size > 0}
          channelSoloed={projectStore.soloedChannels.has(contextMenu.channelId)}
          onaddKeyframe={() => {
            if (contextMenu) handleLaneDblClick(contextMenu.channelId, contextMenu.timestampMs);
            contextMenu = null;
          }}
          onaddEffect={handleContextMenuAddEffect}
          onaddSceneMarker={() => {
            if (contextMenu) {
              projectStore.addSceneMarker({
                id: `marker-${Date.now()}`,
                timestampMs: contextMenu.timestampMs,
                label: 'Scene',
                type: 'MARKER_USER',
              });
            }
            contextMenu = null;
          }}
          oneditProperties={() => { contextMenu = null; }}
          onduplicate={() => {
            timelineStore.copySelection();
            timelineStore.pasteAtPlayhead();
            contextMenu = null;
          }}
          oncut={() => {
            timelineStore.copySelection();
            timelineStore.deleteSelection();
            contextMenu = null;
          }}
          oncopy={() => {
            timelineStore.copySelection();
            contextMenu = null;
          }}
          onpaste={() => {
            timelineStore.pasteAtPlayhead(contextMenu?.channelId);
            contextMenu = null;
          }}
          ondelete={() => {
            timelineStore.deleteSelection();
            contextMenu = null;
          }}
          onselectAllInChannel={() => {
            if (contextMenu) {
              const ids = new Set(
                keyframes
                  .filter((kf: Keyframe) => kf.channelId === contextMenu!.channelId)
                  .map((kf: Keyframe) => kf.id)
              );
              timelineStore.selection = {
                ...timelineStore.selection,
                selectedKeyframeIds: ids,
              };
            }
            contextMenu = null;
          }}
          onflattenToKeyframes={() => { contextMenu = null; }}
          onchannelProperties={() => {
            if (contextMenu) timelineStore.selectChannel(contextMenu.channelId);
            contextMenu = null;
          }}
          onclose={() => (contextMenu = null)}
        />
      {/if}

      <!-- Minimap -->
      <Minimap
        durationMs={projectStore.track.metadata.durationMs}
        viewportStartMs={timelineStore.viewport.startMs}
        viewportEndMs={timelineStore.viewport.endMs}
        {sceneMarkers}
        onseek={handleSeek}
      />

      <!-- Effects Palette -->
      <EffectsPalette />
    </div>
  </div>

  <!-- Toast notifications -->
  <Toast />

  <!-- Modals -->
  <ShortcutsHelp open={showShortcutsHelp} onclose={() => (showShortcutsHelp = false)} />

  <WelcomeFlow open={showWelcome} onclose={() => (showWelcome = false)} />

  <ChannelTemplateModal
    open={showChannelTemplate}
    onclose={() => (showChannelTemplate = false)}
    onapply={handleApplyTemplate}
  />

  <ChannelCreateModal
    open={showChannelCreate}
    onclose={() => (showChannelCreate = false)}
    existingIds={channels.map((c: Channel) => c.id)}
    oncreate={handleCreateChannel}
  />

  <MovieMetadataModal
    open={showMovieMetadata}
    onclose={() => (showMovieMetadata = false)}
    metadata={projectStore.track.metadata.movieReference}
    prefillData={videoMetadata ? { title: videoMetadata.title, year: videoMetadata.year, imdbId: videoMetadata.imdbId } : null}
    onsave={(meta) => {
      projectStore.track.metadata.movieReference = meta;
      projectStore.markDirty();
      showMovieMetadata = false;
    }}
  />

  <ExportDialog
    open={showExportDialog}
    onclose={() => (showExportDialog = false)}
    {validationErrors}
    {durationWarning}
    hasMovieMetadata={!!projectStore.track.metadata.movieReference?.imdbId}
    onexport={handleExport}
    onopenmoviemodal={() => (showMovieMetadata = true)}
  />
</div>
