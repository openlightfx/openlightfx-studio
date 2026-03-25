<script lang="ts">
  import { Modal, Button, TextInput, Badge } from '$lib/components/shared/index.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { toastStore } from '$lib/stores/toast.svelte.js';
  import { CHANNEL_TEMPLATES } from '$lib/types/index.js';
  import type { ChannelTemplate } from '$lib/types/index.js';

  let open = $derived(uiStore.state.activeModal === 'new-project');

  // Wizard state
  let step = $state(0);
  const totalSteps = 3;

  // Step 1 — Project & Movie Info
  let projectName = $state('');
  let authorName = $state('');
  let movieTitle = $state('');
  let movieYear = $state('');
  let imdbId = $state('');

  // Step 2 — Video
  let videoFile = $state<File | null>(null);

  // Step 3 — Channel Layout
  let selectedTemplateIndex = $state<number | null>(2); // Default: Stereo + Ambient

  const isFirst = $derived(step === 0);
  const isLast = $derived(step === totalSteps - 1);

  const projectNameError = $derived(step === 0 && projectName.trim() === '' ? '' : undefined);

  function canAdvance(): boolean {
    if (step === 0) return projectName.trim().length > 0;
    return true;
  }

  function handleNext() {
    if (!canAdvance()) return;
    if (isLast) {
      handleCreate();
    } else {
      step += 1;
    }
  }

  function handleBack() {
    if (step > 0) step -= 1;
  }

  function handleClose() {
    uiStore.closeModal();
    resetState();
  }

  function resetState() {
    step = 0;
    projectName = '';
    authorName = '';
    movieTitle = '';
    movieYear = '';
    imdbId = '';
    videoFile = null;
    selectedTemplateIndex = 2;
  }

  function handleCreate() {
    // 1. Create fresh project
    projectStore.newProject();

    // 2. Set metadata
    const year = movieYear ? parseInt(movieYear, 10) : 0;
    projectStore.updateMetadata({
      title: projectName.trim(),
      author: authorName.trim(),
      movieReference: {
        title: movieTitle.trim(),
        year: isNaN(year) ? 0 : year,
        imdbId: imdbId.trim(),
        runtimeMinutes: 0,
      },
    });

    // 3. Load video if selected
    if (videoFile) {
      videoStore.loadFile(videoFile);
    }

    // 4. Create channels from template
    if (selectedTemplateIndex !== null) {
      const template = CHANNEL_TEMPLATES[selectedTemplateIndex];
      for (const ch of template.channels) {
        projectStore.addChannel({
          displayName: ch.displayName,
          spatialHint: ch.spatialHint,
        });
      }
    }

    toastStore.success(`Project "${projectName.trim()}" created`);
    uiStore.closeModal();
    resetState();
  }

  // Video file picker
  function pickVideoFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,.mp4,.mkv,.webm,.mov,.avi';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) videoFile = file;
    };
    input.click();
  }

  function clearVideoFile() {
    videoFile = null;
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function spatialLabel(hint: string): string {
    const map: Record<string, string> = {
      SPATIAL_LEFT: 'L',
      SPATIAL_RIGHT: 'R',
      SPATIAL_CENTER: 'C',
      SPATIAL_SURROUND_LEFT: 'SL',
      SPATIAL_SURROUND_RIGHT: 'SR',
      SPATIAL_AMBIENT: 'AMB',
      SPATIAL_CEILING: 'CEIL',
      SPATIAL_FLOOR: 'FLR',
      SPATIAL_BEHIND_SCREEN: 'BHS',
    };
    return map[hint] ?? '';
  }
</script>

<Modal {open} title="New Project" onclose={handleClose} size="lg">
  <div class="flex flex-col gap-4">
    <!-- Step indicator -->
    <div class="flex items-center justify-center gap-2">
      {#each { length: totalSteps } as _, i}
        <div
          class="h-1.5 w-8 rounded-full transition-colors {i === step
            ? 'bg-accent'
            : i < step
              ? 'bg-accent/40'
              : 'bg-surface2'}"
        ></div>
      {/each}
    </div>

    <!-- Step labels -->
    <div class="flex justify-center">
      <span class="text-xs text-textMuted">
        {#if step === 0}
          Project Details
        {:else if step === 1}
          Video File
        {:else}
          Channel Layout
        {/if}
      </span>
    </div>

    <!-- Step content -->
    {#if step === 0}
      <!-- Step 1: Project & Movie Info -->
      <div class="flex flex-col gap-3">
        <TextInput
          value={projectName}
          label="Project Name"
          placeholder="My Movie Lighting Track"
          oninput={(v) => (projectName = v)}
          error={projectName.trim() === '' ? 'Required' : undefined}
        />
        <TextInput
          value={authorName}
          label="Author"
          placeholder="Your name"
          oninput={(v) => (authorName = v)}
        />
        <div class="mt-2 border-t border-surface2 pt-3">
          <p class="mb-2 text-xs font-medium text-textMuted">Movie Reference (optional)</p>
          <div class="flex flex-col gap-3">
            <TextInput
              value={movieTitle}
              label="Movie Title"
              placeholder="e.g. Blade Runner 2049"
              oninput={(v) => (movieTitle = v)}
            />
            <div class="grid grid-cols-2 gap-3">
              <TextInput
                value={movieYear}
                label="Year"
                placeholder="e.g. 2017"
                type="number"
                oninput={(v) => (movieYear = v)}
              />
              <TextInput
                value={imdbId}
                label="IMDb ID"
                placeholder="e.g. tt1856101"
                oninput={(v) => (imdbId = v)}
              />
            </div>
          </div>
        </div>
      </div>
    {:else if step === 1}
      <!-- Step 2: Video File -->
      <div class="flex flex-col items-center gap-4 py-4">
        {#if videoFile}
          <div
            class="flex w-full items-center gap-3 rounded-md border border-surface2 bg-surface2/50 px-4 py-3"
          >
            <span class="text-2xl" aria-hidden="true">🎥</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-text-base">{videoFile.name}</p>
              <p class="text-xs text-textMuted">{formatFileSize(videoFile.size)}</p>
            </div>
            <button
              class="text-xs text-textMuted transition-colors hover:text-danger"
              onclick={clearVideoFile}
              title="Remove video"
            >
              ✕
            </button>
          </div>
          <Button variant="secondary" onclick={pickVideoFile}>Choose Different File</Button>
        {:else}
          <div class="flex flex-col items-center gap-3 py-6">
            <svg
              class="h-12 w-12 text-textMuted/40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path
                d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z"
              />
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-sm text-textMuted">No video selected</p>
            <Button variant="primary" onclick={pickVideoFile}>Select Video File</Button>
            <p class="text-xs text-textMuted/60">You can also add a video later</p>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Step 3: Channel Layout -->
      <div class="grid grid-cols-2 gap-2">
        {#each CHANNEL_TEMPLATES as template, i (template.name)}
          <button
            class="flex flex-col gap-1.5 rounded-md border p-3 text-left transition-colors
              {selectedTemplateIndex === i
              ? 'border-accent bg-accent/10'
              : 'border-surface2 hover:border-surface3 hover:bg-surface2/50'}"
            onclick={() => (selectedTemplateIndex = i)}
          >
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-text-base">{template.name}</span>
            </div>
            <p class="text-xs text-textMuted">{template.description}</p>
            <div class="flex flex-wrap gap-1">
              {#each template.channels as ch (ch.id)}
                <Badge text="{ch.displayName} ({spatialLabel(ch.spatialHint)})" />
              {/each}
            </div>
          </button>
        {/each}

        <!-- No channels option -->
        <button
          class="flex flex-col gap-1.5 rounded-md border p-3 text-left transition-colors
            {selectedTemplateIndex === null
            ? 'border-accent bg-accent/10'
            : 'border-surface2 hover:border-surface3 hover:bg-surface2/50'}"
          onclick={() => (selectedTemplateIndex = null)}
        >
          <span class="text-sm font-medium text-text-base">No Channels</span>
          <p class="text-xs text-textMuted">
            Start with an empty project and add channels manually
          </p>
        </button>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <Button variant="ghost" onclick={handleClose}>Cancel</Button>
    <div class="flex-1"></div>
    {#if !isFirst}
      <Button variant="secondary" onclick={handleBack}>Back</Button>
    {/if}
    {#if isLast}
      <Button variant="primary" onclick={handleNext}>Create Project</Button>
    {:else}
      <Button variant="primary" onclick={handleNext} disabled={!canAdvance()}>
        {step === 1 && !videoFile ? 'Skip' : 'Next'}
      </Button>
    {/if}
  {/snippet}
</Modal>
