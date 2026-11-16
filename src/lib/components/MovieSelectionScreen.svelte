<script lang="ts">
  import { onMount, tick } from 'svelte';
  import StudioHeader from '$lib/components/layout/StudioHeader.svelte';
  import {
    fetchActiveTrackPath,
    fetchItem,
    fetchMediaInfo,
    fetchTrackBytes,
    fetchTracks,
  } from '$lib/api/client';
  import { loadRooms, loadRoomRouting, type RoomRouting } from '$lib/api/rooms';
  import type { Room } from '$lib/api/rooms';
  import type { LibraryItem, TrackSummary } from '$lib/api/types';
  import {
    decodeTrack,
    inferChannelLayout,
    MAX_TRACK_BYTES,
    suggestChannelLayout,
    validateTrack,
  } from '$lib/domain';
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
  let titleInput = $state<HTMLInputElement | undefined>();
  let missingPoster = $state(false);
  let routing = $state<Record<string, RoomRouting>>({});
  let routingGeneration = 0;

  $effect(() => {
    const selected = roomId;
    const generation = ++routingGeneration;
    routing = {};
    if (!selected) return;
    for (const option of layouts) {
      const channels = option.channels.map((name) => ({
        id: name.toLowerCase().replaceAll(' ', '-'),
        displayName: name,
        spatialHint: `SPATIAL_${name.toUpperCase().replaceAll(' ', '_')}`,
      }));
      void loadRoomRouting(selected, channels)
        .then((result) => {
          if (generation === routingGeneration) routing[option.id] = result;
        })
        .catch(() => {
          /* Coverage is unavailable, not guessed in Studio. */
        });
    }
    return () => {
      routingGeneration++;
    };
  });

  function chooseRoom(id: string) {
    roomId = id;
    layout = suggestedLayout(rooms.find((room) => room.id === id));
  }
  function coverage(id: string): string {
    const result = routing[id];
    if (!result) return 'Room coverage unavailable';
    if (!result.bulbs.length) return 'No bulbs in this room';
    const folded = result.channels.filter((channel) => channel.foldedInto.length);
    return folded.length
      ? `${folded.length} ${folded.length === 1 ? 'channel folds' : 'channels fold'} · ${result.bulbs.length} ${result.bulbs.length === 1 ? 'bulb' : 'bulbs'} reached`
      : `All ${result.channels.length} positions have bulbs`;
  }

  const selectedRoom = $derived(rooms.find((room) => room.id === roomId));
  const suggested = $derived(suggestedLayout(selectedRoom));
  const hasRoomPicker = $derived(rooms.length >= 2);

  function suggestedLayout(room: Room | undefined): string {
    if (!room || room.bulbs.length === 0) return 'LAYOUT_2_0';
    const positions = room.bulbs
      .map((bulb) => bulb.position)
      .filter((position): position is NonNullable<typeof position> => position !== null);
    return suggestChannelLayout(positions);
  }

  function layoutLabel(id: string): string {
    return layouts.find((entry) => entry.id === id)?.label ?? 'Unknown';
  }

  onMount(() => {
    const itemId = decodeURIComponent(location.hash.split('/')[2] ?? '');
    void Promise.all([loadRooms(), fetchItem(itemId).catch(() => null)])
      .then(async ([loadedRooms, movie]) => {
        rooms = loadedRooms;
        roomId = rooms[0]?.id ?? '';
        // Item details are fetched by the route's known ID. If Emby's details
        // endpoint is unavailable, the track/media APIs can still serve the page.
        item = movie ?? { itemId, name: itemId, year: 0, runtimeMs: 0 };
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
            const normalizedPath = activePath.replaceAll('\\', '/').toLowerCase();
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
              const errors = validateTrack(decoded);
              if (errors.length) throw new Error(errors.join(' '));
              const inferred = layouts.some(
                (option) => option.id === decoded.metadata.channelLayout
              )
                ? decoded.metadata.channelLayout!
                : inferChannelLayout(decoded.channels);
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
      .finally(async () => {
        loading = false;
        await tick();
        if (!failed && tracks.length === 0) titleInput?.focus();
      });
  });

  function openTrack(track: TrackSummary) {
    if (!trackDetails[track.trackId]?.layout) return;
    sessionStorage.setItem('olfx-preview-room', roomId);
    sessionStorage.setItem(
      'olfx-editor-request',
      JSON.stringify({ itemId: item?.itemId, trackId: track.trackId })
    );
    location.hash = `#/edit/${encodeURIComponent(item!.itemId)}/${encodeURIComponent(track.trackId)}`;
  }

  function createTrack() {
    if (!item || !item.runtimeMs || opening) return;
    opening = true;
    sessionStorage.setItem('olfx-preview-room', roomId);
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
      if (file.size > MAX_TRACK_BYTES) throw new Error('Track file is too large.');
      const bytes = new Uint8Array(await file.arrayBuffer());
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
            `This track is for ${sourceName || 'a movie with a different runtime'} (${Math.round(decoded.metadata.durationMs / 1000)} seconds), but you selected ${item.name} (${Math.round(item.runtimeMs / 1000)} seconds). Continue importing it?`
          )
        )
          return;
        sessionStorage.setItem('olfx-preview-room', roomId);
        setPendingImport(item.itemId, file.name, bytes);
        location.hash = `#/edit/${encodeURIComponent(item.itemId)}/import`;
      }
    } catch {
      fileError = "That file isn't a .lightfx track.";
    }
  }
</script>

<svelte:head><title>{item?.name ?? 'Movie'} · OpenLightFX Studio</title></svelte:head>
<div class="movie-app studio-page">
  <StudioHeader current="library" />
  <main>
    <a href="#/library">← Library</a>
    {#if failed}<p role="alert">{failed} <a href="#/library">Return to the Library</a></p>
    {:else if loading}<p role="status">Loading movie and tracks…</p>
    {:else if item}
      <section class="movie-heading">
        {#if item.posterUrl && !missingPoster}<img
            src={item.posterUrl}
            alt=""
            onerror={() => (missingPoster = true)}
          />{:else}<div class="poster">
            {item.name}
          </div>{/if}
        <div>
          <p class="eyebrow">Light up this movie</p>
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
              onchange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                void importFile(file);
              }}
            />
            {#if fileError}<p class="error" role="alert">{fileError}</p>{/if}
            <p>Marketplace: browse tracks others have made — coming later.</p>
          </div>
        </section>
        <section class="panel create">
          <h2>New track</h2>
          <label
            >Title<input
              aria-label="Title"
              bind:this={titleInput}
              bind:value={title}
              maxlength="100"
            /></label
          >
          {#if hasRoomPicker}<label
              >For room<select
                aria-label="For room"
                value={roomId}
                onchange={(event) => chooseRoom(event.currentTarget.value)}
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
                  <strong>{option.label}</strong>
                  <span class="layout-map" aria-hidden="true"
                    ><span class="layout-screen"></span>
                    {#each option.channels as position}<span
                        class="layout-dot"
                        data-position={position}
                      ></span>{/each}
                  </span>
                  <span>{option.channels.join(' · ')}</span>
                  {#if !selectedRoom}<small
                      >{option.id === 'LAYOUT_2_0' ? 'Selected without a room' : '\u00a0'}</small
                    >
                  {:else if option.id === suggested}<small
                      >{option.id === 'LAYOUT_AMBIENT'
                        ? 'Every bulb plays it'
                        : `Suggested for ${selectedRoom.name}`}</small
                    >
                  {:else}<small>{coverage(option.id)}</small>{/if}
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
  main > a {
    color: var(--text-muted);
    text-decoration: none;
  }
  main > a:hover {
    color: var(--text);
  }
  main {
    max-width: 1440px;
    margin: 0 auto;
    padding: var(--space-8) var(--page-gutter) var(--space-12);
  }
  .movie-heading {
    display: flex;
    gap: var(--space-6);
    align-items: center;
    margin: var(--space-6) 0 var(--space-8);
  }
  .movie-heading img,
  .poster {
    width: 100px;
    height: 150px;
    object-fit: cover;
    background: var(--surface2);
    border-radius: var(--radius);
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
  .movie-heading p:not(.eyebrow),
  .track-row p,
  .muted {
    color: var(--text-muted);
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    gap: var(--space-6);
    align-items: start;
  }
  .panel {
    position: relative;
    padding: var(--space-6);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  .panel h2 {
    margin: 0 0 var(--space-5);
  }
  .track-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: var(--space-5) 0;
    border-bottom: 1px solid var(--border);
  }
  .track-row p {
    font-size: 12px;
    margin: 5px 0 0;
  }
  .badge {
    display: inline-block;
    margin-left: 8px;
    padding: 2px 7px;
    border-radius: var(--radius-sm);
    color: var(--accent-text);
    background: var(--accent-soft);
    font-size: 11px;
  }
  .other {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .invalid,
  .error {
    color: var(--danger);
  }
  .create {
    display: flex;
    flex-direction: column;
  }
  .create-button {
    align-self: flex-end;
  }
  .create > label {
    display: grid;
    gap: var(--space-2);
    margin: 0 0 var(--space-5);
    color: var(--text-muted);
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
    gap: var(--space-3);
  }
  .layouts button {
    min-height: 180px;
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 8px;
    background: var(--bg);
    border-color: var(--border-strong);
  }
  .layout-map {
    position: relative;
    display: block;
    width: 72px;
    height: 44px;
    border: 1px solid var(--surface3);
    border-radius: 4px;
  }
  .layout-screen {
    position: absolute;
    top: 3px;
    left: 24px;
    width: 24px;
    height: 3px;
    background: var(--text-muted);
  }
  .layout-dot {
    position: absolute;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent2);
    top: 12px;
  }
  .layout-dot[data-position='Left'] {
    left: 10px;
  }
  .layout-dot[data-position='Center'] {
    left: 32px;
  }
  .layout-dot[data-position='Right'] {
    right: 10px;
  }
  .layout-dot[data-position='Surround Left'] {
    left: 10px;
    top: 30px;
  }
  .layout-dot[data-position='Surround Right'] {
    right: 10px;
    top: 30px;
  }
  .layout-dot[data-position='Ambient'] {
    left: 10px;
    top: 30px;
    width: 52px;
    border-radius: 3px;
  }
  .layouts button:hover {
    background: var(--hover);
  }
  .layouts button.chosen {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .layouts button.chosen strong {
    color: var(--accent-text);
  }
  .layouts button.chosen small {
    color: var(--accent-text);
  }
  .layouts span,
  .layouts small {
    font-size: 11px;
    color: var(--text-muted);
  }
  .layouts small {
    margin-top: auto;
  }
  .muted {
    font-size: 12px;
  }
  .other p {
    color: var(--text-muted);
  }
  @media (max-width: 1100px) {
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
