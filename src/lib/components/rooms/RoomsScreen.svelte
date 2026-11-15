<script lang="ts">
  import StudioHeader from '$lib/components/layout/StudioHeader.svelte';
  import { onMount } from 'svelte';
  import {
    deleteRoom,
    loadBulbs,
    loadDevices,
    loadRooms,
    loadSetup,
    positions,
    saveRoom,
    type EmbyDevice,
    type Position,
    type Room,
    type RoomBulb,
    type Setup,
  } from '$lib/api/rooms';
  let rooms = $state<Room[]>([]);
  let devices = $state<EmbyDevice[]>([]);
  let bulbs = $state<RoomBulb[]>([]);
  let setup = $state<Setup | null>(null);
  let selected = $state<string | null>(null);
  let fresh = $state(true);
  let name = $state('Living Room');
  let screenId = $state('');
  let placed = $state<{ id: string; position: Position | null; follows: Position | null }[]>([]);
  let notice = $state('');
  let error = $state('');
  let connectionFailed = $state(false);
  let conflict = $state(false);
  let menuBulb = $state('');
  let pendingRoom = $state<Room | null>(null);
  let pendingNewRoom = $state(false);
  let unsavedPrompt = $state(false);
  let dragBulb = '';
  const labels: Record<Position, string> = {
    left: 'Left',
    center: 'Center',
    right: 'Right',
    'surround-left': 'Surround Left',
    'surround-right': 'Surround Right',
    ambient: 'Ambient',
  };
  const current = $derived(rooms.find((r) => r.id === selected));
  const validName = $derived(
    name.trim().length >= 1 &&
      name.trim().length <= 40 &&
      !rooms.some(
        (room) =>
          room.id !== selected && room.name.trim().toLowerCase() === name.trim().toLowerCase()
      )
  );
  const assigned = $derived(new Set(placed.map((b) => b.id)));
  const unplaced = $derived(bulbs.filter((b) => b.isNamed && !assigned.has(b.id)));
  const positionsUsed = $derived(
    new Set(placed.map((b) => b.position).filter((p): p is Position => !!p))
  );
  const layout = $derived(
    positionsUsed.has('surround-left') || positionsUsed.has('surround-right')
      ? '5.0'
      : positionsUsed.has('center')
        ? '3.0'
        : positionsUsed.has('left') || positionsUsed.has('right')
          ? '2.0'
          : 'Ambient'
  );
  onMount(() => {
    void refresh();
    const changed = () => {
      if (location.hash.startsWith('#/rooms')) void refresh();
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  });
  async function refresh() {
    connectionFailed = false;
    error = '';
    try {
      [rooms, devices, bulbs, setup] = await Promise.all([
        loadRooms(),
        loadDevices(),
        loadBulbs(),
        loadSetup(),
      ]);
      const id = location.hash.match(/^#\/rooms\/([^/?]+)/)?.[1];
      const room = rooms.find((r) => r.id === id) ?? rooms[0];
      if (room) {
        openRoom(room);
        fresh = false;
      } else {
        fresh = true;
        selected = null;
        name = 'Living Room';
        screenId = '';
        placed = [];
      }
    } catch (e) {
      connectionFailed = true;
      error = (e as Error).message;
    }
  }
  function openRoom(room: Room) {
    if (notice === 'Unsaved changes') {
      pendingNewRoom = false;
      pendingRoom = room;
      unsavedPrompt = true;
      return;
    }
    selectRoom(room);
  }
  function selectRoom(room: Room) {
    selected = room.id;
    name = room.name;
    screenId = room.screen.deviceId;
    placed = room.bulbs.map((b) => ({ ...b }));
    notice = '';
  }
  function finishPendingChange() {
    const target = pendingRoom;
    pendingRoom = null;
    const createNew = pendingNewRoom;
    pendingNewRoom = false;
    if (target) selectRoom(target);
    else if (createNew) newRoom();
  }
  async function resolveUnsaved(action: 'save' | 'discard' | 'cancel') {
    unsavedPrompt = false;
    if (action === 'cancel') return;
    if (action === 'save') {
      await save();
      if (notice !== 'Room saved.') {
        if (!conflict) unsavedPrompt = true;
        return;
      }
    } else {
      notice = '';
    }
    finishPendingChange();
  }
  function newRoom() {
    selected = null;
    fresh = false;
    name = `Room ${rooms.length + 1}`;
    screenId = '';
    placed = [];
    notice = 'Unsaved changes';
  }
  function place(id: string, pos: Position | null) {
    const bulb = bulbs.find((b) => b.id === id);
    if (!bulb) return;
    if (pos === null) {
      if (placed.some((entry) => entry.id === id)) remove(id);
      return;
    }
    if (!bulb.isNamed) {
      notice = 'Name this bulb on the Bulbs page before placing it in a room.';
      return;
    }
    if (bulb.roomId && bulb.roomId !== selected) {
      const roomName = rooms.find((room) => room.id === bulb.roomId)?.name ?? 'another room';
      notice = `This bulb is already assigned to ${roomName}.`;
      return;
    }
    placed = [...placed.filter((x) => x.id !== id), { id, position: pos, follows: null }];
    notice = 'Unsaved changes';
  }
  function remove(id: string) {
    placed = placed.filter((x) => x.id !== id);
    notice = 'Unsaved changes';
  }
  function lastSeen(value?: string): string {
    if (!value) return '';
    const elapsed = Math.max(0, Date.now() - Date.parse(value));
    if (!Number.isFinite(elapsed)) return '';
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return 'last seen just now';
    if (minutes < 60) return `last seen ${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `last seen ${hours} h ago`;
    return `last seen ${Math.floor(hours / 24)} d ago`;
  }
  function setFollows(id: string, value: string) {
    placed = placed.map((b) =>
      b.id === id ? { ...b, follows: value === 'auto' ? null : (value as Position) } : b
    );
    menuBulb = '';
    notice = 'Unsaved changes';
  }
  async function reloadConflict() {
    conflict = false;
    try {
      rooms = await loadRooms();
      const latest = rooms.find((room) => room.id === selected);
      if (latest) selectRoom(latest);
      if (pendingRoom || pendingNewRoom) finishPendingChange();
      error = '';
    } catch (e) {
      error = (e as Error).message;
      connectionFailed = true;
    }
  }
  async function keepMine() {
    try {
      rooms = await loadRooms();
      if (!rooms.some((room) => room.id === selected)) throw new Error('This room was deleted.');
      conflict = false;
      await save();
      if (notice === 'Room saved.') finishPendingChange();
    } catch (e) {
      error = (e as Error).message;
    }
  }
  async function save() {
    error = '';
    notice = 'Saving…';
    try {
      const device = devices.find((d) => d.deviceId === screenId);
      if (!device) throw new Error('Choose a screen for this room.');
      const data = {
        name,
        screenDeviceId: screenId,
        deviceName: device.name,
        appName: device.appName,
        bulbs: placed,
      };
      const room = await saveRoom(selected, data, current?.updatedAt);
      await refresh();
      openRoom(room);
      fresh = false;
      notice = 'Room saved.';
    } catch (e) {
      error = (e as Error).message;
      if (/stale|changed in another tab/i.test(error)) {
        conflict = true;
        return;
      }
    }
  }
  async function removeRoom() {
    if (!current || !confirm(`Delete ${current.name}? Its bulbs become unplaced.`)) return;
    try {
      await deleteRoom(current.id);
      selected = null;
      await refresh();
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

<svelte:head><title>Rooms · OpenLightFX Studio</title></svelte:head>
<div class="rooms-app studio-page">
  <StudioHeader current="rooms" />
  <aside class="room-list">
    <h2>Your rooms</h2>
    {#if setup && !setup.isAdmin}<p role="status">
        Room changes require an Emby administrator.
      </p>{/if}
    {#if rooms.length === 0}<p>No rooms yet.</p>{/if}{#each rooms as room (room.id)}<button
        class:chosen={selected === room.id}
        onclick={() => openRoom(room)}
        ><b>{room.name}</b><small
          >{room.screen.deviceName} · {room.bulbs.length} bulbs · {room.suggestedLayout
            ?.replace('LAYOUT_', '')
            .replace('_', '.') ?? '—'}</small
        ></button
      >{/each}<button
      disabled={setup?.isAdmin !== true}
      onclick={() => {
        if (notice === 'Unsaved changes') {
          pendingRoom = null;
          pendingNewRoom = true;
          unsavedPrompt = true;
        } else newRoom();
      }}>+ New room</button
    >
  </aside>
  <main>
    <section class="page-intro">
      <p class="eyebrow">A place for every light</p>
      <h1>{fresh && rooms.length === 0 ? 'Set up a room' : 'Your room'}</h1>
      <p>Choose your screen. Place your lights. Studio takes care of the connections.</p>
    </section>
    {#if conflict}<div class="dialog-backdrop">
        <dialog open aria-labelledby="conflict-title" class="unsaved-dialog">
          <h2 id="conflict-title">This room changed in another tab</h2>
          <p>Reload the latest version, or keep your edits and overwrite it.</p>
          <div>
            <button onclick={() => void reloadConflict()}>Reload</button>
            <button onclick={() => void keepMine()}>Keep mine</button>
            <button onclick={() => (conflict = false)}>Cancel</button>
          </div>
        </dialog>
      </div>{/if}
    {#if unsavedPrompt}<div class="dialog-backdrop">
        <dialog open aria-labelledby="unsaved-title" class="unsaved-dialog">
          <h2 id="unsaved-title">This room has unsaved changes</h2>
          <p>Save your changes before leaving this room?</p>
          <div>
            <button onclick={() => void resolveUnsaved('save')}>Save</button>
            <button onclick={() => void resolveUnsaved('discard')}>Discard</button>
            <button onclick={() => void resolveUnsaved('cancel')}>Cancel</button>
          </div>
        </dialog>
      </div>{/if}
    {#if fresh && rooms.length === 0}<div class="card welcome">
        <p>Choose the Emby screen in this room, then place your named bulbs on the diagram.</p>
        {#if bulbs.filter((bulb) => bulb.isNamed).length === 0}<p>
            No named bulbs are ready yet. <a href="#/bulbs">Find and name bulbs</a>, or continue
            without lights.
          </p>{/if}
        <a href="#/library">Write a track without lights</a>
      </div>{/if}
    {#if error}<p class="error" role="alert">
        {error}{#if connectionFailed}<button onclick={() => void refresh()}>Retry</button>{/if}
      </p>{/if}
    {#if placed.length === 0}<p class="notice" role="status">
        No bulbs placed yet. Tracks will not light this room until you add bulbs.
        {#if bulbs.filter((bulb) => bulb.isNamed).length === 0}<a href="#/bulbs"
            >Find and name bulbs</a
          >{/if}
      </p>{/if}
    <div class="topfields">
      <label
        >Room name<input
          maxlength="40"
          disabled={setup?.isAdmin !== true}
          bind:value={name}
          oninput={() => (notice = 'Unsaved changes')}
        /></label
      ><label
        >Screen (the Emby app in this room)<select
          disabled={setup?.isAdmin !== true}
          bind:value={screenId}
          onchange={() => (notice = 'Unsaved changes')}
          ><option value=""
            >{devices.length
              ? 'Choose a device…'
              : 'No devices yet. Open Emby on the room’s TV once, then click Refresh.'}</option
          >{#each devices as device (device.deviceId)}<option
              value={device.deviceId}
              disabled={!!device.roomId && device.roomId !== selected}
              >{device.name} · {device.appName}{device.lastUserName
                ? ` · ${device.lastUserName}`
                : ''}{lastSeen(device.lastActivity)
                ? ` · ${lastSeen(device.lastActivity)}`
                : ''}{device.roomId && device.roomId !== selected
                ? ` · In ${device.roomName ?? 'another room'}`
                : ''}</option
            >{/each}</select
        ></label
      ><button
        disabled={setup?.isAdmin !== true}
        onclick={() => loadDevices().then((x) => (devices = x))}>Refresh</button
      >
    </div>
    <div class="columns">
      <div class="diagram-area">
        <div class="diagram">
          <div class="screen">
            SCREEN — {devices.find((d) => d.deviceId === screenId)?.name ?? 'Choose a screen'}
          </div>
          <div
            class="zone left"
            role="region"
            aria-label="Left bulb position"
            ondragover={(e) => e.preventDefault()}
            ondrop={() => place(dragBulb, 'left')}
          >
            <b>Left</b>{#each placed.filter((b) => b.position === 'left') as b (b.id)}{@render chip(
                b
              )}{/each}
          </div>
          <div
            class="zone center"
            role="region"
            aria-label="Center bulb position"
            ondragover={(e) => e.preventDefault()}
            ondrop={() => place(dragBulb, 'center')}
          >
            <b>Center (behind / around screen)</b
            >{#each placed.filter((b) => b.position === 'center') as b (b.id)}{@render chip(
                b
              )}{/each}
          </div>
          <div
            class="zone right"
            role="region"
            aria-label="Right bulb position"
            ondragover={(e) => e.preventDefault()}
            ondrop={() => place(dragBulb, 'right')}
          >
            <b>Right</b
            >{#each placed.filter((b) => b.position === 'right') as b (b.id)}{@render chip(
                b
              )}{/each}
          </div>
          <div class="seat">seating</div>
          <div
            class="zone surround-left"
            role="region"
            aria-label="Surround left bulb position"
            ondragover={(e) => e.preventDefault()}
            ondrop={() => place(dragBulb, 'surround-left')}
          >
            <b>Surround Left</b
            >{#each placed.filter((b) => b.position === 'surround-left') as b (b.id)}{@render chip(
                b
              )}{/each}
          </div>
          <div
            class="zone surround-right"
            role="region"
            aria-label="Surround right bulb position"
            ondragover={(e) => e.preventDefault()}
            ondrop={() => place(dragBulb, 'surround-right')}
          >
            <b>Surround Right</b
            >{#each placed.filter((b) => b.position === 'surround-right') as b (b.id)}{@render chip(
                b
              )}{/each}
          </div>
          <div
            class="zone ambient"
            role="region"
            aria-label="Ambient bulb position"
            ondragover={(e) => e.preventDefault()}
            ondrop={() => place(dragBulb, 'ambient')}
          >
            <b>Ambient — anywhere in the room</b
            >{#each placed.filter((b) => b.position === 'ambient' || !b.position) as b (b.id)}{@render chip(
                b
              )}{/each}
          </div>
        </div>
        <p class="coverage">
          <b>This room plays {layout} tracks natively.</b>
          {#if layout !== '5.0'}5.0 surround channels fold into Left and Right.{/if}
        </p>
      </div>
      <aside class="bulb-panel">
        <div class="panelhead"><b>Named bulbs</b><a href="#/bulbs">Manage bulbs</a></div>
        <p>
          Only bulbs named on the Bulbs page can be placed here. Bulbs assigned to other rooms
          remain visible but cannot be moved.
        </p>
        {#if unplaced.length === 0}<p class="empty">
            No named bulbs are available to place. <a href="#/bulbs">Find and name bulbs</a> first.
          </p>{/if}{#each unplaced as bulb (bulb.id)}<div
            class="bulb"
            role="listitem"
            draggable={!bulb.roomId || bulb.roomId === selected}
            ondragstart={() => {
              if (!bulb.roomId || bulb.roomId === selected) dragBulb = bulb.id;
            }}
          >
            <span
              >⠿ <b>{bulb.name}</b><small
                >{bulb.protocol} · {bulb.model ?? 'Unknown model'} · {bulb.ipAddress ??
                  ''}{bulb.roomId && bulb.roomId !== selected
                  ? ` · In ${rooms.find((r) => r.id === bulb.roomId)?.name ?? 'another room'}`
                  : ''}</small
              ></span
            >
            <details>
              <summary>Place ▾</summary>
              <div class="place-menu">
                {#each positions as position}<button
                    disabled={!!bulb.roomId && bulb.roomId !== selected}
                    onclick={() => place(bulb.id, position)}>{labels[position]}</button
                  >{/each}<button
                  disabled={!!bulb.roomId && bulb.roomId !== selected}
                  onclick={() => place(bulb.id, null)}>Not in this room</button
                >
              </div>
            </details>
          </div>{/each}
      </aside>
    </div>
    <footer>
      <button class="danger" disabled={!current || setup?.isAdmin !== true} onclick={removeRoom}
        >Delete room</button
      ><span>{notice}</span><button
        class="primary"
        disabled={!validName || !screenId || setup?.isAdmin !== true}
        onclick={save}>Save room</button
      ><button onclick={() => (location.hash = '#/library')}>Next: pick a movie →</button>
    </footer>
  </main>
</div>
{#snippet chip(b: { id: string; position: Position | null; follows: Position | null })}<span
    class="chip"
    role="group"
    aria-label="Placed bulb"
    draggable="true"
    ondragstart={() => (dragBulb = b.id)}
    >⠿ {bulbs.find((x) => x.id === b.id)?.name ?? b.id}
    {#if b.follows}→ {labels[b.follows]}{/if}<button
      aria-label="Bulb options"
      onclick={() => (menuBulb = menuBulb === b.id ? '' : b.id)}>⋮</button
    ><button
      aria-label="Take out of room"
      disabled={setup?.isAdmin !== true}
      onclick={() => remove(b.id)}>×</button
    >{#if menuBulb === b.id}<span class="chip-menu"
        ><label
          >Follows<select
            disabled={setup?.isAdmin !== true}
            value={b.follows ?? 'auto'}
            onchange={(e) => setFollows(b.id, (e.target as HTMLSelectElement).value)}
            ><option value="auto">Auto ({labels[b.position ?? 'ambient']})</option
            >{#each positions as p}<option value={p}>{labels[p]}</option>{/each}</select
          ></label
        ><button disabled={setup?.isAdmin !== true} onclick={() => remove(b.id)}
          >Take out of room</button
        ></span
      >{/if}</span
  >{/snippet}

<style>
  .rooms-app {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    grid-template-rows: auto 1fr;
  }
  .rooms-app :global(.studio-header) {
    grid-column: 1 / -1;
  }
  .room-list {
    padding: var(--space-8) var(--space-4);
    border-right: 1px solid var(--border);
    background: var(--header-bg);
  }
  .room-list h2 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0 0 var(--space-5);
    color: var(--text-muted);
  }
  .room-list button {
    display: block;
    width: 100%;
    text-align: left;
    margin-bottom: var(--space-2);
    padding: var(--space-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius);
  }
  .room-list button.chosen {
    color: var(--accent-text);
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .room-list small,
  .bulb small {
    display: block;
    color: var(--text-muted);
  }
  main {
    min-width: 0;
    padding: var(--space-8);
    max-width: 1600px;
    width: 100%;
    margin: 0 auto;
  }
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.65);
  }
  .unsaved-dialog {
    width: min(420px, calc(100vw - 32px));
    padding: 20px;
    border: 1px solid var(--surface3);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
  }
  .unsaved-dialog h2 {
    margin: 0 0 8px;
    font-size: 17px;
    color: var(--text);
  }
  .unsaved-dialog p {
    color: var(--text-muted);
  }
  .unsaved-dialog div {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .card {
    padding: var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    margin-bottom: var(--space-6);
    color: var(--text-muted);
  }
  .topfields {
    display: flex;
    gap: var(--space-4);
    align-items: end;
    margin: var(--space-6) 0;
  }
  .topfields label {
    display: grid;
    gap: var(--space-2);
    color: var(--text-muted);
    min-width: 0;
    flex: 1;
    font-size: 12px;
  }
  .topfields label:nth-child(2) {
    flex: 2;
  }
  .topfields input,
  .topfields select {
    width: 100%;
    font-size: 14px;
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(260px, 1fr);
    gap: var(--space-5);
  }
  .diagram {
    display: grid;
    grid-template-columns: 1fr 1.2fr 1fr;
    grid-template-areas: 'screen screen screen' 'left center right' 'sl seat sr' 'ambient ambient ambient';
    grid-template-rows: auto minmax(120px, auto) minmax(120px, auto) minmax(80px, auto);
    gap: var(--space-3);
    padding: var(--space-5);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .screen {
    grid-area: screen;
    justify-self: center;
    width: 66%;
    text-align: center;
    padding: 8px 12px;
    margin-bottom: var(--space-3);
    border-top: 3px solid var(--text-muted);
    border-radius: var(--radius-sm);
    background: var(--surface2);
    color: var(--text-muted);
    font-size: 11px;
    letter-spacing: 0.04em;
  }
  .zone {
    min-width: 0;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-2);
    background: var(--bg);
    transition:
      border-color var(--transition),
      background var(--transition);
  }
  .zone:hover {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .zone > b {
    display: block;
    font-size: 11px;
    font-weight: 500;
    margin-bottom: var(--space-2);
    color: var(--text-muted);
  }
  .left {
    grid-area: left;
  }
  .center {
    grid-area: center;
  }
  .right {
    grid-area: right;
  }
  .surround-left {
    grid-area: sl;
  }
  .surround-right {
    grid-area: sr;
  }
  .ambient {
    grid-area: ambient;
  }
  .seat {
    grid-area: seat;
    align-self: center;
    text-align: center;
    padding: var(--space-4) var(--space-2);
    border: 1px solid var(--border);
    border-radius: 16px 16px 6px 6px;
    background: var(--surface2);
    color: var(--text-subtle);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin: 3px;
    padding: 5px 7px;
    max-width: 100%;
    flex-wrap: wrap;
    color: var(--text);
    background: var(--surface2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }
  .chip button {
    border: 0;
    background: transparent;
    color: var(--text);
    padding: 0 3px;
    min-height: 24px;
  }
  .chip-menu {
    position: absolute;
    z-index: 5;
    top: 100%;
    left: 0;
    min-width: 160px;
    background: var(--surface);
    border: 1px solid var(--surface3);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    display: grid;
    padding: 5px;
  }
  .chip-menu button,
  .chip-menu select {
    padding: 5px;
    color: var(--text);
    background: var(--surface2);
    border: 1px solid var(--surface3);
    border-radius: 4px;
  }
  .coverage {
    color: var(--text-muted);
    padding: var(--space-4) var(--space-1);
    font-size: 12px;
  }
  .bulb-panel {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    padding: var(--space-5);
    align-self: start;
    min-height: 300px;
    color: var(--text-muted);
  }
  .panelhead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--text);
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    font-size: 13px;
  }
  .bulb {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--surface2);
    padding: 8px 0;
  }
  .bulb details {
    position: relative;
  }
  .place-menu {
    position: absolute;
    z-index: 4;
    background: var(--surface);
    border: 1px solid var(--surface3);
    border-radius: 6px;
    display: grid;
    min-width: 150px;
    right: 0;
    padding: var(--space-1);
    box-shadow: var(--shadow-popover);
  }
  .empty {
    text-align: center;
    color: var(--text-muted);
    margin-top: 45px;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: var(--space-6) 0;
    padding-top: var(--space-5);
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
  }
  footer span {
    flex: 1;
    color: var(--text-muted);
  }
  .error {
    color: var(--danger);
    background: var(--danger-soft);
    border: 1px solid var(--danger);
    border-radius: 6px;
    padding: 8px;
  }
  .notice {
    color: var(--text-muted);
  }
  @media (max-width: 1200px) {
    .columns {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 900px) {
    .rooms-app {
      grid-template-columns: minmax(0, 1fr);
    }
    .room-list {
      border-right: 0;
      border-bottom: 1px solid var(--border);
      padding: var(--space-4);
    }
    .room-list button {
      display: inline-block;
      width: auto;
      margin: 0 var(--space-2) var(--space-2) 0;
    }
    .columns {
      grid-template-columns: 1fr;
    }
    main {
      padding: var(--space-6) var(--page-gutter);
    }
    .diagram {
      padding: var(--space-3);
      gap: var(--space-2);
    }
    .topfields label {
      flex-basis: 100%;
    }
    footer span {
      flex-basis: 100%;
      order: -1;
    }
    .topfields {
      flex-wrap: wrap;
    }
  }
</style>
