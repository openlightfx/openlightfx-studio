<script lang="ts">
  import type { SceneMarker } from '$lib/domain';
  import type { StudioSession } from '$lib/studio/session.svelte';
  import { formatElapsedTime, parseElapsedTime } from '$lib/domain';
  let { session } = $props<{ session: StudioSession }>();
  // All of the movie's scene markers (detected and manual), stored by the plugin.
  const markers = $derived(session.sceneMarkers);
  let error = $state('');
  function updateTime(id: string, value: string) {
    const timeMs = parseElapsedTime(value);
    if (timeMs == null || timeMs > session.durationMs()) {
      error = 'Enter a marker time as hh:mm:ss.mmm inside the movie.';
      return;
    }
    error = '';
    session.updateMarker(id, { timeMs });
  }
</script>

<details class="markers">
  <summary>Scene markers ({markers.length})</summary>
  <div class="marker-tools">
    <button onclick={() => session.addMarker()}>Add marker at playhead</button>
    <button
      disabled={!markers.some((marker: SceneMarker) => marker.timeMs < session.playheadMs)}
      title="Navigate to the previous scene marker"
      onclick={() => session.navigateMarker(-1)}>Previous marker</button
    >
    <button
      disabled={!markers.some((marker: SceneMarker) => marker.timeMs > session.playheadMs)}
      title="Navigate to the next scene marker"
      onclick={() => session.navigateMarker(1)}>Next marker</button
    >
  </div>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if !markers.length}<p>No scene markers. Press M in the timeline to mark the playhead.</p>{/if}
  <ol aria-label="Scene markers">
    {#each markers as marker (marker.id)}
      <li class:selected={session.selectedMarkerId === marker.id}>
        <button
          aria-label={`Go to marker ${marker.label} at ${formatElapsedTime(marker.timeMs)}`}
          onclick={() => {
            session.selectedMarkerId = marker.id;
            session.seek(marker.timeMs);
            session.revealNavigationPosition(marker.timeMs);
          }}>Go</button
        >
        <label
          >Name <input
            aria-label={`Marker name ${marker.id}`}
            value={marker.label}
            placeholder={marker.kind === 'detected' ? 'Scene transition' : 'Scene marker'}
            onchange={(event) =>
              session.updateMarker(marker.id, { label: event.currentTarget.value })}
          /></label
        >
        <label
          >Time <input
            aria-label={`Marker time ${marker.id}`}
            value={formatElapsedTime(marker.timeMs)}
            onchange={(event) => updateTime(marker.id, event.currentTarget.value)}
          /></label
        >
        <span>{marker.kind}</span>
        <button
          aria-label={`Delete marker ${marker.label}`}
          onclick={() => session.deleteMarker(marker.id)}>Delete</button
        >
      </li>
    {/each}
  </ol>
</details>

<style>
  .markers {
    flex: 0 0 auto;
    max-height: 180px;
    overflow: auto;
    border-bottom: 1px solid var(--border);
  }
  summary {
    cursor: pointer;
    padding: 6px 0;
  }
  .marker-tools,
  li,
  label {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  ol {
    margin: 8px 0;
    padding: 0;
    list-style: none;
  }
  li {
    padding: 4px;
  }
  li.selected {
    background: var(--surface-raised, var(--surface));
    border-left: 2px solid var(--accent);
  }
  input {
    max-width: 180px;
  }
  p,
  span {
    color: var(--text-secondary);
    font-size: 12px;
  }
</style>
