<script lang="ts">
  import Modal from '$lib/components/shared/Modal.svelte';
  import Button from '$lib/components/shared/Button.svelte';
  import { projectStore } from '$lib/stores/project.svelte.js';
  import { videoStore } from '$lib/stores/video.svelte.js';
  import { undoStore } from '$lib/stores/undo.svelte.js';
  import { toastStore } from '$lib/stores/toast.svelte.js';
  import { detectScenes, type SceneDetectionSensitivity, type SceneDetectionProgress } from '$lib/services/scene-detection.js';
  import { AddSceneMarkerCommand } from '$lib/commands/add-scene-marker.js';
  import { CompositeCommand } from '$lib/commands/composite.js';

  let { onclose }: { onclose: () => void } = $props();

  let sensitivity = $state<SceneDetectionSensitivity>('medium');
  let isRunning = $state(false);
  let progress = $state<SceneDetectionProgress | null>(null);
  let abortController: AbortController | null = null;

  const progressPct = $derived(
    progress ? Math.round((progress.currentMs / progress.totalMs) * 100) : 0
  );

  async function handleDetect(): Promise<void> {
    if (!videoStore.element || !projectStore.file) return;
    isRunning = true;
    abortController = new AbortController();

    try {
      const result = await detectScenes(
        videoStore.element,
        videoStore.durationMs,
        sensitivity,
        (p) => { progress = p; },
        abortController.signal,
      );

      if (result.markers.length > 0) {
        const cmds = result.markers.map((m) => new AddSceneMarkerCommand(m, projectStore));
        undoStore.execute(new CompositeCommand(`Add ${result.markers.length} scene markers`, cmds));
        toastStore.success(`Detected ${result.markers.length} scene changes`);
      } else {
        toastStore.info('No scene changes detected');
      }
      onclose();
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        toastStore.error(`Scene detection failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      isRunning = false;
      progress = null;
      abortController = null;
    }
  }

  function handleCancel(): void {
    abortController?.abort();
  }
</script>

<Modal title="Scene Detection" {onclose}>
  <div class="space-y-4 min-w-[24rem]">
    {#if !isRunning}
      <p class="text-sm text-textMuted">
        Analyze the video to automatically detect scene changes and place markers on the timeline.
      </p>

      <div>
        <label for="scene-sensitivity" class="block text-xs text-textMuted mb-1">Sensitivity</label>
        <select
          id="scene-sensitivity"
          class="w-full bg-surface2 text-text-base rounded-lg px-3 py-2 text-sm border border-surface3 focus:outline-none focus:ring-2 focus:ring-accent/50"
          bind:value={sensitivity}
        >
          <option value="low">Low — fewer, more obvious cuts</option>
          <option value="medium">Medium — balanced detection</option>
          <option value="high">High — more markers, may include gradual transitions</option>
        </select>
      </div>

      <div class="flex justify-end gap-2 pt-2 border-t border-surface3">
        <Button variant="ghost" size="sm" onclick={onclose}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!videoStore.isLoaded}
          onclick={handleDetect}
        >
          Detect Scenes
        </Button>
      </div>
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

        {#if progress}
          <p class="text-xs text-textMuted">{progress.markersFound} scene changes found so far</p>
        {/if}

        <div class="flex justify-end pt-2 border-t border-surface3">
          <Button variant="ghost" size="sm" onclick={handleCancel}>Cancel</Button>
        </div>
      </div>
    {/if}
  </div>
</Modal>
