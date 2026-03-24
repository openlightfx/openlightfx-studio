<script lang="ts">
  import MenuBar from '$lib/components/layout/MenuBar.svelte';
  import Toolbar from '$lib/components/layout/Toolbar.svelte';
  import Splitter from '$lib/components/layout/Splitter.svelte';
  import VideoPanel from '$lib/components/video/VideoPanel.svelte';
  import PlaybackControls from '$lib/components/video/PlaybackControls.svelte';
  import TimelineCanvas from '$lib/components/timeline/TimelineCanvas.svelte';
  import Minimap from '$lib/components/timeline/Minimap.svelte';
  import PropertiesPanel from '$lib/components/properties/PropertiesPanel.svelte';
  import EffectsPalette from '$lib/components/effects/EffectsPalette.svelte';
  import Toast from '$lib/components/shared/Toast.svelte';

  import { projectStore } from '$lib/stores/project.svelte';
  import { timelineStore } from '$lib/stores/timeline.svelte';
  import { historyStore } from '$lib/stores/history.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { createDefaultChannel, createDefaultKeyframe, type Keyframe } from '$lib/types';
  import { computeSafetyInfo } from '$lib/services/safety';

  // --- Local UI state ---
  let videoUrl = $state<string | null>(null);
  let videoPanel = $state<VideoPanel | undefined>(undefined);
  let propertiesPanelWidth = $state(280);
  let timelinePanelHeight = $state(300);
  let videoFile = $state<File | null>(null);

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
    input.onchange = (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (file) {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        videoUrl = URL.createObjectURL(file);
        videoFile = file;
        projectStore.videoFilePath = file.name;
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

  function handleLaneDblClick(channelId: string, timestampMs: number) {
    const id = `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const prev = projectStore
      .getKeyframesForChannel(channelId)
      .filter((k) => k.timestampMs < timestampMs)
      .pop();

    const newKf = createDefaultKeyframe(id, channelId, Math.round(timestampMs));
    if (prev) {
      newKf.color = { ...prev.color };
      newKf.brightness = prev.brightness;
      newKf.colorMode = prev.colorMode;
      newKf.colorTemperature = prev.colorTemperature;
      newKf.powerOn = prev.powerOn;
    }

    // Record in undo history
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
    const oldTs = kf.timestampMs;
    const newTs = Math.max(0, Math.round(newTimestampMs));
    projectStore.updateKeyframe(id, { timestampMs: newTs });
    // Drag is continuous — don't push each frame to undo; will batch on pointerup
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
      <!-- Video Panel -->
      <div class="flex-1 flex flex-col min-w-0">
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
      />

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
</div>
