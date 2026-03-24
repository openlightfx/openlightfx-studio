<script lang="ts">
  let {
    durationMs = 0,
    viewportStartMs = 0,
    viewportEndMs = 60000,
    sceneMarkers = [] as Array<{ id: string; timestampMs: number; label: string }>,
    onseek,
  }: {
    durationMs?: number;
    viewportStartMs?: number;
    viewportEndMs?: number;
    sceneMarkers?: Array<{ id: string; timestampMs: number; label: string }>;
    onseek?: (ms: number) => void;
  } = $props();

  let containerEl: HTMLDivElement;

  let viewportPercent = $derived(
    durationMs > 0
      ? {
          left: (viewportStartMs / durationMs) * 100,
          width: ((viewportEndMs - viewportStartMs) / durationMs) * 100,
        }
      : { left: 0, width: 100 }
  );

  function handleClick(e: MouseEvent) {
    if (!containerEl || durationMs <= 0) return;
    const rect = containerEl.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onseek?.(ratio * durationMs);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  bind:this={containerEl}
  class="h-5 bg-[var(--surface)] border-t border-[var(--surface2)] cursor-pointer relative"
  onclick={handleClick}
>
  <!-- Scene marker ticks -->
  {#each sceneMarkers as marker}
    {@const pos = durationMs > 0 ? (marker.timestampMs / durationMs) * 100 : 0}
    <div
      class="absolute top-0 bottom-0 w-px bg-warning/50"
      style="left: {pos}%"
    ></div>
  {/each}

  <!-- Viewport indicator -->
  <div
    class="absolute top-0 bottom-0 bg-accent/20 border-x border-accent/40"
    style="left: {viewportPercent.left}%; width: {viewportPercent.width}%"
  ></div>
</div>
