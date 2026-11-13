<script lang="ts">
  import { onMount } from 'svelte';
  import {
    deleteRoom,
    discoverBulbs,
    identifyBulb,
    loadBulbs,
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
  let bulbs = $state<RoomBulb[]>([]);
  let setup = $state<Setup | null>(null);
  let selected = $state<string | null>(null);
  let fresh = $state(true);
  let name = $state('Living Room');
  let screenId = $state('');
  let placed = $state<{ id: string; position: Position | null; follows: Position | null }[]>([]);
  let busy = $state(false);
  let identifying = $state('');
  let notice = $state('');
  let error = $state('');
  let menuBulb = $state('');
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
  const assigned = $derived(new Set(placed.map((b) => b.id)));
  const unplaced = $derived(bulbs.filter((b) => !assigned.has(b.id)));
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
      } else if (!selected) {
        fresh = true;
        selected = null;
        name = 'Living Room';
        screenId = '';
        placed = [];
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }
  function openRoom(room: Room) {
    selected = room.id;
    name = room.name;
    screenId = room.screen.deviceId;
    placed = room.bulbs.map((b) => ({ ...b }));
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
    error = '';
    notice = 'Searching for bulbs…';
    try {
      await discoverBulbs();
      bulbs = await loadBulbs();
      notice = `Found ${bulbs.length} known bulbs.`;
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
    try {
      await identifyBulb(id);
      notice = 'Identify finished.';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      setTimeout(() => (identifying = ''), 1500);
    }
  }
  async function rename(id: string) {
    const bulb = bulbs.find((b) => b.id === id);
    const next = prompt('Bulb name', bulb?.name);
    if (!next) return;
    try {
      await renameBulb(id, next);
      bulbs = await loadBulbs();
      notice = 'Bulb renamed.';
    } catch (e) {
      error = (e as Error).message;
    }
  }
  function setFollows(id: string, value: string) {
    placed = placed.map((b) =>
      b.id === id ? { ...b, follows: value === 'auto' ? null : (value as Position) } : b
    );
    menuBulb = '';
    notice = 'Unsaved changes';
  }
  async function save() {
    error = '';
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
    <strong>OpenLightFX Studio</strong><a class="active" href="#/rooms">Rooms</a><span
      aria-disabled="true"
      title="Library is outside the room-setup step">Library</span
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
      >{/each}<button disabled={setup?.isAdmin !== true} onclick={newRoom}>+ New room</button>
  </aside>
  <main>
    {#if fresh && rooms.length === 0}<div class="card welcome">
        <h1>Welcome to OpenLightFX</h1>
        <p>
          OpenLightFX lights your room in time with a movie. First, tell it about the room you watch
          in: its screen and its bulbs. It takes a few minutes.
        </p>
        <button disabled title="Track writing is outside the room-setup step"
          >Skip — write a track without lights</button
        >
      </div>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
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
          ><option value="">Choose a device…</option
          >{#each devices as device (device.deviceId)}<option
              value={device.deviceId}
              disabled={!!device.roomId && device.roomId !== selected}
              >{device.name} · {device.appName}{device.roomId && device.roomId !== selected
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
            ><button
              disabled={identifying === bulb.id || setup?.isAdmin !== true}
              onclick={() => identify(bulb.id)}
              >{identifying === bulb.id ? 'Flashing…' : 'Identify'}</button
            >
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
        disabled={!name.trim() || !screenId || setup?.isAdmin !== true}
        onclick={save}>Save room</button
      >
    </footer>
  </main>
</div>
{#snippet chip(b: { id: string; position: Position | null; follows: Position | null })}<span
    class="chip"
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
      13px/1.4 system-ui,
      sans-serif;
    color: #222;
    background: #fff;
    min-height: 100vh;
  }
  header {
    height: 42px;
    border-bottom: 1px solid #999;
    background: #eee;
    display: flex;
    align-items: center;
    gap: 22px;
    padding: 0 16px;
  }
  header a {
    color: inherit;
    text-decoration: none;
    padding: 7px;
  }
  .active {
    border: 1px solid #555;
    background: white;
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
    border-right: 1px solid #aaa;
    background: #fafafa;
  }
  .room-list h2 {
    font-size: 14px;
  }
  .room-list button {
    display: block;
    width: 100%;
    text-align: left;
    margin-bottom: 8px;
    padding: 8px;
    background: #fff;
  }
  .room-list button.chosen {
    border: 2px solid #333;
  }
  .room-list small,
  .bulb small {
    display: block;
    color: #777;
  }
  main {
    margin: 14px 18px 0 220px;
  }
  .card {
    padding: 12px;
    border: 1px solid #aaa;
    margin-bottom: 12px;
  }
  .welcome {
    background: white;
  }
  .welcome h1 {
    font-size: 18px;
    margin: 0 0 6px;
  }
  .topfields {
    display: flex;
    gap: 24px;
    align-items: end;
    margin-bottom: 12px;
  }
  .topfields label {
    display: grid;
    gap: 4px;
    color: #555;
  }
  .topfields input,
  .topfields select {
    min-width: 220px;
    padding: 7px;
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(540px, 1.3fr) minmax(340px, 1fr);
    gap: 14px;
  }
  .diagram {
    position: relative;
    height: 410px;
    border: 2px solid #444;
    background: white;
  }
  .screen {
    position: absolute;
    top: 8px;
    left: 30%;
    width: 40%;
    text-align: center;
    background: #555;
    color: #fff;
    padding: 6px;
  }
  .zone {
    position: absolute;
    border: 1px dashed #666;
    background: #f2f2f2;
    padding: 5px;
    min-height: 80px;
  }
  .zone b {
    display: block;
    font-size: 12px;
    margin-bottom: 6px;
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
    border: 1px solid #aaa;
    background: #eee;
    text-align: center;
    padding-top: 12px;
    color: #777;
  }
  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin: 3px;
    padding: 3px 5px;
    background: white;
    border: 1px solid #888;
    border-radius: 4px;
  }
  .chip button {
    border: 0;
    background: transparent;
    padding: 0 3px;
  }
  .chip-menu {
    position: absolute;
    z-index: 5;
    top: 100%;
    left: 0;
    min-width: 160px;
    background: white;
    border: 1px solid #555;
    box-shadow: 0 2px 6px #888;
    display: grid;
    padding: 5px;
  }
  .chip-menu button,
  .chip-menu select {
    padding: 5px;
  }
  .coverage {
    border: 1px solid #aaa;
    background: #eee;
    padding: 10px;
  }
  .bulb-panel {
    border: 1px solid #aaa;
    padding: 10px;
    min-height: 350px;
  }
  .panelhead {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .bulb {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid #ccc;
    padding: 8px 0;
  }
  .bulb .text {
    padding: 0;
    border: 0;
    text-decoration: underline;
    background: none;
  }
  .bulb details {
    position: relative;
  }
  .place-menu {
    position: absolute;
    z-index: 4;
    background: white;
    border: 1px solid #777;
    display: grid;
    min-width: 150px;
  }
  .empty {
    text-align: center;
    color: #777;
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
    color: #777;
  }
  .error {
    color: #900;
    background: #fee;
    padding: 8px;
  }
  button {
    cursor: pointer;
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
