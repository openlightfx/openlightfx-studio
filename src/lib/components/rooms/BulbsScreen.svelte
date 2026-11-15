<script lang="ts">
  import { onMount } from 'svelte';
  import {
    discoverBulbs,
    forgetBulb,
    identifyBulb,
    loadBulbs,
    loadRooms,
    loadSetup,
    renameBulb,
    type Room,
    type RoomBulb,
    type Setup,
  } from '$lib/api/rooms';

  let bulbs = $state<RoomBulb[]>([]);
  let rooms = $state<Room[]>([]);
  let setup = $state<Setup | null>(null);
  let drafts = $state<Record<string, string>>({});
  let busy = $state(false);
  let identifying = $state('');
  let failure = $state<{ id: string; message: string } | null>(null);
  let error = $state('');
  let notice = $state('');
  let loading = $state(true);
  let retryDiscovery = $state(false);
  let controller: AbortController | null = null;

  onMount(() => {
    void refresh();
    const changed = () => {
      if (location.hash.startsWith('#/bulbs')) void refresh();
    };
    window.addEventListener('hashchange', changed);
    return () => {
      controller?.abort();
      window.removeEventListener('hashchange', changed);
    };
  });

  async function refresh() {
    loading = true;
    error = '';
    retryDiscovery = false;
    try {
      [bulbs, rooms, setup] = await Promise.all([loadBulbs(), loadRooms(), loadSetup()]);
      drafts = Object.fromEntries(bulbs.map((bulb) => [bulb.id, bulb.name ?? '']));
    } catch (e) {
      error = (e as Error).message || 'Studio could not load your bulbs.';
    } finally {
      loading = false;
    }
  }

  async function discover() {
    controller = new AbortController();
    busy = true;
    retryDiscovery = false;
    error = '';
    notice = 'Searching your network for bulbs…';
    try {
      const result = await discoverBulbs(controller.signal);
      if (controller.signal.aborted) return;
      [bulbs, rooms] = await Promise.all([loadBulbs(), loadRooms()]);
      drafts = Object.fromEntries(bulbs.map((bulb) => [bulb.id, bulb.name ?? '']));
      notice =
        result.foundCount === 0
          ? ''
          : `Found ${result.foundCount} bulb${result.foundCount === 1 ? '' : 's'}.`;
      if (result.foundCount === 0) {
        error = 'No bulbs answered. Check that they are powered and on the same network as Emby.';
        retryDiscovery = true;
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        error = (e as Error).message || 'Bulb discovery failed.';
        retryDiscovery = true;
      }
    } finally {
      if (controller && !controller.signal.aborted) {
        controller = null;
        busy = false;
      }
    }
  }

  function cancelDiscovery() {
    controller?.abort();
    controller = null;
    busy = false;
    notice = 'Discovery cancelled. Your saved bulb inventory has been kept.';
  }

  async function identify(bulb: RoomBulb) {
    identifying = bulb.id;
    failure = null;
    try {
      await identifyBulb(bulb.id);
      notice = `${displayName(bulb)} finished identifying.`;
    } catch {
      failure = {
        id: bulb.id,
        message: `Didn't answer${bulb.ipAddress ? ` at ${bulb.ipAddress}` : ''}`,
      };
    } finally {
      setTimeout(() => {
        if (identifying === bulb.id) identifying = '';
      }, 2000);
    }
  }

  async function saveName(bulb: RoomBulb) {
    const name = (drafts[bulb.id] ?? '').trim();
    if (name.length < 1 || name.length > 40) return;
    error = '';
    try {
      await renameBulb(bulb.id, name);
      bulbs = await loadBulbs();
      drafts = Object.fromEntries(bulbs.map((item) => [item.id, item.name ?? '']));
      notice = `${name} saved. It can now be placed in a room.`;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function forget(bulb: RoomBulb) {
    if (bulb.roomId) return;
    if (!confirm(`Forget ${displayName(bulb)}? You can find it again later.`)) return;
    error = '';
    try {
      await forgetBulb(bulb.id);
      bulbs = await loadBulbs();
      drafts = Object.fromEntries(bulbs.map((item) => [item.id, item.name ?? '']));
      notice = 'Bulb forgotten.';
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function displayName(bulb: RoomBulb) {
    return bulb.isNamed ? bulb.name : 'Unnamed bulb';
  }
</script>

<svelte:head><title>Bulbs · OpenLightFX Studio</title></svelte:head>
<div class="bulbs-app">
  <header>
    <strong>OpenLightFX Studio</strong>
    <a href="#/bulbs" aria-current="page">Bulbs</a>
    <a href="#/rooms">Rooms</a>
    <a href="#/library">Library</a>
    <span class="spacer"></span><span>Emby</span>
    <a
      href="https://github.com/openlightfx/openlightfx-studio/blob/main/docs/journeys/J1-first-light.md"
      >Help</a
    >
  </header>
  <main>
    <section class="intro">
      <h1>{bulbs.length === 0 ? 'Set up your bulbs' : 'Your bulbs'}</h1>
      <p>
        Find each light, identify which one it is, and give it a name you will recognize. Your bulb
        list is saved on this Emby server.
      </p>
      {#if rooms.length === 0 && bulbs.length === 0}
        <p class="first-run">
          This is the first step. You can skip setup and write a track without lights.
        </p>
      {/if}
    </section>

    {#if setup && !setup.isAdmin}
      <p class="notice" role="status">
        Only an Emby administrator can discover, name, or identify bulbs.
      </p>
    {/if}
    {#if error}<p class="error" role="alert">
        {error}{#if retryDiscovery}<button onclick={() => void discover()}>Try again</button
          >{:else}<button onclick={() => void refresh()}>Retry</button>{/if}
      </p>{/if}
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}

    <section class="inventory" aria-label="Bulb inventory">
      <div class="toolbar">
        <div>
          <h2>Bulb inventory</h2>
          <p>{bulbs.length} known · {bulbs.filter((bulb) => bulb.isNamed).length} named</p>
        </div>
        <div class="actions">
          <button disabled={busy || setup?.isAdmin !== true} onclick={() => void discover()}
            >{busy ? 'Searching…' : 'Find bulbs'}</button
          >
          {#if busy}<button class="quiet" onclick={cancelDiscovery}>Cancel</button>{/if}
        </div>
      </div>
      {#if busy}<progress aria-label="Finding bulbs"></progress>{/if}
      {#if loading}
        <p role="status">Loading bulbs…</p>
      {:else if bulbs.length === 0}
        <div class="empty">
          <h2>No bulbs found yet</h2>
          <p>
            Turn on your WiZ, LIFX, or Govee bulbs, then choose Find bulbs. They must be on the same
            network as Emby.
          </p>
        </div>
      {:else}
        <div class="list">
          {#each bulbs as bulb (bulb.id)}
            <article class="bulb" aria-label={displayName(bulb)}>
              <div class="identity">
                <strong>{displayName(bulb)}</strong>
                <small
                  >{bulb.protocol} · {bulb.model ?? 'Unknown model'}{bulb.ipAddress
                    ? ` · ${bulb.ipAddress}`
                    : ''}{bulb.lastSeenAt
                    ? ` · Last seen ${new Date(bulb.lastSeenAt).toLocaleString()}`
                    : ''}</small
                >
                {#if bulb.roomId}<small class="assigned"
                    >In {rooms.find((room) => room.id === bulb.roomId)?.name ?? 'a room'} · remove it
                    from that room before forgetting it.</small
                  >{/if}
                {#if failure?.id === bulb.id}<small class="error-text" role="status"
                    >{failure.message}</small
                  >{/if}
              </div>
              <div class="name-editor">
                <label for={`bulb-name-${bulb.id}`}
                  >{bulb.isNamed ? 'Bulb name' : 'Name this bulb'}</label
                >
                <input
                  id={`bulb-name-${bulb.id}`}
                  maxlength="40"
                  value={drafts[bulb.id] ?? ''}
                  placeholder="e.g. Left reading lamp"
                  disabled={setup?.isAdmin !== true}
                  oninput={(event) => (drafts[bulb.id] = event.currentTarget.value)}
                />
                <button
                  disabled={setup?.isAdmin !== true ||
                    !(drafts[bulb.id] ?? '').trim() ||
                    (drafts[bulb.id] ?? '').trim().length > 40 ||
                    (bulb.isNamed && (drafts[bulb.id] ?? '').trim() === bulb.name)}
                  onclick={() => void saveName(bulb)}
                  >{bulb.isNamed ? 'Save name' : 'Name bulb'}</button
                >
              </div>
              <div class="bulb-actions">
                <button
                  disabled={identifying === bulb.id || setup?.isAdmin !== true}
                  onclick={() => void identify(bulb)}
                  >{identifying === bulb.id ? 'Flashing…' : 'Identify'}</button
                >
                <button
                  class="quiet"
                  disabled={!!bulb.roomId || setup?.isAdmin !== true}
                  onclick={() => void forget(bulb)}>Forget</button
                >
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    <footer>
      <a class="button-link" href="#/rooms">Next: set up a room →</a>
      {#if rooms.length === 0}<button
          class="quiet"
          onclick={() => {
            localStorage.setItem('olfx-setup-skipped', 'true');
            location.hash = '#/library';
          }}>Skip setup — write a track without lights</button
        >{/if}
    </footer>
  </main>
</div>

<style>
  .bulbs-app {
    min-height: 100vh;
    color: var(--text);
    background: var(--bg);
    font:
      14px/1.45 system-ui,
      sans-serif;
  }
  header {
    height: 48px;
    display: flex;
    align-items: center;
    gap: 20px;
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
  main {
    max-width: 1060px;
    margin: 0 auto;
    padding: 24px;
  }
  h1,
  h2,
  p {
    margin-top: 0;
  }
  h1 {
    font-size: 24px;
    margin-bottom: 6px;
  }
  h2 {
    font-size: 17px;
    margin-bottom: 3px;
  }
  .intro {
    margin-bottom: 20px;
  }
  .intro p,
  .toolbar p {
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .first-run,
  .notice {
    padding: 10px 12px;
    background: var(--surface);
    border: 1px solid var(--surface2);
    border-radius: 6px;
  }
  .inventory {
    padding: 16px;
    background: var(--surface);
    border: 1px solid var(--surface2);
    border-radius: 8px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }
  .toolbar p {
    margin: 0;
  }
  .actions,
  .bulb-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .list {
    display: grid;
    gap: 10px;
  }
  .bulb {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(240px, 1fr) auto;
    align-items: center;
    gap: 18px;
    padding: 12px;
    border: 1px solid var(--surface2);
    border-radius: 7px;
  }
  .identity {
    min-width: 0;
  }
  .identity strong,
  .identity small {
    display: block;
    overflow-wrap: anywhere;
  }
  small {
    color: var(--text-muted);
  }
  .assigned {
    margin-top: 4px;
  }
  .name-editor {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 5px 8px;
    align-items: center;
  }
  .name-editor label {
    grid-column: 1 / -1;
    color: var(--text-muted);
    font-size: 12px;
  }
  input {
    min-width: 0;
    padding: 8px;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--surface3);
    border-radius: 5px;
    font: inherit;
  }
  button,
  .button-link {
    cursor: pointer;
    color: var(--text);
    background: var(--surface2);
    border: 1px solid var(--surface3);
    border-radius: 6px;
    padding: 7px 10px;
    font: inherit;
    text-decoration: none;
    white-space: nowrap;
  }
  button:hover:not(:disabled),
  .button-link:hover {
    border-color: var(--accent);
  }
  button:focus-visible,
  a:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--accent2);
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .quiet {
    color: var(--text-muted);
  }
  .empty {
    text-align: center;
    padding: 40px 12px;
    color: var(--text-muted);
  }
  .error {
    color: var(--danger);
    padding: 10px;
    background: rgba(239, 68, 68, 0.12);
    border-radius: 6px;
  }
  .error button {
    margin-left: 10px;
  }
  .error-text {
    color: var(--danger);
  }
  progress {
    width: 100%;
    margin-bottom: 10px;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 16px;
  }
  @media (max-width: 760px) {
    header {
      gap: 10px;
      padding: 0 10px;
    }
    main {
      padding: 16px 12px;
    }
    .bulb {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .name-editor {
      grid-template-columns: 1fr;
    }
    .name-editor label {
      grid-column: auto;
    }
    .bulb-actions {
      justify-content: flex-start;
    }
    footer {
      justify-content: flex-start;
    }
  }
</style>
