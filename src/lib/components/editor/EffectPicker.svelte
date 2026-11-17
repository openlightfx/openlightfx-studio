<script lang="ts">
  import { filterEffectPresets, type Channel } from '$lib/domain';
  import type { StudioSession } from '$lib/studio/session.svelte';

  let { session } = $props<{ session: StudioSession }>();
  let query = $state('');
  let active = $state(0);
  const matches = $derived(filterEffectPresets(query));

  function choose(index = active) {
    const preset = matches[index];
    if (!preset) return;
    session.addEffect(preset.type, { channelId: session.effectPickerChannelId });
    query = '';
    active = 0;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = Math.min(matches.length - 1, active + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = Math.max(0, active - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      session.effectPickerOpen = false;
    }
  }
</script>

<div class="modal-backdrop">
  <div
    class="picker"
    role="dialog"
    aria-modal="true"
    aria-labelledby="effect-picker-title"
    tabindex="-1"
    onkeydown={onKeydown}
  >
    <h2 id="effect-picker-title">Add effect</h2>
    <p>
      Inserts at the playhead
      {#if session.effectPickerChannelId}
        on {session.channels.find(
          (channel: Channel) => channel.id === session.effectPickerChannelId
        )?.displayName}
      {:else}
        on the selected channel
      {/if}.
    </p>
    <input
      aria-label="Filter effects"
      placeholder="Search effects"
      bind:value={query}
      oninput={() => (active = 0)}
      autofocus
    />
    <ul role="listbox" aria-label="Effects">
      {#each matches as preset, index (preset.type)}
        <li>
          <button
            type="button"
            role="option"
            aria-selected={index === active}
            class:active={index === active}
            onclick={() => choose(index)}
          >
            <strong>{preset.name}</strong>
            <span>{preset.description}</span>
          </button>
        </li>
      {:else}
        <li>No matching effect.</li>
      {/each}
    </ul>
    <button type="button" onclick={() => (session.effectPickerOpen = false)}>Close</button>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    background: var(--overlay-bg);
  }
  .picker {
    display: grid;
    gap: 8px;
    width: min(420px, calc(100vw - 32px));
    max-height: min(520px, calc(100vh - 32px));
    padding: 16px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  h2,
  p {
    margin: 0;
  }
  p,
  li span {
    color: var(--text-muted);
    font-size: 12px;
  }
  input,
  button {
    color: var(--text);
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  ul {
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
  }
  li button {
    display: grid;
    width: 100%;
    padding: 8px;
    text-align: left;
    background: transparent;
  }
  li button.active,
  li button:hover {
    background: var(--accent-soft);
  }
</style>
