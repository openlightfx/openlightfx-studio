<script lang="ts">
  import { onMount } from 'svelte';
  import StudioHeader from '$lib/components/layout/StudioHeader.svelte';
  import StudioIcon from '$lib/components/shared/StudioIcon.svelte';
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
<div class="bulbs-app studio-page">
  <StudioHeader current="bulbs" />
  <main>
    <section class="intro page-intro">
      <p class="eyebrow">Your lighting, connected</p>
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
          <button
            class="primary"
            disabled={busy || setup?.isAdmin !== true}
            onclick={() => void discover()}
            ><StudioIcon name="search" size={17} />{busy ? 'Searching…' : 'Find bulbs'}</button
          >
          {#if busy}<button class="quiet" onclick={cancelDiscovery}>Cancel</button>{/if}
        </div>
      </div>
      {#if busy}<progress aria-label="Finding bulbs"></progress>{/if}
      {#if loading}
        <p role="status">Loading bulbs…</p>
      {:else if bulbs.length === 0}
        <div class="empty">
          <span class="empty-icon"><StudioIcon name="bulb" size={28} /></span>
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
                  class="danger"
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
      <a class="button-link" href="#/rooms"
        >Next: set up a room <StudioIcon name="arrow" size={17} /></a
      >
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
  main {
    max-width: 1240px;
    margin: 0 auto;
    padding: var(--space-10) var(--page-gutter);
  }
  h1,
  h2,
  p {
    margin-top: 0;
  }
  h2 {
    margin-bottom: var(--space-1);
  }
  .intro p:not(.eyebrow),
  .toolbar p {
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .first-run {
    margin-top: var(--space-5);
    padding-left: var(--space-4);
    border-left: 2px solid var(--border-strong);
  }
  .inventory {
    padding: var(--space-6);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: var(--space-6);
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
  }
  .bulb {
    display: grid;
    grid-template-columns: minmax(150px, 1fr) minmax(220px, 1fr) auto;
    align-items: center;
    gap: 18px;
    padding: var(--space-5) 0;
    border-top: 1px solid var(--border);
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
  .empty {
    text-align: center;
    padding: var(--space-12) var(--space-6);
    border-top: 1px solid var(--border);
    color: var(--text-muted);
  }
  .error {
    padding: var(--space-4);
    background: var(--danger-soft);
    border-radius: var(--radius);
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
    justify-content: flex-start;
    gap: 10px;
    margin-top: var(--space-6);
    flex-direction: row-reverse;
  }
  @media (max-width: 1000px) {
    .bulb {
      grid-template-columns: 1fr 1fr;
    }
    .bulb-actions {
      grid-column: 2;
    }
  }
  @media (max-width: 760px) {
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
      grid-column: auto;
      justify-content: flex-start;
    }
    footer {
      justify-content: flex-start;
    }
  }
</style>
