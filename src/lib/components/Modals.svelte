<script lang="ts">
  import { formatDuration } from '$lib/engine/time';
  import {
    BOUNDARY_BEHAVIORS,
    CHANNEL_PRESETS,
    CREDITS_BEHAVIORS,
    INTENSITY_RATINGS,
    PRESHOW_STATES
  } from '$lib/model/types';
  import { editor } from '$lib/state/editor.svelte';

  let title = $state('Untitled Track');
  let minutes = $state(90);
  let preset = $state(2);
  let query = $state('');

  $effect(() => {
    if (editor.modal === 'new') {
      title = 'Untitled Track';
      minutes = 90;
      preset = 2;
    }
    if (editor.modal === 'library') void editor.refreshLibrary(query);
  });

  const shortcuts: [string, string][] = [
    ['Space', 'Play / pause'],
    ['K', 'Add keyframe at playhead'],
    ['Shift+E', 'Add effect at playhead'],
    ['M', 'Add marker at playhead'],
    ['Delete', 'Delete selection'],
    ['Ctrl+C / X / V', 'Copy, cut, paste'],
    ['Ctrl+D', 'Duplicate'],
    ['Ctrl+A', 'Select all'],
    ['Ctrl+Z / Shift+Ctrl+Z', 'Undo / redo'],
    ['Arrows', 'Nudge one frame'],
    ['Shift+arrows', 'Nudge one second'],
    ['Alt+arrows', 'Nudge five frames'],
    ['[ / ]', 'Previous / next event'],
    ['J / L', 'Skip 5 seconds'],
    ['Home / End', 'Go to start / end'],
    ['S', 'Toggle snap'],
    ['F', 'Fit the movie'],
    ['+ / -', 'Zoom'],
    ['Ctrl+wheel', 'Zoom at cursor'],
    ['Wheel', 'Scroll time'],
    ['Shift+wheel', 'Scroll channels'],
    ['Drag empty', 'Marquee select'],
    ['Shift / Ctrl click', 'Add / toggle selection'],
    ['Double-click lane', 'Add keyframe'],
    ['Ctrl+S', 'Save to Emby, or download'],
    ['Ctrl+O', 'Import .lightfx']
  ];
</script>

{#if editor.modal}
  <div class="backdrop" role="presentation" onclick={() => (editor.modal = null)}>
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => {
        if (event.key === 'Escape') editor.modal = null;
      }}
    >
      {#if editor.modal === 'new'}
        <h2>New track</h2>
        <p class="hint">Starts an empty timeline. The current edit stays on the undo stack.</p>
        <div class="form">
          <label class="field">Title
            <input bind:value={title} />
          </label>
          <div class="row2">
            <label class="field">Duration (minutes)
              <input type="number" min="1" max="300" bind:value={minutes} />
            </label>
            <label class="field">Channels
              <select bind:value={preset}>
                {#each CHANNEL_PRESETS as item, index (item.name)}
                  <option value={index}>{item.name}</option>
                {/each}
              </select>
            </label>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="ghost" onclick={() => (editor.modal = null)}>Cancel</button>
          <button class="primary" onclick={() => editor.newTrack(Number(preset), title, Number(minutes))}>
            Create
          </button>
        </div>
      {:else if editor.modal === 'library'}
        <h2>Emby library</h2>
        <p class="hint">{editor.backendMessage}</p>
        <label class="field">Search
          <input
            type="search"
            bind:value={query}
            placeholder="Movie name"
            oninput={() => editor.refreshLibrary(query)}
          />
        </label>
        <h2>Items</h2>
        <div class="list">
          {#each editor.libraryItems as item (item.itemId)}
            <button class="item" onclick={() => editor.openItem(item)}>
              <span>{item.name}</span>
              <span class="mono">{item.year} · {formatDuration(item.runtimeMs)}</span>
            </button>
          {:else}
            <p class="hint">No items. In standalone dev the mock library lists three films and has no media stream.</p>
          {/each}
        </div>
        <h2>Tracks</h2>
        <div class="list">
          {#each editor.libraryTracks as track (track.trackId)}
            <button class="item" onclick={() => editor.openRemoteTrack(track)}>
              <span>{track.title}</span>
              <span class="mono">{track.updatedAt.slice(0, 16).replace('T', ' ')}</span>
            </button>
          {:else}
            <p class="hint">No saved tracks yet.</p>
          {/each}
        </div>
        <div class="dialog-actions">
          <button class="ghost" onclick={() => (editor.modal = null)}>Close</button>
        </div>
      {:else if editor.modal === 'mapping'}
        <h2>Bulb mapping</h2>
        <p class="hint">
          Each channel drives the bulbs you check. Frames are sent at 10 Hz unless a mapped bulb needs a slower transition.
        </p>
        {#if editor.bulbs.length === 0}
          <p class="hint">No bulbs reported. On-screen lights still preview the timeline.</p>
        {/if}
        {#each editor.track.channels as channel (channel.id)}
          <div class="map-row">
            <strong>{channel.displayName}</strong>
            <div class="checks">
              {#each editor.bulbs as bulb (bulb.id)}
                <label class="inline">
                  <input
                    type="checkbox"
                    checked={editor.mapping[channel.id]?.includes(bulb.id) ?? false}
                    onchange={() => editor.toggleBulb(channel.id, bulb.id)}
                  />
                  {bulb.name}
                  <span class="mono">{bulb.capabilities.minTransitionMs}ms</span>
                </label>
              {/each}
            </div>
          </div>
        {/each}
        <div class="dialog-actions">
          <button class="ghost" onclick={() => editor.autoMap()}>Auto-map in order</button>
          <button class="primary" onclick={() => (editor.modal = null)}>Done</button>
        </div>
      {:else if editor.modal === 'shortcuts'}
        <h2>Shortcuts</h2>
        <ul class="shortcuts">
          {#each shortcuts as [key, label] (key)}
            <li><span>{label}</span><kbd class="kbd">{key}</kbd></li>
          {/each}
        </ul>
        <div class="dialog-actions">
          <button class="primary" onclick={() => (editor.modal = null)}>Close</button>
        </div>
      {:else if editor.modal === 'settings'}
        <h2>Track settings</h2>
        <p class="hint">These fields are stored in the .lightfx protobuf.</p>
        <div class="form">
          <label class="field">Title
            <input
              value={editor.track.metadata.title}
              onfocus={() => editor.begin('Title')}
              oninput={(event) =>
                editor.patchMeta({ title: (event.currentTarget as HTMLInputElement).value })}
              onblur={() => editor.end()}
            />
          </label>
          <label class="field">Description
            <textarea
              value={editor.track.metadata.description}
              onfocus={() => editor.begin('Description')}
              oninput={(event) =>
                editor.patchMeta({ description: (event.currentTarget as HTMLTextAreaElement).value })}
              onblur={() => editor.end()}
            ></textarea>
          </label>
          <div class="row2">
            <label class="field">Author
              <input
                value={editor.track.metadata.author}
                onfocus={() => editor.begin('Author')}
                oninput={(event) =>
                  editor.patchMeta({ author: (event.currentTarget as HTMLInputElement).value })}
                onblur={() => editor.end()}
              />
            </label>
            <label class="field">Track version
              <input
                value={editor.track.metadata.trackVersion}
                onfocus={() => editor.begin('Version')}
                oninput={(event) =>
                  editor.patchMeta({ trackVersion: (event.currentTarget as HTMLInputElement).value })}
                onblur={() => editor.end()}
              />
            </label>
          </div>
          <label class="field">Tags
            <input
              value={editor.track.metadata.tags.join(', ')}
              onchange={(event) =>
                editor.patchMeta({
                  tags: (event.currentTarget as HTMLInputElement).value
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                })}
            />
          </label>
          <div class="row2">
            <label class="field">Movie
              <input
                value={editor.track.metadata.movieReference.title}
                onchange={(event) =>
                  editor.patchMeta({
                    movieReference: {
                      ...editor.track.metadata.movieReference,
                      title: (event.currentTarget as HTMLInputElement).value
                    }
                  })}
              />
            </label>
            <label class="field">IMDB id
              <input
                value={editor.track.metadata.movieReference.imdbId}
                placeholder="tt1234567"
                onchange={(event) =>
                  editor.patchMeta({
                    movieReference: {
                      ...editor.track.metadata.movieReference,
                      imdbId: (event.currentTarget as HTMLInputElement).value.trim()
                    }
                  })}
              />
            </label>
          </div>
          <div class="row3">
            <label class="field">Year
              <input
                type="number"
                value={editor.track.metadata.movieReference.year}
                onchange={(event) =>
                  editor.patchMeta({
                    movieReference: {
                      ...editor.track.metadata.movieReference,
                      year: Number((event.currentTarget as HTMLInputElement).value)
                    }
                  })}
              />
            </label>
            <label class="field">Runtime (min)
              <input
                type="number"
                value={editor.track.metadata.movieReference.runtimeMinutes}
                onchange={(event) =>
                  editor.patchMeta({
                    movieReference: {
                      ...editor.track.metadata.movieReference,
                      runtimeMinutes: Number((event.currentTarget as HTMLInputElement).value)
                    }
                  })}
              />
            </label>
            <label class="field">Duration (ms)
              <input
                type="number"
                min="1"
                value={editor.track.metadata.durationMs}
                onchange={(event) =>
                  editor.patchMeta({ durationMs: Number((event.currentTarget as HTMLInputElement).value) })}
              />
            </label>
          </div>
          <div class="row2">
            <label class="field">Start
              <select
                value={editor.track.metadata.startBehavior}
                onchange={(event) =>
                  editor.patchMeta({
                    startBehavior: (event.currentTarget as HTMLSelectElement).value as typeof editor.track.metadata.startBehavior
                  })}
              >
                {#each BOUNDARY_BEHAVIORS as behavior (behavior)}
                  <option value={behavior}>{behavior}</option>
                {/each}
              </select>
            </label>
            <label class="field">End
              <select
                value={editor.track.metadata.endBehavior}
                onchange={(event) =>
                  editor.patchMeta({
                    endBehavior: (event.currentTarget as HTMLSelectElement).value as typeof editor.track.metadata.endBehavior
                  })}
              >
                {#each BOUNDARY_BEHAVIORS as behavior (behavior)}
                  <option value={behavior}>{behavior}</option>
                {/each}
              </select>
            </label>
          </div>
          <div class="row2">
            <label class="field">Preshow (ms)
              <input
                type="number"
                min="0"
                value={editor.track.metadata.preshowDurationMs}
                onchange={(event) =>
                  editor.patchMeta({
                    preshowDurationMs: Number((event.currentTarget as HTMLInputElement).value)
                  })}
              />
            </label>
            <label class="field">Preshow state
              <select
                value={editor.track.metadata.preshowState}
                onchange={(event) =>
                  editor.patchMeta({
                    preshowState: (event.currentTarget as HTMLSelectElement).value as typeof editor.track.metadata.preshowState
                  })}
              >
                {#each PRESHOW_STATES as state (state)}
                  <option value={state}>{state}</option>
                {/each}
              </select>
            </label>
          </div>
          <div class="row2">
            <label class="field">Credits start (ms)
              <input
                type="number"
                min="0"
                value={editor.track.metadata.creditsStartMs}
                onchange={(event) =>
                  editor.patchMeta({ creditsStartMs: Number((event.currentTarget as HTMLInputElement).value) })}
              />
            </label>
            <label class="field">Credits behavior
              <select
                value={editor.track.metadata.creditsBehavior}
                onchange={(event) =>
                  editor.patchMeta({
                    creditsBehavior: (event.currentTarget as HTMLSelectElement).value as typeof editor.track.metadata.creditsBehavior
                  })}
              >
                {#each CREDITS_BEHAVIORS as behavior (behavior)}
                  <option value={behavior}>{behavior}</option>
                {/each}
              </select>
            </label>
          </div>
          <label class="field">Safety warning
            <input
              value={editor.track.safetyInfo.warningText}
              onchange={(event) =>
                editor.patchSafety({ warningText: (event.currentTarget as HTMLInputElement).value })}
            />
          </label>
          <div class="row2">
            <label class="field">Intensity
              <select
                value={editor.track.safetyInfo.intensityRating}
                onchange={(event) =>
                  editor.patchSafety({
                    intensityRating: (event.currentTarget as HTMLSelectElement).value as typeof editor.track.safetyInfo.intensityRating
                  })}
              >
                {#each INTENSITY_RATINGS as rating (rating)}
                  <option value={rating}>{rating}</option>
                {/each}
              </select>
            </label>
            <label class="inline">
              <input
                type="checkbox"
                checked={editor.track.safetyInfo.containsFlashing}
                onchange={(event) =>
                  editor.patchSafety({
                    containsFlashing: (event.currentTarget as HTMLInputElement).checked
                  })}
              />
              Contains flashing
            </label>
          </div>
          <label class="inline">
            <input
              type="checkbox"
              checked={editor.track.safetyInfo.containsStrobing}
              onchange={(event) =>
                editor.patchSafety({
                  containsStrobing: (event.currentTarget as HTMLInputElement).checked
                })}
            />
            Contains strobing
          </label>
        </div>
        <div class="dialog-actions">
          <button class="primary" onclick={() => (editor.modal = null)}>Done</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .hint { color: var(--muted); }
  .form { display: flex; flex-direction: column; gap: 8px; }
</style>
