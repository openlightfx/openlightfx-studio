<script lang="ts">
  import { Modal, Button, Select, Spinner } from '$lib/components/shared/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { SceneDetectionController } from '$lib/workers/scene-detection-controller.js';
  import type { SceneMarker } from '$lib/types/timeline.js';

  let open = $derived(uiStore.state.activeModal === 'scene-detection');
  const videoLoaded = $derived(videoStore.state.isLoaded);

  type Sensitivity = 'low' | 'medium' | 'high';
  type Phase = 'config' | 'detecting' | 'results';

  let sensitivity: Sensitivity = $state('medium');
  let phase: Phase = $state('config');
  let progress = $state(0);
  let markersFound = $state(0);
  let detectedMarkers: SceneMarker[] = $state([]);
  let errorMessage = $state('');

  let controller: SceneDetectionController | null = null;

  const sensitivityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];

  const sensitivityDescriptions: Record<Sensitivity, string> = {
    low: 'Detects only hard cuts and fade-to-black. Fewest markers, highest confidence.',
    medium: 'Balanced detection for most films. Catches clear scene changes.',
    high: 'Detects softer transitions and faster cuts. More markers, may include false positives.',
  };

  // Reset state when dialog opens
  $effect(() => {
    if (open) {
      phase = 'config';
      progress = 0;
      markersFound = 0;
      detectedMarkers = [];
      errorMessage = '';
    }
  });

  function handleStart() {
    const videoEl = document.querySelector('video') as HTMLVideoElement | null;
    if (!videoEl) {
      errorMessage = 'No video element found. Please load a video first.';
      return;
    }

    errorMessage = '';
    phase = 'detecting';
    progress = 0;
    markersFound = 0;

    controller = new SceneDetectionController();
    controller.start({
      video: videoEl,
      sensitivity,
      onProgress: (percent, found) => {
        progress = percent;
        markersFound = found;
      },
      onComplete: (markers) => {
        detectedMarkers = markers;
        markersFound = markers.length;
        phase = 'results';
        controller = null;
      },
      onError: (err) => {
        errorMessage = err;
        phase = 'config';
        controller = null;
      },
    });
  }

  function handleCancel() {
    if (controller) {
      controller.cancel();
      controller = null;
    }
    if (phase === 'detecting') {
      phase = 'config';
    } else {
      uiStore.closeModal();
    }
  }

  function handleAddToTimeline() {
    for (const marker of detectedMarkers) {
      projectStore.addSceneMarker(marker.timestampMs, marker.label, 'MARKER_AUTO_DETECTED');
    }
    uiStore.closeModal();
  }

  function handleClose() {
    if (controller) {
      controller.cancel();
      controller = null;
    }
    uiStore.closeModal();
  }
</script>

<Modal {open} title="Auto-Detect Scene Changes" onclose={handleClose}>
  <div class="flex flex-col gap-4">
    {#if phase === 'config'}
      <!-- Configuration -->
      <Select
        value={sensitivity}
        options={sensitivityOptions}
        label="Sensitivity"
        onchange={(v) => (sensitivity = v as Sensitivity)}
      />
      <p class="text-xs text-textMuted">{sensitivityDescriptions[sensitivity]}</p>

      {#if !videoLoaded}
        <div
          class="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          A video must be loaded before running scene detection.
        </div>
      {/if}

      {#if errorMessage}
        <div class="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errorMessage}
        </div>
      {/if}
    {:else if phase === 'detecting'}
      <!-- Progress -->
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <Spinner size="sm" />
          <span class="text-sm text-text-base">Analyzing video…</span>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-surface2">
          <div
            class="h-full rounded-full bg-accent transition-all"
            style="width: {progress}%"
          ></div>
        </div>
        <div class="flex justify-between text-xs text-textMuted">
          <span>{Math.round(progress)}% complete</span>
          <span>Markers found: {markersFound}</span>
        </div>
      </div>
    {:else if phase === 'results'}
      <!-- Results -->
      <div class="flex flex-col items-center gap-2 py-2 text-center">
        <span class="text-3xl">🎬</span>
        <p class="text-sm text-text-base">
          <strong>{detectedMarkers.length}</strong> scene marker{detectedMarkers.length !== 1
            ? 's'
            : ''} detected
        </p>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    {#if phase === 'config'}
      <Button variant="ghost" onclick={handleClose}>Cancel</Button>
      <Button variant="primary" onclick={handleStart} disabled={!videoLoaded}>
        Start Detection
      </Button>
    {:else if phase === 'detecting'}
      <Button variant="danger" onclick={handleCancel}>Cancel</Button>
    {:else if phase === 'results'}
      <Button variant="ghost" onclick={handleClose}>Discard</Button>
      <Button
        variant="primary"
        onclick={handleAddToTimeline}
        disabled={detectedMarkers.length === 0}
      >
        Add to Timeline
      </Button>
    {/if}
  {/snippet}
</Modal>
