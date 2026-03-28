<script lang="ts">
  import AppShell from '$lib/components/app/AppShell.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { uiStore } from '$lib/stores/ui.svelte.js';
  import { PROJECT_FORMAT_VERSION, DEFAULT_UI_STATE } from '$lib/types/project.js';
  import { generateId } from '$lib/services/id.js';

  // Bootstrap a blank project on first load so stores aren't null.
  if (!projectStore.file) {
    projectStore.load({
      formatVersion: PROJECT_FORMAT_VERSION,
      projectId: generateId(),
      track: {
        version: 1,
        metadata: {
          title: 'Untitled Project',
          description: '',
          movieReference: { imdbId: '', title: '', year: 0, runtimeMinutes: 0 },
          author: '',
          tags: [],
          durationMs: 0,
          startBehavior: 'BOUNDARY_UNSPECIFIED',
          endBehavior: 'BOUNDARY_UNSPECIFIED',
          preshowDurationMs: 0,
          preshowState: 'PRESHOW_UNSPECIFIED',
          creditsStartMs: 0,
          creditsBehavior: 'CREDITS_UNSPECIFIED',
          trackVersion: '1.0.0',
        },
        channels: [],
        keyframes: [],
        effectKeyframes: [],
        safetyInfo: {
          containsFlashing: false,
          containsStrobing: false,
          maxFlashFrequencyHz: 0,
          maxBrightnessDelta: 0,
          warningText: '',
          intensityRating: 'INTENSITY_UNSPECIFIED',
        },
      },
      channelGroups: [],
      sceneMarkers: [],
      undoHistory: [],
      undoPointer: -1,
      uiState: { ...DEFAULT_UI_STATE },
      videoFilePath: '',
      candidateMetadata: {},
      lastModified: new Date().toISOString(),
    });
  }
</script>

<AppShell
  saveProviderName="Local"
  onnewproject={() => uiStore.openModal('new-project')}
  oncommandpalette={() => {/* TODO Task 21: command palette */}}
/>
