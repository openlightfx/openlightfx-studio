<script lang="ts">
  import type { SceneMarker, SceneMarkerType } from '$lib/types/index.js';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { TextInput, Button } from '$lib/components/shared/index.js';

  let {
    sceneMarkerId,
  }: {
    sceneMarkerId: string;
  } = $props();

  const marker = $derived(
    projectStore.project.file.sceneMarkers.find((m: SceneMarker) => m.id === sceneMarkerId)
  );

  const MARKER_TYPE_LABELS: Record<SceneMarkerType, string> = {
    MARKER_MANUAL: 'Manual',
    MARKER_AUTO_DETECTED: 'Auto-Detected',
    MARKER_CHAPTER: 'Chapter',
  };

  function formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.floor(ms % 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }

  function handleLabelChange(value: string) {
    if (!marker) return;
    // Scene markers are in the project file, update via store
    const markers = projectStore.project.file.sceneMarkers.map((m: SceneMarker) =>
      m.id === sceneMarkerId ? { ...m, label: value } : m
    );
    projectStore.project.file = { ...projectStore.project.file, sceneMarkers: markers };
  }

  function handleDelete() {
    if (!marker) return;
    projectStore.removeSceneMarker(sceneMarkerId);
  }
</script>

{#if marker}
  <div class="flex flex-col gap-4">
    <section class="flex flex-col gap-3">
      <TextInput
        value={marker.label}
        label="Label"
        placeholder="Scene marker label"
        oninput={handleLabelChange}
      />

      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-textMuted">Type</span>
        <span class="rounded-md border border-surface2 bg-surface2/50 px-3 py-1.5 text-sm text-text-base">
          {MARKER_TYPE_LABELS[marker.type] ?? marker.type}
        </span>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-textMuted">Timestamp</span>
        <span class="rounded-md border border-surface2 bg-surface2/50 px-3 py-1.5 text-sm font-mono text-text-base">
          {formatTimestamp(marker.timestampMs)}
        </span>
      </div>
    </section>

    <hr class="border-surface2" />

    <Button variant="danger" size="sm" onclick={handleDelete}>
      Delete Marker
    </Button>
  </div>
{:else}
  <p class="text-sm text-textMuted">Scene marker not found.</p>
{/if}
