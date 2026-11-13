<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchItems } from '$lib/api/client';
  import type { LibraryItem } from '$lib/api/types';
  let item = $state<LibraryItem | null>(null);
  let failed = $state(false);
  onMount(async () => {
    const itemId = decodeURIComponent(location.hash.split('/')[2] ?? '');
    try {
      const stored = sessionStorage.getItem('olfx-selected-movie');
      if (stored) {
        const candidate = JSON.parse(stored) as LibraryItem;
        if (candidate.itemId === itemId) item = candidate;
      }
      if (!item)
        item = (await fetchItems('')).find((candidate) => candidate.itemId === itemId) ?? null;
    } catch {
      failed = true;
    }
  });
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
    {#if failed}<p role="alert">
        Studio can't reach the OpenLightFX plugin. Retry by returning to the Library.
      </p>
    {:else if !item}<p role="status">Loading movie…</p>
    {:else}<section>
        <h1>{item.name}</h1>
        <p>
          {item.year || 'Year unknown'}{item.runtimeMs
            ? ` · ${Math.round(item.runtimeMs / 60000)} min`
            : ''}
        </p>
        <p>Movie selected. Track options are the next step in Studio.</p>
      </section>{/if}
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
  section {
    margin-top: 24px;
    padding: 24px;
    background: var(--surface);
    border: 1px solid var(--surface2);
    border-radius: 8px;
  }
  h1 {
    margin-top: 0;
  }
</style>
