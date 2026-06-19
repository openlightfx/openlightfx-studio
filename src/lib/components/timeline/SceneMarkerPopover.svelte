<script lang="ts">
  import Popover from '$lib/components/shared/Popover.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { DeleteSceneMarkerCommand } from '$lib/commands/delete-scene-marker.js';

  let {
    anchorRect,
    onclose,
    markerId,
  }: {
    anchorRect: { x: number; y: number; width: number; height: number };
    onclose: () => void;
    markerId: string;
  } = $props();

  const marker = $derived(
    projectStore.file?.sceneMarkers.find((m) => m.id === markerId) ?? null
  );

  let editLabel = $state(
    projectStore.file?.sceneMarkers.find((m) => m.id === markerId)?.label ?? ''
  );

  $effect(() => {
    editLabel = marker?.label ?? '';
  });

  function handleDelete(): void {
    if (!marker) return;
    undoStore.execute(new DeleteSceneMarkerCommand(marker.id, projectStore));
    onclose();
  }

  function handleLabelChange(): void {
    if (!marker || editLabel === marker.label) return;
    const m = projectStore.file?.sceneMarkers.find((sm) => sm.id === marker.id);
    if (m) {
      m.label = editLabel;
      projectStore.markDirty();
    }
  }

  function markerTypeLabel(type: string): string {
    if (type === 'MARKER_MANUAL') return 'Manual';
    if (type === 'MARKER_CHAPTER') return 'Chapter';
    return 'Auto-detected';
  }
</script>

{#if marker}
  <Popover {anchorRect} {onclose}>
    <div class="space-y-3 min-w-[14rem]">
      <div class="flex items-center justify-between">
        <span class="text-xs text-textMuted uppercase tracking-wider">
          {markerTypeLabel(marker.type)}
        </span>
        <span class="text-xs text-textMuted">
          {Math.round(marker.timestampMs / 1000)}s
        </span>
      </div>

      <div>
        <label for="sm-label" class="block text-xs text-textMuted mb-1">Label</label>
        <input
          id="sm-label"
          type="text"
          class="w-full px-3 py-2 bg-surface2 border border-surface3 rounded text-sm text-text-base"
          bind:value={editLabel}
          onblur={handleLabelChange}
        />
      </div>

      <div class="flex justify-end pt-2 border-t border-surface3">
        <Button variant="danger" size="sm" onclick={handleDelete}>
          Delete Marker
        </Button>
      </div>
    </div>
  </Popover>
{/if}
