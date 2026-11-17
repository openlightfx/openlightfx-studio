<script lang="ts">
  import type { StudioSession } from '$lib/studio/session.svelte';
  import { formatElapsedTime, parseElapsedTime } from '$lib/domain';
  let { session } = $props<{ session: StudioSession }>();
  let error = $state('');
  function update(boundary: 'startMs' | 'endMs', raw: string) {
    const timeMs = parseElapsedTime(raw);
    if (timeMs == null || timeMs > session.durationMs()) {
      error = 'Enter a boundary as hh:mm:ss.mmm inside the movie.';
      return;
    }
    error = '';
    session.setRangeBoundary(boundary, timeMs);
  }
</script>

<details class="range">
  <summary>Audition range{session.auditionRange.loop ? ' · Loop on' : ''}</summary>
  <div class="audition" aria-label="Audition range" role="group">
    <button onclick={() => session.setRangeBoundary('startMs')}>Set range start</button>
    <label
      >Start <input
        aria-label="Range start"
        placeholder="hh:mm:ss.mmm"
        value={session.auditionRange.startMs == null
          ? ''
          : formatElapsedTime(session.auditionRange.startMs)}
        onchange={(event) => update('startMs', event.currentTarget.value)}
      /></label
    >
    <button onclick={() => session.setRangeBoundary('endMs')}>Set range end</button>
    <label
      >End <input
        aria-label="Range end"
        placeholder="hh:mm:ss.mmm"
        value={session.auditionRange.endMs == null
          ? ''
          : formatElapsedTime(session.auditionRange.endMs)}
        onchange={(event) => update('endMs', event.currentTarget.value)}
      /></label
    >
    <button
      aria-pressed={session.auditionRange.loop}
      disabled={Boolean(session.loopReason)}
      title={session.loopReason || 'Loop playback within the audition range'}
      onclick={() => session.toggleLoop()}>Loop</button
    >
    <button
      onclick={() => {
        error = '';
        session.clearRange();
      }}>Clear range</button
    >
    {#if error}<span role="alert">{error}</span>{:else if session.loopReason}<span
        >{session.loopReason}</span
      >{/if}
  </div>
</details>

<style>
  .range {
    flex: 0 0 auto;
    max-height: 160px;
    overflow: auto;
  }
  summary {
    cursor: pointer;
    padding: 6px 0;
  }
  .audition,
  label {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .audition {
    padding: 4px 0;
    flex: 0 0 auto;
  }
  input {
    width: 130px;
    max-width: 100%;
  }
  span {
    font-size: 12px;
    color: var(--text-secondary);
  }
</style>
