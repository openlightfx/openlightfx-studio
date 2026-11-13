<script lang="ts">
  import { onMount } from 'svelte';
  import {
    deleteRoom,
    discoverBulbs,
    identifyBulb,
    loadBulbs,
    loadCurrentUser,
    loadDevices,
    loadRooms,
    loadSetup,
    positions,
    renameBulb,
    saveRoom,
    type EmbyDevice,
    type Position,
    type Room,
    type RoomBulb,
    type Setup,
  } from '$lib/api/rooms';
  let rooms = $state<Room[]>([]);
  let devices = $state<EmbyDevice[]>([]);
  let currentUser = $state<{ id: string; name: string } | null>(null);
  let showAllDevices = $state(false);
  let bulbs = $state<RoomBulb[]>([]);
  let setup = $state<Setup | null>(null);
  let selected = $state<string | null>(null);
  let fresh = $state(true);
  let name = $state('Living Room');
  let screenId = $state('');
  let placed = $state<{ id: string; position: Position | null; follows: Position | null }[]>([]);
  let busy = $state(false);
  let identifying = $state('');
  let identifyFailure = $state<{ id: string; message: string } | null>(null);
  let notice = $state('');
  let error = $state('');
  let connectionFailed = $state(false);
  let noBulbs = $state(false);
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
  const unplaced = $derived(bulbs.filter((b) => !assigned.has(b.id)));
  const screenDevices = $derived(
    showAllDevices || !currentUser
      ? devices
      : devices.filter(
          (device) =>
            device.lastUserId?.toLowerCase() === currentUser.id.toLowerCase() ||
            device.roomId === selected
        )
  );
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
      [rooms, devices, bulbs, setup, currentUser] = await Promise.all([
        loadRooms(),
        loadDevices(),
        loadBulbs(),
        loadSetup(),
        loadCurrentUser().catch(() => null),
      ]);
      const id = location.hash.match(/^#\/rooms\/([^/?]+)/)?.[1];
      const room = rooms.find((r) => r.id === id) ?? rooms[0];
      if (room) {
        openRoom(room);
        fresh = false;
      } else if (!selected) {
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
  async function discover() {
    busy = true;
    noBulbs = false;
    error = '';
    notice = 'Searching for bulbs…';
    try {
      const result = await discoverBulbs();
      bulbs = await loadBulbs();
      const foundCount = result.foundCount ?? result.bulbs.length;
      if (foundCount === 0) {
        noBulbs = true;
        error =
          'No bulbs answered. Check the bulbs are powered and on the same network as the Emby server. If Emby runs in Docker, it needs host networking for discovery.';
        notice = '';
      } else {
        notice = `Found ${foundCount} bulbs.`;
      }
    } catch (e) {
      error = (e as Error).message;
      notice = '';
    } finally {
      busy = false;
    }
  }
  function place(id: string, pos: Position | null) {
    const bulb = bulbs.find((b) => b.id === id);
    if (!bulb) return;
    if (pos === null) {
      if (placed.some((entry) => entry.id === id)) remove(id);
      return;
    }
    if (
      bulb.roomId &&
      bulb.roomId !== selected &&
      !confirm(`Move ${bulb.name} from its other room?`)
    )
      return;
    placed = [...placed.filter((x) => x.id !== id), { id, position: pos, follows: null }];
    notice = 'Unsaved changes';
  }
  function remove(id: string) {
    placed = placed.filter((x) => x.id !== id);
    notice = 'Unsaved changes';
  }
  async function identify(id: string) {
    identifying = id;
    identifyFailure = null;
    try {
      await identifyBulb(id);
      notice = 'Identify finished.';
    } catch {
      const bulb = bulbs.find((item) => item.id === id);
      identifyFailure = {
        id,
        message: `Didn't answer${bulb?.ipAddress ? ` at ${bulb.ipAddress}` : ''}`,
      };
      setTimeout(() => {
        if (identifyFailure?.id === id) identifyFailure = null;
      }, 10_000);
    } finally {
      setTimeout(() => {
        if (identifying === id) identifying = '';
      }, 2000);
    }
  }
  async function rename(id: string) {
    const bulb = bulbs.find((b) => b.id === id);
    const next = prompt('Bulb name', bulb?.name);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      error = 'Bulb names must be 1–40 characters.';
      return;
    }
    try {
      await renameBulb(id, trimmed);
      bulbs = await loadBulbs();
      notice = 'Bulb renamed.';
    } catch (e) {
      error = (e as Error).message;
    }
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
      if (
        error.includes('another room') &&
        confirm('This screen or bulb belongs to another room. Move it here?')
      ) {
        try {
          const device = devices.find((d) => d.deviceId === screenId)!;
          const room = await saveRoom(
            selected,
            {
              name,
              screenDeviceId: screenId,
              deviceName: device.name,
              appName: device.appName,
              bulbs: placed,
            },
            current?.updatedAt,
            true
          );
          await refresh();
          openRoom(room);
          error = '';
          notice = 'Room saved.';
        } catch (ex) {
          error = (ex as Error).message;
        }
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
<div class="rooms-app">
  <header>
    <strong>OpenLightFX Studio</strong><a class="active" href="#/rooms">Rooms</a><a href="#/library"
      >Library</a
    ><span class="spacer"></span><span>Emby</span><a
      href="https://github.com/openlightfx/openlightfx-studio/blob/main/docs/journeys/J1-first-light.md"
      >Help</a
    >
  </header>
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
        <h1>Welcome to OpenLightFX</h1>
        <p>
          OpenLightFX lights your room in time with a movie. First, tell it about the room you watch
          in: its screen and its bulbs. It takes a few minutes.
        </p>
        <button onclick={() => (location.hash = '#/library')}
          >Skip — write a track without lights</button
        >
      </div>{/if}
    {#if error}<p class="error" role="alert">
        {error}{#if connectionFailed}<button onclick={() => void refresh()}>Retry</button
          >{/if}{#if noBulbs}<button onclick={() => void discover()}>Try again</button>{/if}
      </p>{/if}
    {#if placed.length === 0}<p class="notice" role="status">
        No bulbs yet. Tracks will not light this room until you add bulbs.
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
          ><option value="">{screenDevices.length ? 'Choose a device…' : 'No devices yet. Open Emby on the room’s TV once, then click Refresh.'}</option
          >{#each screenDevices as device (device.deviceId)}<option value={device.deviceId}
              >{device.name} · {device.appName}{device.lastUserName ? ` · ${device.lastUserName}` : ''}{lastSeen(device.lastActivity) ? ` · ${lastSeen(device.lastActivity)}` : ''}{device.roomId && device.roomId !== selected
                ? ` · In ${device.roomName ?? 'another room'}`
                : ''}</option
            >{/each}</select
        ></label
      ><button
        disabled={setup?.isAdmin !== true}
        onclick={() => loadDevices().then((x) => (devices = x))}>Refresh</button
      >
    </div>
    {#if currentUser && devices.some((device) => device.lastUserId && device.lastUserId.toLowerCase() !== currentUser.id.toLowerCase() && device.roomId !== selected)}
      <label class="device-filter"><input type="checkbox" bind:checked={showAllDevices} /> Show devices last used by other users</label>
    {/if}
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
        <div class="panelhead">
          <b>Available bulbs</b><button
            disabled={busy || setup?.isAdmin !== true}
            onclick={discover}>{busy ? 'Searching…' : 'Find bulbs'}</button
          >
        </div>
        {#if busy}<progress></progress>{/if}
        <p>
          Found {unplaced.length} · Known bulbs stay listed after discovery. Bulbs in other rooms can
          be moved here.
        </p>
        {#if unplaced.length === 0}<p class="empty">
            No bulbs found yet. Find bulbs searches your network for WiZ, LIFX, Govee and Hue.
          </p>{/if}{#each unplaced as bulb (bulb.id)}<div
            class="bulb"
            role="listitem"
            draggable="true"
            ondragstart={() => (dragBulb = bulb.id)}
          >
            <span
              >⠿ <button
                class="text"
                disabled={setup?.isAdmin !== true}
                onclick={() => rename(bulb.id)}>{bulb.name}</button
              ><small
                >{bulb.protocol} · {bulb.model ?? 'Unknown model'} · {bulb.ipAddress ??
                  ''}{bulb.roomId && bulb.roomId !== selected
                  ? ` · In ${rooms.find((r) => r.id === bulb.roomId)?.name ?? 'another room'}`
                  : ''}</small
              ></span
            ><span>
              {#if identifyFailure?.id === bulb.id}<small role="status">{identifyFailure.message}</small>{/if}
              <button
                disabled={identifying === bulb.id || setup?.isAdmin !== true}
                onclick={() => identify(bulb.id)}
                >{identifying === bulb.id ? 'Flashing…' : 'Identify'}</button
              >
            </span>
            <details>
              <summary>Place ▾</summary>
              <div class="place-menu">
                {#each positions as position}<button onclick={() => place(bulb.id, position)}
                    >{labels[position]}</button
                  >{/each}<button onclick={() => place(bulb.id, null)}>Not in this room</button>
              </div>
            </details>
          </div>{/each}
      </aside>
    </div>
    <footer>
      <button disabled={!current || setup?.isAdmin !== true} onclick={removeRoom}
        >Delete room</button
      ><span>{notice}</span><button
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
        ><button disabled={setup?.isAdmin !== true} onclick={() => identify(b.id)}>Identify</button
        ><button disabled={setup?.isAdmin !== true} onclick={() => rename(b.id)}>Rename…</button
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
    font:
      13px/1.4 'Inter',
      system-ui,
      sans-serif;
    color: var(--text);
    background: var(--bg);
    min-height: 100vh;
    position: relative;
  }
  header {
    height: 42px;
    border-bottom: 1px solid var(--surface2);
    background: var(--surface);
    display: flex;
    align-items: center;
    gap: 22px;
    padding: 0 16px;
  }
  header strong {
    color: var(--text);
  }
  header a {
    color: var(--text-muted);
    text-decoration: none;
    padding: 6px 8px;
    border-radius: 4px;
  }
  header a:hover {
    color: var(--text);
    background: var(--surface2);
  }
  header a.active {
    color: var(--text);
    background: var(--surface3);
  }
  .spacer {
    flex: 1;
  }
  .room-list {
    position: absolute;
    top: 43px;
    bottom: 0;
    left: 0;
    width: 196px;
    padding: 12px;
    border-right: 1px solid var(--surface2);
    background: var(--surface);
  }
  .room-list h2 {
    font-size: 14px;
    margin: 0 0 8px;
    color: var(--text);
  }
  .room-list button {
    display: block;
    width: 100%;
    text-align: left;
    margin-bottom: 8px;
    padding: 8px;
    color: var(--text);
    background: var(--surface2);
    border: 1px solid transparent;
    border-radius: 6px;
  }
  .room-list button.chosen {
    border-color: var(--accent);
  }
  .room-list small,
  .bulb small {
    display: block;
    color: var(--text-muted);
  }
  main {
    margin: 14px 18px 0 220px;
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
    padding: 12px;
    border: 1px solid var(--surface2);
    border-radius: 8px;
    background: var(--surface);
    margin-bottom: 12px;
  }
  .welcome h1 {
    font-size: 18px;
    margin: 0 0 6px;
    color: var(--text);
  }
  .topfields {
    display: flex;
    gap: 24px;
    align-items: end;
    margin-bottom: 12px;
  }
  .device-filter {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: -4px 0 12px;
    color: var(--text-muted);
  }
  .topfields label {
    display: grid;
    gap: 4px;
    color: var(--text-muted);
  }
  .topfields input,
  .topfields select {
    min-width: 220px;
    padding: 7px;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--surface3);
    border-radius: 6px;
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(540px, 1.3fr) minmax(340px, 1fr);
    gap: 14px;
  }
  .diagram {
    position: relative;
    height: 410px;
    border: 1px solid var(--surface3);
    border-radius: 8px;
    background: var(--timeline-lane-bg);
  }
  .screen {
    position: absolute;
    top: 8px;
    left: 30%;
    width: 40%;
    text-align: center;
    background: var(--surface3);
    color: var(--text);
    padding: 6px;
    border-radius: 4px;
  }
  .zone {
    position: absolute;
    border: 1px dashed var(--surface3);
    border-radius: 6px;
    background: var(--surface);
    padding: 5px;
    min-height: 80px;
  }
  .zone b {
    display: block;
    font-size: 12px;
    margin-bottom: 6px;
    color: var(--text);
  }
  .left {
    left: 10px;
    top: 45px;
    width: 25%;
    height: 100px;
  }
  .center {
    left: 30%;
    top: 45px;
    width: 38%;
    height: 75px;
  }
  .right {
    right: 10px;
    top: 45px;
    width: 25%;
    height: 100px;
  }
  .surround-left {
    left: 10px;
    top: 190px;
    width: 25%;
    height: 100px;
  }
  .surround-right {
    right: 10px;
    top: 190px;
    width: 25%;
    height: 100px;
  }
  .ambient {
    left: 10px;
    right: 10px;
    bottom: 10px;
    height: 68px;
  }
  .seat {
    position: absolute;
    left: 35%;
    top: 200px;
    width: 30%;
    height: 45px;
    border: 1px solid var(--surface3);
    border-radius: 4px;
    background: var(--surface2);
    text-align: center;
    padding-top: 12px;
    color: var(--text-muted);
  }
  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin: 3px;
    padding: 3px 5px;
    color: var(--text);
    background: var(--surface2);
    border: 1px solid var(--surface3);
    border-radius: 4px;
  }
  .chip button {
    border: 0;
    background: transparent;
    color: var(--text);
    padding: 0 3px;
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
    border: 1px solid var(--surface2);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text-muted);
    padding: 10px;
  }
  .bulb-panel {
    border: 1px solid var(--surface2);
    border-radius: 8px;
    background: var(--surface);
    padding: 10px;
    min-height: 350px;
  }
  .panelhead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 12px;
  }
  .bulb {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--surface2);
    padding: 8px 0;
  }
  .bulb .text {
    padding: 0;
    border: 0;
    color: var(--accent2);
    text-decoration: underline;
    background: none;
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
    margin: 12px 0;
  }
  footer span {
    flex: 1;
    color: var(--text-muted);
  }
  .error {
    color: var(--danger);
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 6px;
    padding: 8px;
  }
  .notice {
    color: var(--text-muted);
  }
  button {
    cursor: pointer;
    font: inherit;
    color: var(--text);
    background: var(--surface2);
    border: 1px solid var(--surface3);
    border-radius: 6px;
    padding: 6px 10px;
  }
  button:hover:not(:disabled) {
    border-color: var(--accent);
  }
  button:focus-visible {
    outline: 2px solid var(--accent2);
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  @media (max-width: 900px) {
    .room-list {
      position: static;
      width: auto;
    }
    .columns {
      grid-template-columns: 1fr;
    }
    main {
      margin: 12px;
    }
    .topfields {
      flex-wrap: wrap;
    }
  }
</style>
