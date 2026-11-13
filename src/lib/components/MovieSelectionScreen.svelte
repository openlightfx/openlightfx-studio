<script lang="ts">
  import { onMount } from 'svelte';
  import {
    fetchActiveTrackPath,
    fetchItems,
    fetchMediaInfo,
    fetchTrackBytes,
    fetchTracks,
  } from '$lib/api/client';
  import { loadRooms } from '$lib/api/rooms';
  import type { Room } from '$lib/api/rooms';
  import type { LibraryItem, TrackSummary } from '$lib/api/types';
  import { decodeTrack, inferChannelLayout, MAX_TRACK_BYTES, validateTrack } from '$lib/domain';
  import { setPendingImport } from '$lib/studio/pending-import';

  const layouts = [
    { id: 'LAYOUT_AMBIENT', label: 'Ambient', channels: ['Ambient'] },
    { id: 'LAYOUT_2_0', label: '2.0', channels: ['Left', 'Right'] },
    { id: 'LAYOUT_3_0', label: '3.0', channels: ['Left', 'Center', 'Right'] },
    {
      id: 'LAYOUT_5_0',
      label: '5.0',
      channels: ['Left', 'Center', 'Right', 'Surround Left', 'Surround Right'],
    },
  ];
  let item = $state<LibraryItem | null>(null);
  let rooms = $state<Room[]>([]);
  let tracks = $state<TrackSummary[]>([]);
  let trackDetails = $state<Record<string, { layout: string; author: string }>>({});
  let loading = $state(true);
  let failed = $state('');
  let title = $state('');
  let layout = $state('LAYOUT_2_0');
  let roomId = $state('');
  let opening = $state(false);
  let fileError = $state('');
  let fileInput = $state<HTMLInputElement | undefined>();

  const selectedRoom = $derived(rooms.find((room) => room.id === roomId));
  const suggested = $derived(suggestedLayout(selectedRoom));
  const hasRoomPicker = $derived(rooms.length >= 2);

  function suggestedLayout(room: Room | undefined): string {
    if (!room || room.bulbs.length === 0) return 'LAYOUT_2_0';
    const positions = new Set(room.bulbs.map((bulb) => bulb.position).filter(Boolean));
    if ([...positions].some((position) => position !== 'ambient')) {
      if (positions.has('surround-left') || positions.has('surround-right')) return 'LAYOUT_5_0';
      if (positions.has('center')) return 'LAYOUT_3_0';
      return 'LAYOUT_2_0';
    }
    return 'LAYOUT_AMBIENT';
  }

  function layoutLabel(id: string): string {
    return layouts.find((entry) => entry.id === id)?.label ?? 'Unknown';
  }

  onMount(() => {
    const itemId = decodeURIComponent(location.hash.split('/')[2] ?? '');
    let candidate: LibraryItem | null = null;
    try {
      const stored = sessionStorage.getItem('olfx-selected-movie');
      if (stored) {
        const parsed = JSON.parse(stored) as LibraryItem;
        if (parsed.itemId === itemId) candidate = parsed;
      }
    } catch {
      // The server lookup below is authoritative if browser storage is unavailable.
    }
    void Promise.all([loadRooms(), fetchItems('')])
      .then(async ([loadedRooms, items]) => {
        rooms = loadedRooms;
        roomId = rooms[0]?.id ?? '';
        item = candidate ?? items.find((movie) => movie.itemId === itemId) ?? null;
        if (!item) throw new Error('This movie is no longer available in Emby.');
        if (!item.runtimeMs) {
          try {
            const media = await fetchMediaInfo(itemId);
            if (media.runtimeMs > 0) item = { ...item, runtimeMs: media.runtimeMs };
          } catch {
            // Keep Create disabled until a valid movie duration is available.
          }
        }
        title = `${item.name} lighting`;
        layout = suggestedLayout(rooms.find((room) => room.id === roomId));
        tracks = await fetchTracks(itemId);
        try {
          const activePath = await fetchActiveTrackPath(itemId);
          if (activePath) {
            const normalizedPath = activePath.replaceAll('\\\\', '/').toLowerCase();
            tracks = tracks.map((track) => ({
              ...track,
              active:
                normalizedPath.endsWith(`/${track.trackId.toLowerCase()}.lightfx`) ||
                normalizedPath.endsWith(`/${track.trackId.toLowerCase()}`),
            }));
          }
        } catch {
          // Track listing remains useful if the server doesn't expose legacy selection details.
        }
        await Promise.all(
          tracks.map(async (track) => {
            try {
              const decoded = decodeTrack(await fetchTrackBytes(track.trackId, itemId));
              const inferred =
                decoded.metadata.channelLayout || inferChannelLayout(decoded.channels);
              trackDetails[track.trackId] = {
                layout: inferred,
                author: decoded.metadata.author || '—',
              };
            } catch (error) {
              trackDetails[track.trackId] = {
                layout: '',
                author: (error as Error).message || 'Track could not be opened',
              };
            }
          })
        );
      })
      .catch(
        (error: unknown) =>
          (failed = (error as Error).message || 'Studio could not load this movie.')
      )
      .finally(() => (loading = false));
  });

  function openTrack(track: TrackSummary) {
    if (!trackDetails[track.trackId]?.layout) return;
    sessionStorage.setItem(
      'olfx-editor-request',
      JSON.stringify({ itemId: item?.itemId, trackId: track.trackId })
    );
    location.hash = `#/edit/${encodeURIComponent(item!.itemId)}/${encodeURIComponent(track.trackId)}`;
  }

  function createTrack() {
    if (!item || !item.runtimeMs || opening) return;
    opening = true;
    sessionStorage.setItem(
      'olfx-editor-request',
      JSON.stringify({
        itemId: item.itemId,
        title: title.trim() || `${item.name} lighting`,
        layout,
      })
    );
    location.hash = `#/edit/${encodeURIComponent(item.itemId)}/new`;
  }

  async function importFile(file?: File) {
    fileError = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.lightfx')) {
      fileError = "That file isn't a .lightfx track.";
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length > MAX_TRACK_BYTES) throw new Error('Track file is too large.');
      const decoded = decodeTrack(bytes);
      const errors = validateTrack(decoded);
      if (errors.length) throw new Error(errors.join(' '));
      if (item) {
        const sourceName = decoded.metadata.movieTitle.trim();
        const durationMismatch =
          item.runtimeMs > 0 &&
          decoded.metadata.durationMs > 0 &&
          Math.abs(item.runtimeMs - decoded.metadata.durationMs) / item.runtimeMs > 0.02;
        const movieMismatch =
          sourceName && sourceName.toLocaleLowerCase() !== item.name.toLocaleLowerCase();
        if (
          (durationMismatch || movieMismatch) &&
          !window.confirm(
            `This track is for ${sourceName || 'a movie with a different runtime'} (${Math.round(decoded.metadata.durationMs / 60000)} min), but you selected ${item.name} (${Math.round(item.runtimeMs / 60000)} min). Continue importing it?`
          )
        )
          return;
        setPendingImport(item.itemId, file.name, bytes);
        location.hash = `#/edit/${encodeURIComponent(item.itemId)}/import`;
      }
    } catch {
      fileError = "That file isn't a .lightfx track.";
    }
  }
</script>

<svelte:head><title>{item?.name ?? 'Movie'} · OpenLightFX Studio</title></svelte:head>
<div class="movie-app">
  <header>
    <strong>OpenLightFX Studio</strong><a href="#/rooms">Rooms</a><a href="#/library">Library</a
    ><span></span><a
      href="https://github.com/openlightfx/openlightfx-studio/blob/main/docs/journeys/J1-first-light.md"
      >Help</a
    >
  </header>
  <main>
    <a href="#/library">← Library</a>
    {#if failed}<p role="alert">{failed} <a href="#/library">Return to the Library</a></p>
    {:else if loading}<p role="status">Loading movie and tracks…</p>
    {:else if item}
      <section class="movie-heading">
        {#if item.posterUrl}<img src={item.posterUrl} alt="" />{:else}<div class="poster">
            {item.name}
          </div>{/if}
        <div>
          <h1>{item.name}</h1>
          <p>
            {item.year || 'Year unknown'}{item.runtimeMs
              ? ` · ${Math.floor(item.runtimeMs / 60000)} min`
              : ''}
          </p>
        </div>
      </section>
      <div class="columns">
        <section class="panel tracks">
          <h2>Tracks for this movie</h2>
          {#if tracks.length === 0}<p>No tracks for this movie yet.</p>{/if}
          {#each tracks as track (track.trackId)}
            {@const detail = trackDetails[track.trackId]}
            <article class="track-row">
              <div>
                <strong>{track.title || 'Untitled track'}</strong>
                {#if track.active}<span class="badge">Plays in Emby</span>{/if}
                <p>
                  {detail?.layout
                    ? layoutLabel(detail.layout)
                    : detail?.author || 'Checking track…'} · {detail?.author || '—'} · {track.updatedAt
                    ? new Date(track.updatedAt).toLocaleString()
                    : 'Not saved'}
                </p>
              </div>
              {#if detail?.layout}<button class="primary" onclick={() => openTrack(track)}
                  >Open</button
                >
              {:else if detail}<span class="invalid" role="status">Can't open: {detail.author}</span
                >{/if}
            </article>
          {/each}
          <div class="other">
            <h2>Other ways to start</h2>
            <button onclick={() => fileInput?.click()}>Open a .lightfx file…</button>
            <input
              bind:this={fileInput}
              hidden
              type="file"
              accept=".lightfx,application/octet-stream"
              onchange={(event) => void importFile(event.currentTarget.files?.[0])}
            />
            {#if fileError}<p class="error" role="alert">{fileError}</p>{/if}
            <p>Marketplace: browse tracks others have made — coming later.</p>
          </div>
        </section>
        <section class="panel create">
          <h2>New track</h2>
          <label>Title<input aria-label="Title" bind:value={title} maxlength="100" /></label>
          {#if hasRoomPicker}<label
              >For room<select
                aria-label="For room"
                bind:value={roomId}
                onchange={() => (layout = suggested)}
                >{#each rooms as room}<option value={room.id}>{room.name}</option>{/each}</select
              ></label
            >{/if}
          <fieldset>
            <legend>Layout</legend>
            <div class="layouts">
              {#each layouts as option (option.id)}
                <button
                  type="button"
                  class:chosen={layout === option.id}
                  aria-pressed={layout === option.id}
                  onclick={() => (layout = option.id)}
                >
                  <strong>{option.label}</strong><span>{option.channels.join(' · ')}</span>
                  {#if !selectedRoom}<small
                      >{option.id === 'LAYOUT_2_0' ? 'Selected without a room' : '\u00a0'}</small
                    >
                  {:else if option.id === suggested}<small
                      >{option.id === 'LAYOUT_AMBIENT'
                        ? 'Every bulb plays it'
                        : `Suggested for ${selectedRoom.name}`}</small
                    >
                  {:else}<small
                      >{option.id === 'LAYOUT_5_0'
                        ? 'Surround folds into Left and Right'
                        : 'Channels route to the room'}</small
                    >{/if}
                </button>
              {/each}
            </div>
          </fieldset>
          <p class="muted">
            Starts with the layout’s channels, all dark, and no keyframes. Nothing is written until
            you save.
          </p>
          {#if !item.runtimeMs}<p role="status">Reading the movie’s length…</p>{/if}
          <button
            class="primary create-button"
            disabled={!item.runtimeMs || opening}
            onclick={createTrack}>Create track</button
          >
        </section>
      </div>
    {/if}
  </main>
</div>

<style>
  .movie-app {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font:
      14px/1.45 system-ui,
      sans-serif;
  }
  header {
    height: 48px;
    display: flex;
    align-items: center;
    gap: 22px;
    padding: 0 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--surface2);
  }
  header span {
    flex: 1;
  }
  header a,
  main > a {
    color: var(--text-muted);
    text-decoration: none;
  }
  main {
    padding: 24px;
  }
  .movie-heading {
    display: flex;
    gap: 18px;
    align-items: center;
    margin: 14px 0 22px;
  }
  .movie-heading img,
  .poster {
    width: 90px;
    height: 130px;
    object-fit: cover;
    background: var(--surface2);
    border-radius: 5px;
  }
  .poster {
    display: grid;
    place-items: center;
    text-align: center;
    padding: 8px;
    box-sizing: border-box;
  }
  .movie-heading h1 {
    margin: 0;
  }
  .movie-heading p,
  .track-row p,
  .muted {
    color: var(--text-muted);
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    gap: 18px;
  }
  .panel {
    position: relative;
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--surface2);
    border-radius: 8px;
    min-height: 430px;
  }
  .panel h2 {
    margin: 0 0 12px;
    font-size: 17px;
  }
  .track-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--surface2);
  }
  .track-row p {
    font-size: 12px;
    margin: 5px 0 0;
  }
  .badge {
    display: inline-block;
    margin-left: 8px;
    padding: 2px 7px;
    border-radius: 12px;
    background: var(--surface2);
    font-size: 11px;
  }
  .other {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--surface2);
  }
  button,
  input,
  select {
    font: inherit;
    color: var(--text);
    background: var(--surface2);
    border: 1px solid var(--surface3);
    border-radius: 5px;
    padding: 8px;
  }
  button {
    cursor: pointer;
  }
  .primary {
    background: #356e91;
    border-color: #356e91;
    color: white;
  }
  .invalid,
  .error {
    color: #ff8585;
  }
  .create {
    padding-bottom: 58px;
  }
  .create > label {
    display: grid;
    gap: 5px;
    margin: 12px 0;
    color: var(--text-muted);
  }
  .create > label input,
  .create > label select {
    background: var(--bg);
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 16px 0;
  }
  legend {
    padding: 0 0 7px;
  }
  .layouts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .layouts button {
    min-height: 145px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 8px;
    background: var(--bg);
    border-color: var(--surface3);
  }
  .layouts button.chosen {
    outline: 2px solid var(--accent2);
  }
  .layouts span,
  .layouts small {
    font-size: 11px;
    color: var(--text-muted);
  }
  .layouts small {
    margin-top: auto;
  }
  .create-button {
    position: absolute;
    right: 16px;
    bottom: 16px;
  }
  .muted {
    font-size: 12px;
  }
  .other p {
    color: var(--text-muted);
  }
  @media (max-width: 850px) {
    .columns {
      grid-template-columns: 1fr;
    }
    .layouts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 560px) {
    main {
      padding: 14px;
    }
    .movie-heading {
      align-items: flex-start;
    }
  }
</style>
