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

  // App state
  let videoUrl = $state<string | null>(null);
  let currentTimeMs = $state(0);
  let durationMs = $state(0);
  let isPlaying = $state(false);
  let playbackSpeed = $state(1);

  // Timeline state
  let viewportStartMs = $state(0);
  let viewportEndMs = $state(60000);
  let pixelsPerMs = $state(0.1);
  let snappingEnabled = $state(true);
  let overlayVisible = $state(true);

  // Selection state
  let selectedKeyframeIds = $state(new Set<string>());
  let selectedEffectIds = $state(new Set<string>());
  let selectedChannelId = $state<string | null>(null);

  // Project data — start with empty
  let projectName = $state('Untitled');
  let isDirty = $state(false);
  let channels = $state<Array<{ id: string; displayName: string }>>([]);
  let keyframes = $state<Array<{
    id: string;
    channelId: string;
    timestampMs: number;
    color: { r: number; g: number; b: number };
    brightness: number;
    colorMode: string;
    colorTemperature: number;
    transitionMs: number;
    interpolation: string;
    powerOn: boolean;
  }>>([]);
  let effectKeyframes = $state<Array<{
    id: string;
    channelId: string;
    timestampMs: number;
    durationMs: number;
    effectType: string;
    primaryColor: { r: number; g: number; b: number };
    secondaryColor: { r: number; g: number; b: number };
    intensity: number;
  }>>([]);
  let sceneMarkers = $state<Array<{ id: string; timestampMs: number; label: string; type: string }>>([]);

  // Track metadata
  let trackMetadata = $state({
    title: '',
    description: '',
    author: '',
    tags: [] as string[],
    durationMs: 0,
    startBehavior: 'LEAVE',
    endBehavior: 'OFF',
    trackVersion: '1.0',
  });

  let safetyInfo = $state({
    containsFlashing: false,
    containsStrobing: false,
    intensityRating: 'SUBTLE',
    maxFlashFrequencyHz: 0,
    maxBrightnessDelta: 0,
  });

  // Panel sizing
  let propertiesPanelWidth = $state(280);
  let timelinePanelHeight = $state(300);

  // Properties panel mode
  let propertiesMode = $derived.by(() => {
    if (selectedKeyframeIds.size > 0) return 'keyframe' as const;
    if (selectedChannelId) return 'channel' as const;
    return 'track' as const;
  });

  // Selected keyframe data for properties panel
  let selectedKeyframeData = $derived.by(() => {
    if (selectedKeyframeIds.size !== 1) return undefined;
    const id = [...selectedKeyframeIds][0];
    return keyframes.find((kf) => kf.id === id);
  });

  // Selected channel data
  let selectedChannelData = $derived.by(() => {
    if (!selectedChannelId) return undefined;
    const ch = channels.find((c) => c.id === selectedChannelId);
    if (!ch) return undefined;
    return {
      id: ch.id,
      displayName: ch.displayName,
      description: '',
      spatialHint: 'SPATIAL_UNSPECIFIED',
      defaultBrightness: 50,
      optional: true,
    };
  });

  // --- Video panel reference ---
  let videoPanel: VideoPanel;

  // --- Handlers ---
  function handleSeek(ms: number) {
    currentTimeMs = Math.max(0, Math.min(ms, durationMs));
    videoPanel?.seekTo(currentTimeMs);
  }

  function handlePlay() {
    videoPanel?.play();
    isPlaying = true;
  }

  function handlePause() {
    videoPanel?.pause();
    isPlaying = false;
  }

  function handleStepForward() {
    const frameMs = 1000 / 24; // Default 24fps
    handleSeek(currentTimeMs + frameMs);
  }

  function handleStepBackward() {
    const frameMs = 1000 / 24;
    handleSeek(currentTimeMs - frameMs);
  }

  function handleSpeedChange(speed: number) {
    playbackSpeed = speed;
  }

  function handleVideoLoaded(e: { duration: number; videoWidth: number; videoHeight: number }) {
    durationMs = e.duration;
    trackMetadata.durationMs = e.duration;
    viewportEndMs = Math.min(60000, e.duration);
    isDirty = true;
  }

  function handleLoadVideo() {
    // Trigger the file input in VideoPanel
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        videoUrl = URL.createObjectURL(file);
      }
    };
    input.click();
  }

  function handleTimelineSeek(ms: number) {
    handleSeek(ms);
  }

  function handleKeyframeClick(id: string, e: MouseEvent) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const newSet = new Set(selectedKeyframeIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      selectedKeyframeIds = newSet;
    } else {
      selectedKeyframeIds = new Set([id]);
    }
    selectedChannelId = null;
  }

  function handleLaneClick(channelId: string) {
    selectedChannelId = channelId;
    selectedKeyframeIds = new Set();
  }

  function handleLaneDblClick(channelId: string, timestampMs: number) {
    const id = `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Find previous keyframe on same channel for inheritance
    const channelKfs = keyframes
      .filter((k) => k.channelId === channelId)
      .sort((a, b) => a.timestampMs - b.timestampMs);
    const prev = channelKfs.filter((k) => k.timestampMs < timestampMs).pop();

    const newKf = {
      id,
      channelId,
      timestampMs: Math.round(timestampMs),
      color: prev ? { ...prev.color } : { r: 0, g: 0, b: 0 },
      brightness: prev ? prev.brightness : 0,
      colorMode: prev ? prev.colorMode : 'RGB',
      colorTemperature: prev ? prev.colorTemperature : 2700,
      transitionMs: 0,
      interpolation: 'STEP',
      powerOn: prev ? prev.powerOn : false,
    };
    keyframes = [...keyframes, newKf];
    selectedKeyframeIds = new Set([id]);
    selectedChannelId = null;
    isDirty = true;
  }

  function handleAddKeyframe() {
    if (!selectedChannelId) return;
    handleLaneDblClick(selectedChannelId, currentTimeMs);
  }

  function handleAddChannel() {
    const id = `ch-${channels.length + 1}`;
    const displayName = `Channel ${channels.length + 1}`;
    channels = [...channels, { id, displayName }];

    // Auto-insert black keyframe at 0:00:00
    const kfId = `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    keyframes = [
      ...keyframes,
      {
        id: kfId,
        channelId: id,
        timestampMs: 0,
        color: { r: 0, g: 0, b: 0 },
        brightness: 0,
        colorMode: 'RGB',
        colorTemperature: 2700,
        transitionMs: 0,
        interpolation: 'STEP',
        powerOn: false,
      },
    ];
    isDirty = true;
  }

  function handleKeyframeChange(field: string, value: unknown) {
    if (selectedKeyframeIds.size !== 1) return;
    const id = [...selectedKeyframeIds][0];
    keyframes = keyframes.map((kf) => (kf.id === id ? { ...kf, [field]: value } : kf));
    isDirty = true;
  }

  function handleMetadataChange(field: string, value: unknown) {
    trackMetadata = { ...trackMetadata, [field]: value };
    isDirty = true;
  }

  function handleKeyframeDrag(id: string, newTimestampMs: number) {
    keyframes = keyframes.map((kf) =>
      kf.id === id ? { ...kf, timestampMs: Math.max(0, Math.round(newTimestampMs)) } : kf
    );
    isDirty = true;
  }

  // Timeline zoom via wheel
  function handleTimelineWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      pixelsPerMs = Math.max(0.001, Math.min(10, pixelsPerMs * zoomFactor));

      const viewportDuration = (viewportEndMs - viewportStartMs) / zoomFactor;
      const center = (viewportStartMs + viewportEndMs) / 2;
      viewportStartMs = Math.max(0, center - viewportDuration / 2);
      viewportEndMs = Math.min(durationMs || 600000, center + viewportDuration / 2);
    } else {
      const scrollMs = (e.deltaX || e.deltaY) / pixelsPerMs;
      viewportStartMs = Math.max(0, viewportStartMs + scrollMs);
      viewportEndMs = viewportStartMs + (viewportEndMs - viewportStartMs);
    }
  }

  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === 'k' || e.key === 'K') {
      handleAddKeyframe();
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (isPlaying) handlePause();
      else handlePlay();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedKeyframeIds.size > 0) {
        keyframes = keyframes.filter((kf) => !selectedKeyframeIds.has(kf.id));
        selectedKeyframeIds = new Set();
        isDirty = true;
      }
      return;
    }
    if (e.key === 'l' || e.key === 'L') {
      overlayVisible = !overlayVisible;
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
  }
</script>

<svelte:head>
  <title>{projectName}{isDirty ? ' •' : ''} — OpenLightFX Studio</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="flex flex-col h-screen w-screen overflow-hidden">
  <!-- Menu Bar -->
  <MenuBar
    {projectName}
    {isDirty}
    onAddKeyframe={handleAddKeyframe}
  />

  <!-- Toolbar -->
  <Toolbar
    {snappingEnabled}
    {overlayVisible}
    onAddKeyframe={handleAddKeyframe}
    onAddChannel={handleAddChannel}
    onToggleSnapping={() => (snappingEnabled = !snappingEnabled)}
    onToggleOverlay={() => (overlayVisible = !overlayVisible)}
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
          bind:currentTime={currentTimeMs}
          bind:duration={durationMs}
          bind:isPlaying
          bind:playbackSpeed
          {overlayVisible}
          onloadedmetadata={handleVideoLoaded}
          ontimeupdate={(t) => (currentTimeMs = t)}
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
      currentTimeMs={currentTimeMs}
      {durationMs}
      {isPlaying}
      {playbackSpeed}
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
        playheadMs={currentTimeMs}
        {viewportStartMs}
        {viewportEndMs}
        {pixelsPerMs}
        {selectedKeyframeIds}
        {selectedEffectIds}
        {selectedChannelId}
        onseek={handleTimelineSeek}
        onkeyframeclick={handleKeyframeClick}
        onlanedblclick={handleLaneDblClick}
        onlaneclick={handleLaneClick}
        onkeyframedrag={handleKeyframeDrag}
      />

      <!-- Minimap -->
      <Minimap
        {durationMs}
        {viewportStartMs}
        {viewportEndMs}
        {sceneMarkers}
        onseek={handleTimelineSeek}
      />

      <!-- Effects Palette -->
      <EffectsPalette />
    </div>
  </div>
</div>
