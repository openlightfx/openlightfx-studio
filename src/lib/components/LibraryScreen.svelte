<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchItems } from '$lib/api/client';
  import { loadRooms } from '$lib/api/rooms';
  import type { LibraryItem } from '$lib/api/types';

  type SortOrder = 'title' | 'recent' | 'tracked';
  let items = $state<LibraryItem[]>([]);
  let roomCount = $state<number | null>(null);
  let search = $state('');
  let sort = $state<SortOrder>('title');
  let loading = $state(true);
  let error = $state('');
  let missingPosters = $state<Record<string, boolean>>({});
  let timer: ReturnType<typeof setTimeout>;
  let requestGeneration = 0;

  const sortedItems = $derived.by(() => {
    const rows = [...items];
    if (sort === 'recent')
      return rows.sort(
        (a, b) => (Date.parse(b.dateAdded ?? '') || 0) - (Date.parse(a.dateAdded ?? '') || 0)
      );
    if (sort === 'tracked')
      return rows.sort(
        (a, b) => (b.trackCount ?? 0) - (a.trackCount ?? 0) || a.name.localeCompare(b.name)
      );
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  });

  onMount(() => {
    const saved = localStorage.getItem('olfx-library-sort');
    if (saved === 'title' || saved === 'recent' || saved === 'tracked') sort = saved;
    void Promise.all([
      loadRooms()
        .then((rooms) => (roomCount = rooms.length))
        .catch(() => (roomCount = null)),
      searchItems(''),
    ]);
    return () => clearTimeout(timer);
  });

  async function searchItems(query: string) {
    const generation = ++requestGeneration;
    loading = true;
    error = '';
    try {
      const results = await fetchItems(query);
      if (generation !== requestGeneration) return;
      items = results;
    } catch (e) {
      if (generation === requestGeneration)
        error = (e as Error).message || 'Studio could not load movies.';
    } finally {
      if (generation === requestGeneration) loading = false;
    }
  }
  function updateSearch(value: string) {
    search = value;
    clearTimeout(timer);
    timer = setTimeout(() => void searchItems(value.trim()), 250);
  }
  function updateSort(value: string) {
    sort = value as SortOrder;
    localStorage.setItem('olfx-library-sort', sort);
  }
  function trackBadge(item: LibraryItem) {
    const count = item.trackCount ?? 0;
    if (count === 0) return 'No track';
    const label = `${count} ${count === 1 ? 'track' : 'tracks'}`;
    return item.hasActiveTrack ? `${label} · Plays in Emby` : label;
  }
</script>

<svelte:head><title>Library · OpenLightFX Studio</title></svelte:head>
<div class="library-app">
  <header>
    <strong>OpenLightFX Studio</strong>
    <a href="#/rooms">Rooms</a>
    <a href="#/library" aria-current="page">Library</a>
    <span class="spacer"></span><span>Emby</span>
    <a
      href="https://github.com/openlightfx/openlightfx-studio/blob/main/docs/journeys/J1-first-light.md"
      >Help</a
    >
  </header>
  {#if roomCount === 0}<p class="no-room">
      No room set up. You can still write tracks. <a href="#/rooms">Set up a room</a>
    </p>{/if}
  <main>
    <div class="toolbar">
      <label
        >Search <input
          type="search"
          value={search}
          oninput={(e) => updateSearch(e.currentTarget.value)}
          placeholder="Search movies"
        /></label
      >
      <label
        >Sort <select value={sort} onchange={(e) => updateSort(e.currentTarget.value)}>
          <option value="title">Title A–Z</option><option value="recent">Recently added</option
          ><option value="tracked">Has a track first</option>
        </select></label
      >
    </div>
    {#if error}<p role="alert" class="error">
        Studio can't reach the OpenLightFX plugin. {error}
        <button onclick={() => void searchItems(search)}>Retry</button>
      </p>
    {:else if loading}<div class="grid" aria-label="Loading movies">
        {#each Array(8) as _}<div class="placeholder" aria-hidden="true"></div>{/each}
      </div>
    {:else if items.length === 0}
      {#if search}<p class="empty">
          No movies match "{search}". Check the spelling or clear the search.
          <button onclick={() => updateSearch('')}>Clear search</button>
        </p>
      {:else}<p class="empty">
          Emby has no movies yet. Add a movie library in Emby, then come back.
        </p>{/if}
    {:else}
      <div class="grid" aria-label="Movies">
        {#each sortedItems as item (item.itemId)}
          <a
            class="movie"
            href={'#/movie/' + encodeURIComponent(item.itemId)}
            onclick={() => sessionStorage.setItem('olfx-selected-movie', JSON.stringify(item))}
            aria-label={`${item.name}${item.year ? `, ${item.year}` : ''}`}
          >
            {#if item.posterUrl && !missingPosters[item.itemId]}<img
                src={item.posterUrl}
                alt=""
                onerror={() => (missingPosters[item.itemId] = true)}
              />
            {:else}<div class="poster-fallback" aria-hidden="true">{item.name}</div>{/if}
            <span class="title">{item.name}</span><span class="year"
              >{item.year || 'Year unknown'}</span
            >
            <span class="badge">{trackBadge(item)}</span>
          </a>
        {/each}
      </div>
    {/if}
  </main>
</div>

<style>
  .library-app {
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
  header strong {
    font-size: 15px;
  }
  header a {
    color: var(--text-muted);
    text-decoration: none;
    padding: 6px;
    border-radius: 4px;
  }
  header a:hover,
  header a[aria-current='page'] {
    color: var(--text);
    background: var(--surface2);
  }
  .spacer {
    flex: 1;
  }
  .no-room {
    margin: 14px 24px;
    padding: 12px;
    background: var(--surface);
    border: 1px solid var(--surface2);
    border-radius: 6px;
  }
  .no-room a {
    color: var(--accent2);
  }
  main {
    padding: 20px 24px;
  }
  .toolbar {
    display: flex;
    align-items: end;
    gap: 16px;
    margin-bottom: 20px;
  }
  .toolbar label {
    display: grid;
    gap: 5px;
    color: var(--text-muted);
  }
  input,
  select {
    min-width: 220px;
    padding: 9px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--surface3);
    border-radius: 5px;
    font: inherit;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 18px;
  }
  .movie {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--text);
    text-decoration: none;
    min-width: 0;
  }
  .movie img,
  .poster-fallback,
  .placeholder {
    width: 100%;
    aspect-ratio: 2/3;
    object-fit: cover;
    background: #34343b;
    border-radius: 5px;
  }
  .poster-fallback {
    display: grid;
    place-items: center;
    text-align: center;
    padding: 12px;
    box-sizing: border-box;
    font-size: 18px;
    font-weight: 600;
  }
  .placeholder {
    opacity: 0.55;
  }
  .title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .year {
    font-size: 12px;
    color: var(--text-muted);
  }
  .badge {
    align-self: flex-start;
    border-radius: 12px;
    padding: 2px 8px;
    background: var(--surface2);
    font-size: 11px;
    color: var(--text-muted);
  }
  .movie:hover img,
  .movie:hover .poster-fallback {
    outline: 2px solid var(--accent);
  }
  .movie:focus-visible {
    outline: 2px solid var(--accent2);
    outline-offset: 3px;
  }
  .empty,
  .error {
    margin: 30px 0;
    color: var(--text-muted);
  }
  .error {
    color: #ff8080;
  }
  button {
    font: inherit;
    color: var(--text);
    background: var(--surface2);
    border: 1px solid var(--surface3);
    border-radius: 4px;
    padding: 5px 9px;
    cursor: pointer;
  }
  @media (max-width: 600px) {
    main {
      padding: 14px;
    }
    .toolbar {
      align-items: stretch;
      flex-direction: column;
    }
    .toolbar input,
    .toolbar select {
      width: 100%;
      box-sizing: border-box;
    }
    header {
      gap: 10px;
      padding: 0 10px;
    }
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
