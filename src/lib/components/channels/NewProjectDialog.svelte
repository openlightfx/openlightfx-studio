<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import TextInput from '$lib/components/shared/TextInput.svelte';
  import ChannelTemplateSelector from './ChannelTemplateSelector.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { toastStore } from '$lib/stores/toast.svelte.js';
  import { newProject } from '$lib/services/project-io.js';
  import { probeVideo } from '$lib/services/frame-extractor.js';
  import {
    detectScenes,
    type SceneDetectionSensitivity,
    type SceneDetectionProgress,
  } from '$lib/services/scene-detection.js';
  import { SUPPORTED_VIDEO_TYPES } from '$lib/types/video.js';
  import type { VideoProbeResult } from '$lib/types/video.js';
  import type { ChannelTemplate } from '$lib/types/channels.js';
  import type { SceneMarker } from '$lib/types/timeline.js';

  let {
    isOpen = $bindable(),
  }: {
    isOpen: boolean;
  } = $props();

  // --- Wizard state ---
  type Step = 'name' | 'video' | 'scenes' | 'channels' | 'metadata';
  const ALL_STEPS: Step[] = ['name', 'video', 'scenes', 'channels', 'metadata'];

  let currentStep = $state<Step>('name');

  // Step 1: Project name
  let projectName = $state('');
  let nameError = $state('');

  // Step 2: Video file
  let videoFile = $state<File | null>(null);
  let videoObjectUrl = $state<string | null>(null);
  let isDragOver = $state(false);
  let isProbing = $state(false);
  let probeResult = $state<VideoProbeResult | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  // Step 3: Scene detection
  let sensitivity = $state<SceneDetectionSensitivity>('medium');
  let isDetecting = $state(false);
  let detectionProgress = $state<SceneDetectionProgress | null>(null);
  let detectedMarkers = $state<SceneMarker[]>([]);
  let abortController: AbortController | null = null;
  let detectionVideoEl: HTMLVideoElement | null = null;

  const progressPct = $derived(
    detectionProgress
      ? Math.round((detectionProgress.currentMs / detectionProgress.totalMs) * 100)
      : 0
  );

  // Step 4: Channel template
  let selectedTemplate = $state<ChannelTemplate | null>(null);

  // Step 5: Metadata
  let author = $state('');
  let description = $state('');
  let imdbId = $state('');

  // --- Derived ---
  const visibleSteps = $derived<Step[]>(
    videoFile ? ALL_STEPS : ALL_STEPS.filter((s) => s !== 'scenes')
  );

  const currentStepIndex = $derived(visibleSteps.indexOf(currentStep));
  const isFirstStep = $derived(currentStepIndex === 0);
  const isLastStep = $derived(currentStepIndex === visibleSteps.length - 1);

  const stepLabels: Record<Step, string> = {
    name: 'Project Name',
    video: 'Video File',
    scenes: 'Scene Detection',
    channels: 'Channel Layout',
    metadata: 'Details',
  };

  // --- Navigation ---
  function goNext(): void {
    if (currentStep === 'name' && !projectName.trim()) {
      nameError = 'Project name is required';
      return;
    }
    nameError = '';

    if (isLastStep) {
      handleCreate();
      return;
    }
    currentStep = visibleSteps[currentStepIndex + 1];
  }

  function goBack(): void {
    if (isFirstStep) return;
    currentStep = visibleSteps[currentStepIndex - 1];
  }

  function goToStep(step: Step): void {
    const targetIndex = visibleSteps.indexOf(step);
    // Only allow going back to completed steps
    if (targetIndex < currentStepIndex) {
      currentStep = step;
    }
  }

  // --- Video handling ---
  function handleFileInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) loadVideo(file);
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    isDragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) loadVideo(file);
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave(): void {
    isDragOver = false;
  }

  async function loadVideo(file: File): Promise<void> {
    if (!SUPPORTED_VIDEO_TYPES.includes(file.type)) {
      toastStore.error(`Unsupported file type: ${file.type || file.name}. Use MP4, WebM, or MKV.`);
      return;
    }

    // Clean up previous
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    detectedMarkers = [];

    videoFile = file;
    videoObjectUrl = URL.createObjectURL(file);
    isProbing = true;

    try {
      const result = await probeVideo(file);
      probeResult = result;
      if (result.durationMs > 0) {
        videoStore.durationMs = result.durationMs;
      }
    } catch {
      // Non-fatal — probe is optional
    } finally {
      isProbing = false;
    }
  }

  function removeVideo(): void {
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    videoFile = null;
    videoObjectUrl = null;
    probeResult = null;
    detectedMarkers = [];
    // If we're on the scenes step, go back to video
    if (currentStep === 'scenes') {
      currentStep = 'video';
    }
  }

  // --- Scene detection ---
  async function handleDetect(): Promise<void> {
    if (!videoFile || !videoObjectUrl) return;
    isDetecting = true;
    abortController = new AbortController();
    detectedMarkers = [];

    // Create a temporary video element for detection
    detectionVideoEl = document.createElement('video');
    detectionVideoEl.src = videoObjectUrl;
    detectionVideoEl.muted = true;
    detectionVideoEl.preload = 'auto';

    try {
      await new Promise<void>((resolve, reject) => {
        detectionVideoEl!.onloadeddata = () => resolve();
        detectionVideoEl!.onerror = () => reject(new Error('Failed to load video for detection'));
      });

      const durationMs = detectionVideoEl.duration * 1000;
      const result = await detectScenes(
        detectionVideoEl,
        durationMs,
        sensitivity,
        (p) => {
          detectionProgress = p;
        },
        abortController.signal
      );
      detectedMarkers = result.markers;

      if (result.markers.length > 0) {
        toastStore.success(`Detected ${result.markers.length} scene changes`);
      } else {
        toastStore.info('No scene changes detected');
      }
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        toastStore.error(
          `Scene detection failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } finally {
      isDetecting = false;
      detectionProgress = null;
      abortController = null;
      if (detectionVideoEl) {
        detectionVideoEl.src = '';
        detectionVideoEl = null;
      }
    }
  }

  function handleCancelDetection(): void {
    abortController?.abort();
  }

  function formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  // --- Project creation ---
  function handleCreate(): void {
    if (!selectedTemplate) return;

    const project = newProject(selectedTemplate.channels);

    // Apply metadata
    project.track.metadata.title = projectName.trim();
    if (author.trim()) project.track.metadata.author = author.trim();
    if (description.trim()) project.track.metadata.description = description.trim();
    if (imdbId.trim()) project.track.metadata.movieReference.imdbId = imdbId.trim();

    // Add detected scene markers
    for (const marker of detectedMarkers) {
      project.sceneMarkers.push(marker);
    }

    // Load the project
    projectStore.load(project);
    undoStore.clear();

    // Load video if provided
    if (videoFile && videoObjectUrl) {
      projectStore.setVideoFile(videoFile);
      videoStore.loadFile(videoFile, videoObjectUrl);
      if (probeResult) {
        videoStore.applyProbeResult(probeResult);
      }
      // Don't revoke URL — it's now owned by projectStore
      videoObjectUrl = null;
    }

    isOpen = false;
    uiStore.closeModal();
    resetWizard();
  }

  function handleManual(): void {
    isOpen = false;
    uiStore.openModal('channel-template');
  }

  function handleClose(): void {
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    isOpen = false;
    resetWizard();
  }

  function resetWizard(): void {
    currentStep = 'name';
    projectName = '';
    nameError = '';
    videoFile = null;
    videoObjectUrl = null;
    isDragOver = false;
    isProbing = false;
    probeResult = null;
    sensitivity = 'medium';
    isDetecting = false;
    detectionProgress = null;
    detectedMarkers = [];
    selectedTemplate = null;
    author = '';
    description = '';
    imdbId = '';
  }
</script>

{#if isOpen}
  <Modal title="New Project" onclose={handleClose} wide>
    <!-- Step indicator -->
    <div class="flex items-center gap-1 mb-6">
      {#each visibleSteps as step, i (step)}
        <button
          class="flex items-center gap-1.5 text-xs transition-colors"
          class:text-accent={step === currentStep}
          class:text-text-base={i < currentStepIndex}
          class:text-textMuted={i > currentStepIndex}
          class:cursor-pointer={i < currentStepIndex}
          class:cursor-default={i >= currentStepIndex}
          onclick={() => goToStep(step)}
          disabled={i >= currentStepIndex}
        >
          <span
            class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border transition-colors {step ===
            currentStep
              ? 'bg-accent text-white border-accent'
              : i < currentStepIndex
                ? 'bg-accent/20 text-accent border-accent'
                : 'border-surface3'}"
          >
            {#if i < currentStepIndex}
              &#10003;
            {:else}
              {i + 1}
            {/if}
          </span>
          <span class="hidden sm:inline">{stepLabels[step]}</span>
        </button>
        {#if i < visibleSteps.length - 1}
          <div
            class="flex-1 h-px mx-1 {i < currentStepIndex ? 'bg-accent/40' : 'bg-surface3'}"
          ></div>
        {/if}
      {/each}
    </div>

    <!-- Step content -->
    <div class="min-h-[16rem]">
      {#if currentStep === 'name'}
        <div class="flex flex-col gap-4 max-w-md">
          <p class="text-sm text-textMuted">
            Give your lighting project a name. This will be saved as the track title.
          </p>
          <TextInput
            label="Project Name"
            bind:value={projectName}
            placeholder="e.g. Blade Runner 2049"
            error={nameError}
          />
        </div>
      {:else if currentStep === 'video'}
        <div class="flex flex-col gap-4">
          <p class="text-sm text-textMuted">
            Select a video file to design your lighting around. You can also add one later.
          </p>

          {#if videoFile}
            <div
              class="rounded-xl border border-surface3 bg-surface2 p-4 flex items-center justify-between"
            >
              <div class="flex flex-col gap-1">
                <span class="text-sm text-text-base font-medium">{videoFile.name}</span>
                <span class="text-xs text-textMuted">
                  {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                  {#if isProbing}&mdash; analyzing...{/if}
                </span>
              </div>
              <Button variant="ghost" size="sm" onclick={removeVideo}>Remove</Button>
            </div>
          {:else}
            <div
              class="rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer {isDragOver
                ? 'border-accent bg-accent/5'
                : 'border-surface3'}"
              role="button"
              tabindex="0"
              ondragover={handleDragOver}
              ondragleave={handleDragLeave}
              ondrop={handleDrop}
              onclick={() => fileInputEl?.click()}
              onkeydown={(e) => {
                if (e.key === 'Enter') fileInputEl?.click();
              }}
            >
              <div class="flex flex-col items-center gap-2">
                <svg
                  class="w-8 h-8 text-textMuted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
                <span class="text-sm text-textMuted">
                  Drop a video file here or click to browse
                </span>
                <span class="text-xs text-textMuted">MP4, WebM, or MKV</span>
              </div>
            </div>
            <input
              bind:this={fileInputEl}
              type="file"
              accept="video/mp4,video/webm,video/x-matroska"
              class="hidden"
              onchange={handleFileInput}
            />
          {/if}
        </div>
      {:else if currentStep === 'scenes'}
        <div class="flex flex-col gap-4">
          {#if !isDetecting}
            <p class="text-sm text-textMuted">
              Analyze the video to automatically detect scene changes and place markers on the
              timeline.
            </p>

            <div>
              <label for="wizard-sensitivity" class="block text-xs text-textMuted mb-1"
                >Sensitivity</label
              >
              <select
                id="wizard-sensitivity"
                class="w-full bg-surface2 text-text-base rounded-lg px-3 py-2 text-sm border border-surface3 focus:outline-none focus:ring-2 focus:ring-accent/50"
                bind:value={sensitivity}
              >
                <option value="low">Low — fewer, more obvious cuts</option>
                <option value="medium">Medium — balanced detection</option>
                <option value="high">High — more markers, may include gradual transitions</option>
              </select>
            </div>

            {#if detectedMarkers.length > 0}
              <div class="rounded-xl border border-surface3 bg-surface2 p-3">
                <p class="text-xs text-textMuted mb-2">
                  {detectedMarkers.length} scene markers detected
                </p>
                <div class="flex flex-wrap gap-1">
                  {#each detectedMarkers.slice(0, 20) as marker (marker.id)}
                    <span class="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">
                      {formatTimestamp(marker.timestampMs)}
                    </span>
                  {/each}
                  {#if detectedMarkers.length > 20}
                    <span class="text-xs text-textMuted">
                      +{detectedMarkers.length - 20} more
                    </span>
                  {/if}
                </div>
              </div>
            {/if}

            <Button variant="secondary" size="sm" onclick={handleDetect}>
              {detectedMarkers.length > 0 ? 'Re-detect Scenes' : 'Detect Scenes'}
            </Button>
          {:else}
            <div class="space-y-3">
              <div class="flex items-center justify-between text-sm">
                <span class="text-textMuted">Analyzing frames...</span>
                <span class="text-text-base">{progressPct}%</span>
              </div>
              <div class="w-full bg-surface3 rounded-full h-2">
                <div
                  class="bg-accent h-2 rounded-full transition-all"
                  style="width: {progressPct}%"
                ></div>
              </div>
              {#if detectionProgress}
                <p class="text-xs text-textMuted">
                  {detectionProgress.markersFound} scene changes found so far
                </p>
              {/if}
              <Button variant="ghost" size="sm" onclick={handleCancelDetection}>Cancel</Button>
            </div>
          {/if}
        </div>
      {:else if currentStep === 'channels'}
        <ChannelTemplateSelector
          bind:selected={selectedTemplate}
          onselect={(t) => {
            selectedTemplate = t;
          }}
          onmanual={handleManual}
        />
      {:else if currentStep === 'metadata'}
        <div class="flex flex-col gap-4 max-w-md">
          <p class="text-sm text-textMuted">
            Optional details about your project. You can fill these in later.
          </p>
          <TextInput label="Author" bind:value={author} placeholder="Your name" />
          <div class="flex flex-col gap-1">
            <label for="wizard-description" class="text-xs text-textMuted">Description</label>
            <textarea
              id="wizard-description"
              class="bg-surface2 text-text-base rounded-lg px-3 py-2 text-sm border border-surface3 focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[80px] resize-y"
              bind:value={description}
              placeholder="A brief description of this lighting track"
            ></textarea>
          </div>
          <TextInput label="IMDB ID" bind:value={imdbId} placeholder="e.g. tt1856101" />
        </div>
      {/if}
    </div>

    <!-- Navigation -->
    <div class="flex justify-between items-center pt-4 mt-4 border-t border-surface3">
      <div>
        {#if !isFirstStep}
          <Button variant="ghost" size="sm" onclick={goBack}>Back</Button>
        {/if}
      </div>
      <div class="flex gap-2">
        {#if currentStep === 'video' && !videoFile}
          <Button variant="ghost" size="sm" onclick={goNext}>Skip</Button>
        {:else if currentStep === 'scenes' && !isDetecting}
          <Button variant="ghost" size="sm" onclick={goNext}>
            {detectedMarkers.length > 0 ? 'Next' : 'Skip'}
          </Button>
        {:else if currentStep === 'metadata'}
          <Button variant="primary" size="sm" onclick={handleCreate} disabled={!selectedTemplate}>
            Create Project
          </Button>
        {:else}
          <Button
            variant="primary"
            size="sm"
            onclick={goNext}
            disabled={currentStep === 'name'
              ? !projectName.trim()
              : currentStep === 'channels'
                ? !selectedTemplate
                : false}
          >
            Next
          </Button>
        {/if}
      </div>
    </div>
  </Modal>
{/if}
