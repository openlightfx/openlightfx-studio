<script lang="ts">
  import { onMount } from 'svelte';
  import { L1_SHORTCUTS, sampleChannel } from '$lib/domain';
  import type { Channel, EffectKeyframe, Keyframe, Track } from '$lib/domain';
  import { setActiveTrack } from '$lib/api/client';
  import {
    loadBulbs,
    loadRoomRouting,
    loadSetup,
    loadRooms,
    sendRoomPreviewFrame,
    startRoomPreview,
    stopRoomPreview,
  } from '$lib/api/rooms';
  import type { Room, RoomBulb, RoomRouting } from '$lib/api/rooms';
  import type { StudioSession } from '$lib/studio/session.svelte';

  let { session, bindVideo } = $props<{
    session: StudioSession;
    bindVideo: (video: HTMLVideoElement) => void;
  }>();
  let menu = $state('');
  let video = $state<HTMLVideoElement | null>(null);
  let fileInput: HTMLInputElement;
  let timelineContainer: HTMLDivElement;
  let rooms = $state<Room[]>([]);
  let bulbs = $state<RoomBulb[]>([]);
  let selectedRoomId = $state('');
  let routing = $state<RoomRouting | null>(null);
  let routingError = $state('');
  let roomsLoaded = $state(false);
  let canManage = $state(true);
  let lightsOn = $state(false);
  let previewError = $state('');
  let watchConfirmation = $state('');
  let settingsOpen = $state(false);
  let leavePrompt = $state(false);
  let routingRequest = 0;
  let sendingFrame = false;
  let lastPreviewFrame = '';
  let lastPreviewSentAt = 0;
  let activePreviewSignature = $state('');
  let diamondDrag: { id: string; startX: number } | null = null;
  let selectedEffectId = $state('');
  let ruler: HTMLDivElement;
  const duration = $derived(Math.max(session.durationMs(), 1));
  const timelineWidth = $derived(Math.max(100, duration * session.pxPerMs));
  const roomCount = $derived(rooms.length);
  const selected = $derived(
    session.track?.keyframes.find((keyframe: Keyframe) => session.selection.includes(keyframe.id))
  );
  const selectedEffect = $derived(
    session.track?.effects.find((effect: EffectKeyframe) => effect.id === selectedEffectId)
  );
  const timeLabel = $derived(`${format(session.playheadMs)} / ${format(duration)}`);

  $effect(() => {
    if (video) bindVideo(video);
  });

  $effect(() => {
    const signature = JSON.stringify({ roomId: selectedRoomId, channels: trackChannels() });
    if (!lightsOn || !session.track) return;
    if (signature !== activePreviewSignature) {
      activePreviewSignature = signature;
      void restartPreviewForTrackChange();
    }
  });

  $effect(() => {
    const roomId = selectedRoomId;
    const channels = (session.track as Track | null)?.channels.map((channel: Channel) => ({
      id: channel.id,
      spatialHint: channel.spatialHint,
      displayName: channel.displayName,
    }));
    if (!roomId || !channels?.length) {
      routing = null;
      routingError = '';
      return;
    }
    const requestId = ++routingRequest;
    void loadRoomRouting(roomId, channels)
      .then((result) => {
        if (requestId === routingRequest) {
          routing = result;
          routingError = '';
        }
      })
      .catch((error: unknown) => {
        if (requestId === routingRequest) {
          routing = null;
          routingError = (error as Error).message || 'Lane routing could not be loaded.';
        }
      });
    return () => {
      routingRequest++;
    };
  });

  onMount(() => {
    let alive = true;
    void Promise.all([loadRooms(), loadBulbs(), loadSetup()])
      .then(([nextRooms, nextBulbs, setup]) => {
        if (!alive) return;
        rooms = nextRooms;
        bulbs = nextBulbs;
        canManage = setup.isAdmin && !session.nonAdmin;
        selectedRoomId = nextRooms[0]?.id ?? '';
      })
      .catch((error: unknown) => {
        if (alive) previewError = (error as Error).message || 'Rooms could not be loaded.';
      })
      .finally(() => {
        if (alive) roomsLoaded = true;
      });
    const timer = window.setInterval(() => void pushPreviewFrame(), 100);
    return () => {
      alive = false;
      window.clearInterval(timer);
      if (lightsOn) void stopRoomPreview();
    };
  });
  function trackChannels() {
    return ((session.track as Track | null)?.channels ?? []).map((channel: Channel) => ({
      id: channel.id,
      spatialHint: channel.spatialHint,
      displayName: channel.displayName,
    }));
  }

  async function startPreview(takeover = false) {
    if (!selectedRoomId || !trackChannels().length) return;
    await startRoomPreview(selectedRoomId, trackChannels(), takeover);
    lightsOn = true;
    activePreviewSignature = JSON.stringify({ roomId: selectedRoomId, channels: trackChannels() });
    previewError = '';
    lastPreviewFrame = '';
    lastPreviewSentAt = 0;
  }

  async function toggleLights() {
    if (!canManage) {
      previewError = 'Only an Emby administrator can preview on lights.';
      return;
    }
    if (lightsOn) {
      lightsOn = false;
      activePreviewSignature = '';
      try {
        await stopRoomPreview();
        previewError = '';
      } catch (error) {
        previewError = (error as Error).message || 'Preview could not be stopped.';
      }
      return;
    }
    if (!selectedRoomId) return;
    try {
      await startPreview();
    } catch (error) {
      const message = (error as Error).message || 'Preview could not start.';
      if (/playback_active/i.test(message)) {
        if (
          !window.confirm('Emby is playing with lighting. Take over the bulbs for Studio preview?')
        )
          return;
        try {
          await startPreview(true);
        } catch (takeoverError) {
          previewError = (takeoverError as Error).message || 'Preview could not start.';
        }
      } else {
        previewError = message;
      }
    }
  }

  async function restartPreviewForTrackChange() {
    lightsOn = false;
    try {
      await stopRoomPreview();
      await startPreview();
    } catch (error) {
      lightsOn = false;
      activePreviewSignature = '';
      previewError = (error as Error).message || 'Preview could not restart for this track.';
    }
  }

  async function changePreviewRoom(roomId: string) {
    const restart = lightsOn;
    if (restart) {
      lightsOn = false;
      try {
        await stopRoomPreview();
      } catch (error) {
        previewError = (error as Error).message || 'The previous preview could not stop.';
        return;
      }
    }
    selectedRoomId = roomId;
    routing = null;
    lastPreviewFrame = '';
    if (restart) {
      try {
        await startPreview();
      } catch (error) {
        previewError = (error as Error).message || 'Preview could not start in this room.';
      }
    }
  }

  async function pushPreviewFrame() {
    const track = session.track as Track | null;
    if (!lightsOn || !track || sendingFrame) return;
    const hasSolo = Object.values(session.solo).some(Boolean);
    const states = track.channels.map((channel) => {
      const sample = sampleChannel(
        track.keyframes.filter((keyframe: Keyframe) => keyframe.channelId === channel.id),
        session.playheadMs
      );
      const audible = !session.mute[channel.id] && (!hasSolo || session.solo[channel.id]);
      return {
        channelId: channel.id,
        r: audible ? sample.r : 0,
        g: audible ? sample.g : 0,
        b: audible ? sample.b : 0,
        brightness: audible ? sample.brightness : 0,
        transitionMs: 0,
      };
    });
    const signature = JSON.stringify(states);
    if (signature === lastPreviewFrame && Date.now() - lastPreviewSentAt < 5000) return;
    sendingFrame = true;
    try {
      const response = await sendRoomPreviewFrame(states);
      if (response.active === false) {
        lightsOn = false;
        previewError = 'Preview stopped because no frames were received.';
        return;
      }
      lastPreviewFrame = signature;
      lastPreviewSentAt = Date.now();
    } catch (error) {
      lightsOn = false;
      previewError = (error as Error).message || 'The room bulbs did not answer.';
      try {
        await stopRoomPreview();
      } catch {
        // The plugin may already have stopped and restored its preview session.
      }
    } finally {
      sendingFrame = false;
    }
  }

  function setColorComponent(component: 'r' | 'g' | 'b', raw: string) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > 255) return;
    if (selected) {
      const color = { ...selected.color, [component]: value };
      session.setHex(
        [color.r, color.g, color.b].map((part) => part.toString(16).padStart(2, '0')).join('')
      );
    } else if (session.activeChannelId) {
      const channel = session.channels.find(
        (candidate: Channel) => candidate.id === session.activeChannelId
      );
      if (!channel) return;
      const color = { ...channel.defaultColor, [component]: value };
      session.setDefaultColor(
        channel.id,
        [color.r, color.g, color.b].map((part) => part.toString(16).padStart(2, '0')).join('')
      );
    }
  }

  function positionLabel(value: string | null | undefined): string {
    const normalized = (value ?? '')
      .replace(/^SPATIAL_/i, '')
      .replace(/[_-]/g, ' ')
      .trim()
      .toLowerCase();
    if (normalized.includes('surround left')) return 'Surround Left';
    if (normalized.includes('surround right')) return 'Surround Right';
    if (normalized.includes('behind screen') || /\b(center|centre)\b/.test(normalized))
      return 'Center';
    if (/\bleft\b/.test(normalized)) return 'Left';
    if (/\bright\b/.test(normalized)) return 'Right';
    if (
      normalized.includes('ambient') ||
      normalized.includes('ceiling') ||
      normalized.includes('floor')
    )
      return 'Ambient';
    return 'No position';
  }

  function laneDescription(channel: Channel): string {
    const routed = routing?.channels.find((entry) => entry.channelId === channel.id);
    const candidates = [channel.spatialHint, channel.id, channel.displayName];
    const name = routed?.position
      ? positionLabel(routed.position)
      : (candidates.map(positionLabel).find((label) => label !== 'No position') ?? 'No position');
    if (!selectedRoomId || !routing) return name;
    if (!routed) return name;
    const bulbNames = routed.bulbIds
      .map((id) => bulbs.find((bulb) => bulb.id === id)?.name)
      .filter((bulbName): bulbName is string => Boolean(bulbName));
    const folded = routing.channels
      .filter(
        (entry) =>
          entry.channelId !== channel.id &&
          routed.position &&
          entry.foldedInto.includes(routed.position)
      )
      .map(
        (entry) =>
          session.channels.find((candidate: Channel) => candidate.id === entry.channelId)
            ?.displayName
      )
      .filter((position): position is string => Boolean(position));
    if (routed.foldedInto.length > 0)
      return `${name} → folds into ${routed.foldedInto.map((position) => positionLabel(position)).join(' and ')}`;
    const reach = bulbNames.length > 0 ? bulbNames.join(', ') : 'no bulbs reached';
    return `${name} — ${reach}${folded.length ? ` (+ ${folded.join(', ')} folded in)` : ''}`;
  }

  function format(ms: number) {
    const value = Math.max(0, Math.round(ms));
    const h = Math.floor(value / 3_600_000);
    const m = Math.floor((value % 3_600_000) / 60_000);
    const s = Math.floor((value % 60_000) / 1000);
    const milli = value % 1000;
    return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
  }

  function scrub(event: PointerEvent) {
    if (!ruler) return;
    const bounds = ruler.getBoundingClientRect();
    session.seek(((event.clientX - bounds.left) / bounds.width) * duration);
  }

  function laneClick(event: MouseEvent, channelId: string) {
    const lane = event.currentTarget as HTMLElement;
    const bounds = lane.getBoundingClientRect();
    const time = ((event.clientX - bounds.left) / bounds.width) * duration;
    selectedEffectId = '';
    session.activeChannelId = channelId;
    session.insertAt(time, channelId);
  }

  function beginDiamond(event: PointerEvent, keyframeId: string) {
    diamondDrag = { id: keyframeId, startX: event.clientX };
    (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
  }

  function changeLayout(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const previous = session.track?.metadata.channelLayout ?? 'LAYOUT_2_0';
    session.setLayout(select.value);
    if ((session.track?.metadata.channelLayout ?? 'LAYOUT_2_0') === previous)
      select.value = previous;
  }

  function fitTimeline() {
    if (timelineContainer) session.laneWidth = timelineContainer.clientWidth;
    session.zoomFit();
  }

  function moveDiamond(event: PointerEvent, keyframeId: string) {
    const drag = diamondDrag;
    diamondDrag = null;
    if (!drag || drag.id !== keyframeId || Math.abs(event.clientX - drag.startX) < 4) return;
    const lane = (event.currentTarget as HTMLElement).closest('.lane');
    if (!lane) return;
    const bounds = lane.getBoundingClientRect();
    session.moveKeyframe(keyframeId, ((event.clientX - bounds.left) / bounds.width) * duration);
  }

  function closeEditor() {
    if (session.dirty) {
      leavePrompt = true;
      return;
    }
    location.hash = `#/movie/${encodeURIComponent(session.item?.itemId ?? '')}`;
  }

  async function saveAndLeave() {
    await session.save();
    if (!session.dirty) {
      leavePrompt = false;
      location.hash = `#/movie/${encodeURIComponent(session.item?.itemId ?? '')}`;
    }
  }

  async function watchInEmby() {
    if (!session.track || !session.item || !canManage) return;
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      previewError = 'Allow pop-ups to open this movie in Emby.';
      return;
    }
    tab.opener = null;
    try {
      if (session.dirty) {
        await session.save();
        if (session.dirty) {
          tab.close();
          return;
        }
      }
      const result = await setActiveTrack(session.item.itemId, session.trackId);
      tab.location.href = result.embyUrl;
      const room = rooms.find((candidate) => candidate.id === selectedRoomId);
      watchConfirmation = room
        ? `Plays in Emby. Start ${session.item.name} on ${room.screen.deviceName} and the lights will follow.`
        : 'Plays in Emby. Set up a room so the lights follow.';
    } catch (error) {
      tab.close();
      session.alert = (error as Error).message || 'Could not open this movie in Emby.';
    }
  }

  async function handleFile(file?: File) {
    if (file) await session.importFile(file);
    if (fileInput) fileInput.value = '';
  }
</script>

<svelte:head
  ><title>{session.track?.metadata.title ?? 'Edit track'} · OpenLightFX Studio</title></svelte:head
>
{#if session.editorLoading}
  <main class="route-status" role="status">
    <strong>Opening {session.item?.name ?? 'movie'}…</strong>
    <p>Loading the movie and track.</p>
  </main>
{:else if session.editorLoadError}
  <main class="route-status">
    <h1>Could not open this track</h1>
    <p role="alert">{session.editorLoadError}</p>
    <a href={session.item ? `#/movie/${encodeURIComponent(session.item.itemId)}` : '#/library'}>
      Return to {session.item?.name ?? 'the Library'}
    </a>
  </main>
{/if}
<div
  class="editor"
  class:editor-hidden={session.editorLoading || Boolean(session.editorLoadError)}
  aria-hidden={session.editorLoading || Boolean(session.editorLoadError)}
>
  <header class="menubar">
    <div class="menus">
      {#each ['File', 'Edit', 'Help'] as name}
        <div class="menu-wrap">
          <button
            class="menu-trigger"
            aria-expanded={menu === name}
            onclick={() => (menu = menu === name ? '' : name)}>{name}</button
          >
          {#if menu === name}
            <div class="menu" role="menu">
              {#if name === 'File'}
                <button
                  role="menuitem"
                  onclick={() => {
                    menu = '';
                    closeEditor();
                  }}>New track…</button
                >
                <button
                  role="menuitem"
                  onclick={() => {
                    menu = '';
                    closeEditor();
                  }}>Open…</button
                >
                <button
                  role="menuitem"
                  onclick={() => {
                    menu = '';
                    fileInput?.click();
                  }}>Open a .lightfx file…</button
                >
                <button
                  role="menuitem"
                  disabled={!session.track || !canManage}
                  title={!canManage
                    ? 'Only an Emby administrator can save'
                    : !session.track
                      ? 'No track is open'
                      : ''}
                  onclick={() => {
                    menu = '';
                    void session.save();
                  }}>Save <span>Ctrl/⌘ S</span></button
                >
                <button
                  role="menuitem"
                  disabled={!session.track}
                  onclick={() => {
                    menu = '';
                    session.download();
                  }}>Export .lightfx…</button
                >
                <button
                  role="menuitem"
                  onclick={() => {
                    menu = '';
                    closeEditor();
                  }}>Close</button
                >
              {:else if name === 'Edit'}
                <button
                  role="menuitem"
                  disabled={!session.canUndo}
                  title={!session.canUndo ? 'Nothing to undo' : ''}
                  onclick={() => {
                    menu = '';
                    session.undo();
                  }}>Undo <span>Ctrl/⌘ Z</span></button
                >
                <button
                  role="menuitem"
                  disabled={!session.canRedo}
                  title={!session.canRedo ? 'Nothing to redo' : ''}
                  onclick={() => {
                    menu = '';
                    session.redo();
                  }}>Redo</button
                >
                <button
                  role="menuitem"
                  disabled={!session.selection.length}
                  onclick={() => {
                    menu = '';
                    session.deleteSelection();
                  }}>Delete keyframe <span>Delete</span></button
                >
                <button
                  role="menuitem"
                  onclick={() => {
                    menu = '';
                    settingsOpen = true;
                  }}>Track settings…</button
                >
              {:else}
                <button
                  role="menuitem"
                  onclick={() => {
                    menu = '';
                    session.helpOpen = true;
                  }}>Keyboard shortcuts</button
                >
                <a
                  role="menuitem"
                  href="https://github.com/openlightfx/openlightfx-studio/blob/main/docs/journeys/J1-first-light.md"
                  onclick={() => (menu = '')}>How Studio works</a
                >
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
    <input
      id="track-title"
      class="track-title"
      aria-label="Track title"
      value={session.track?.metadata.title ?? ''}
      oninput={(event) => session.setTitle((event.currentTarget as HTMLInputElement).value)}
    />
    <span class="save-state" aria-live="polite"
      >{session.status === 'Saving…'
        ? 'Saving…'
        : session.dirty
          ? 'Unsaved changes'
          : session.status || 'Saved'}</span
    >
    <span class="spacer"></span>
    {#if rooms.length > 0}
      <label class="room-picker"
        >Preview on
        <select
          aria-label="Preview room"
          value={selectedRoomId}
          onchange={(event) =>
            void changePreviewRoom((event.currentTarget as HTMLSelectElement).value)}
        >
          {#each rooms as room (room.id)}<option value={room.id}>{room.name}</option>{/each}
        </select>
      </label>
    {:else}
      <button disabled title={roomsLoaded ? 'Set up a room first' : 'Loading rooms…'}
        >Preview on ▾</button
      >
    {/if}
    <button
      role="switch"
      aria-checked={lightsOn}
      disabled={!roomCount || !session.track || !canManage || Boolean(routingError)}
      title={!canManage
        ? 'Only an Emby administrator can preview on lights'
        : !roomCount
          ? 'Set up a room first'
          : routingError || ''}
      onclick={() => void toggleLights()}>{lightsOn ? 'Lights on' : 'Lights'}</button
    >
    <button
      class="primary"
      disabled={!canManage || !session.track}
      title={!canManage
        ? 'Only an Emby administrator can watch in Emby'
        : !session.track
          ? 'No track is open'
          : ''}
      onclick={() => void watchInEmby()}>Watch in Emby</button
    >
    <input
      bind:this={fileInput}
      class="file-input"
      type="file"
      accept=".lightfx"
      onchange={(event) => handleFile((event.currentTarget as HTMLInputElement).files?.[0])}
    />
  </header>
  {#if roomsLoaded && roomCount === 0}
    <div class="no-room" role="status">
      Set up a room to preview on your lights. <a href="#/rooms">Set up a room</a>
    </div>
  {/if}
  <main class="workspace">
    <section class="movie-column" aria-label="Movie preview">
      <div class="video-stage">
        {#if session.videoError}
          <div class="error">
            {session.videoError}<button onclick={() => session.retryProxy()}>Retry</button>
          </div>
        {/if}
        {#if session.playReason}<p class="play-reason">{session.playReason}</p>{/if}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={video}
          src={session.videoSrc || undefined}
          style="pointer-events:none"
          muted
          playsinline
          preload="auto"
          onplay={() => (session.playing = true)}
          onpause={() => (session.playing = false)}
          onerror={() => session.onVideoError()}
        ></video>
        {#each session.channels as channel (channel.id)}
          <div
            class={`region ${channel.spatialHint}`}
            data-region={channel.spatialHint}
            data-overlay-rgb={session.sampleRgb(channel.id)}
            hidden={session.regionHidden(channel.id)}
            style={`background:rgba(${session.sampleRgb(channel.id)},.75)`}
            aria-hidden="true"
          ></div>
        {/each}
      </div>
      <div class="transport">
        <button aria-label="Skip back 5 seconds" onclick={() => session.skip(-1)}>⏮ −5 s</button>
        <button aria-label="Previous frame" onclick={() => session.step(-1)}>◀ frame</button>
        <button
          aria-label={session.playing ? 'Pause' : 'Play'}
          disabled={!session.canPlay}
          onclick={() => session.togglePlay()}>{session.playing ? '❚❚ Pause' : '▶ Play'}</button
        >
        <button aria-label="Next frame" onclick={() => session.step(1)}>frame ▶</button>
        <button aria-label="Skip forward 5 seconds" onclick={() => session.skip(1)}>+5 s ⏭</button>
        <time>{timeLabel}</time>
      </div>
    </section>
    <aside class="inspector" aria-label="Inspector">
      {#if selectedEffect}
        <h2>{selectedEffect.effectType}</h2>
        <p>Effect editing comes in a later version. This effect is kept as is.</p>
      {:else if selected}
        <h2>Keyframe</h2>
        <label
          >Time <input
            aria-label="Keyframe time"
            value={format(selected.timestampMs)}
            onchange={(event) =>
              session.setKeyframeTime((event.currentTarget as HTMLInputElement).value)}
          /></label
        >
        <label
          >Color <input
            type="color"
            aria-label="Color"
            value={'#' +
              [selected.color.r, selected.color.g, selected.color.b]
                .map((x) => x.toString(16).padStart(2, '0'))
                .join('')}
            oninput={(event) =>
              session.setHex((event.currentTarget as HTMLInputElement).value.slice(1))}
          /></label
        >
        <label
          >Hex <input
            aria-label="Hex"
            value={session.hex}
            oninput={(event) => session.setHex((event.currentTarget as HTMLInputElement).value)}
          /></label
        >
        <div class="rgb-fields" aria-label="RGB color">
          {#each ['r', 'g', 'b'] as const as component}
            <label
              >{component.toUpperCase()}
              <input
                type="number"
                min="0"
                max="255"
                aria-label={component.toUpperCase()}
                value={selected.color[component]}
                oninput={(event) =>
                  setColorComponent(component, (event.currentTarget as HTMLInputElement).value)}
              /></label
            >
          {/each}
        </div>
        <label
          ><input
            type="radio"
            name="color-mode"
            checked={!session.kelvinOn}
            onchange={() => {
              session.setKelvinMode(false);
              session.setHex(session.hex);
            }}
          /> RGB</label
        >
        <label
          ><input
            type="radio"
            name="color-mode"
            checked={session.kelvinOn}
            onchange={() => {
              session.setKelvinMode(true);
              session.setKelvinValue(session.kelvin);
            }}
          /> Kelvin</label
        >
        {#if session.kelvinOn}
          <label
            >Color temperature <input
              aria-label="Kelvin"
              type="number"
              min="1000"
              max="10000"
              value={session.kelvin}
              oninput={(event) =>
                session.setKelvinValue((event.currentTarget as HTMLInputElement).value)}
            /> K</label
          >
        {/if}
        <button onclick={() => void session.eyedrop()}>Pick color from movie</button>
        <div class="history-swatches" aria-label="Recent colors">
          {#each session.historyColors as color, index (index)}
            <button
              type="button"
              aria-label={`Recent color ${index + 1}`}
              title={color}
              style={`background:${color}`}
              onclick={() => session.setHex(color.slice(1))}
            ></button>
          {/each}
        </div>
        <label
          >Brightness <input
            type="range"
            aria-label="Brightness"
            min="0"
            max="100"
            value={selected.brightness}
            oninput={(event) =>
              session.setBrightness((event.currentTarget as HTMLInputElement).value)}
          /><input
            type="number"
            min="0"
            max="100"
            aria-label="Brightness value"
            value={selected.brightness}
            oninput={(event) =>
              session.setBrightness((event.currentTarget as HTMLInputElement).value)}
          /></label
        >
        <label
          >Fade <select
            aria-label="Fade type"
            value={selected.interpolation === 'STEP' ? 'STEP' : 'LINEAR'}
            onchange={(event) =>
              session.setInterpolation(
                (event.currentTarget as HTMLSelectElement).value as 'STEP' | 'LINEAR'
              )}><option value="STEP">Step</option><option value="LINEAR">Linear</option></select
          ></label
        >
        <label
          >Fade length <input
            aria-label="Fade length"
            type="number"
            min="0"
            value={selected.transitionMs}
            onchange={(event) =>
              session.setTransition((event.currentTarget as HTMLInputElement).value)}
          /> ms</label
        >
        <button onclick={() => session.deleteSelection()}>Delete</button>
      {:else if session.activeChannelId}
        {@const channel = session.channels.find(
          (candidate: Channel) => candidate.id === session.activeChannelId
        )}
        <h2>{channel?.displayName}</h2>
        {#if channel}
          <label
            >Default color <input
              type="color"
              aria-label="Channel default color"
              value={'#' +
                [channel.defaultColor.r, channel.defaultColor.g, channel.defaultColor.b]
                  .map((x) => x.toString(16).padStart(2, '0'))
                  .join('')}
              oninput={(event) =>
                session.setDefaultColor(
                  channel.id,
                  (event.currentTarget as HTMLInputElement).value.slice(1)
                )}
            /></label
          >
          <label
            >Default brightness <input
              type="range"
              aria-label="Channel default brightness"
              min="0"
              max="100"
              value={channel.defaultBrightness}
              oninput={(event) =>
                session.setDefaultBrightness(
                  channel.id,
                  (event.currentTarget as HTMLInputElement).value
                )}
            /></label
          >
          {#if selectedRoomId}<p>{laneDescription(channel)}</p>{/if}
        {/if}
        <p>Click a lane to add a keyframe at that time.</p>
      {:else}
        <p>Click a lane to add a keyframe at that time.</p>
      {/if}
    </aside>
    <section class="timeline" aria-label="Timeline">
      <div class="timeline-tools">
        <label class="layout-picker"
          >Layout
          <select
            aria-label="Track layout"
            value={session.track?.metadata.channelLayout ?? 'LAYOUT_2_0'}
            onchange={changeLayout}
          >
            <option value="LAYOUT_AMBIENT">Ambient</option><option value="LAYOUT_2_0">2.0</option
            ><option value="LAYOUT_3_0">3.0</option><option value="LAYOUT_5_0">5.0</option>
          </select>
        </label>
        <button aria-label="Zoom out" onclick={() => session.zoomKey('[', false)}>−</button>
        <button aria-label="Zoom in" onclick={() => session.zoomKey(']', false)}>+</button>
        <button onclick={fitTimeline}>Fit</button>
      </div>
      <div class="timeline-scroll" bind:this={timelineContainer}>
        <div
          class="ruler"
          style={`width:${timelineWidth}px`}
          bind:this={ruler}
          role="slider"
          aria-label="Timeline ruler"
          aria-valuemin="0"
          aria-valuemax={duration}
          aria-valuenow={Math.round(session.playheadMs)}
          tabindex="0"
          onpointerdown={(event) => {
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            scrub(event);
          }}
          onpointermove={(event) => {
            if (event.buttons) scrub(event);
          }}
          onkeydown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              event.stopPropagation();
              session.step(event.key === 'ArrowLeft' ? -1 : 1);
            }
          }}
        >
          <span>{format(0)}</span><span>{format(duration / 4)}</span><span
            >{format(duration / 2)}</span
          ><span>{format((duration * 3) / 4)}</span><span>{format(duration)}</span>
          <i class="playhead" style={`left:${(session.playheadMs / duration) * 100}%`}></i>
        </div>
        {#each session.channels as channel (channel.id)}
          {@const laneKeyframes =
            session.track?.keyframes
              .filter((keyframe: Keyframe) => keyframe.channelId === channel.id)
              .toSorted((a: Keyframe, b: Keyframe) => a.timestampMs - b.timestampMs) ?? []}
          <div class="lane-row" style={`width:${timelineWidth}px`}>
            <div class="lane-header">
              <button
                class="lane-name"
                title={laneDescription(channel)}
                onclick={() => (session.activeChannelId = channel.id)}
                >{laneDescription(channel)}</button
              >
              <button
                type="button"
                aria-label={`Solo ${channel.displayName}`}
                aria-pressed={Boolean(session.solo[channel.id])}
                onclick={() => session.toggleSolo(channel.id)}>S</button
              >
              <button
                type="button"
                aria-label={`Mute ${channel.displayName}`}
                aria-pressed={Boolean(session.mute[channel.id])}
                onclick={() => session.toggleMute(channel.id)}>M</button
              >
            </div>
            <div class="lane" role="presentation" onclick={(event) => laneClick(event, channel.id)}>
              {#if laneKeyframes.length === 0}
                <span
                  class="color-segment default-segment"
                  aria-hidden="true"
                  style={`left:0;width:100%;background:rgb(${channel.defaultColor.r},${channel.defaultColor.g},${channel.defaultColor.b})`}
                ></span>
              {/if}
              {#if session.track?.keyframes.length === 0}
                <span class="lane-empty">Click to add a keyframe</span>
              {/if}
              {#each session.track?.effects.filter((effect: EffectKeyframe) => effect.channelId === channel.id) ?? [] as effect (effect.id)}
                <button
                  class="effect-block"
                  aria-label={`${effect.effectType} effect, editing comes later`}
                  title="Effect editing comes in a later version. This effect is kept as is."
                  style={`left:${(effect.timestampMs / duration) * 100}%;width:${Math.max(1, (effect.durationMs / duration) * 100)}%`}
                  onclick={(event) => {
                    event.stopPropagation();
                    selectedEffectId = effect.id;
                    session.selection = [];
                    session.activeChannelId = channel.id;
                    session.status =
                      'Effect editing comes in a later version. This effect is kept as is.';
                  }}
                ></button>
              {/each}
              {#each laneKeyframes as keyframe, index (keyframe.id)}
                {@const next = laneKeyframes[index + 1]}
                {@const frameSample = sampleChannel(laneKeyframes, keyframe.timestampMs)}
                <span
                  class="color-segment"
                  aria-hidden="true"
                  style={`left:${(keyframe.timestampMs / duration) * 100}%;width:${(((next?.timestampMs ?? duration) - keyframe.timestampMs) / duration) * 100}%;background:rgb(${frameSample.r},${frameSample.g},${frameSample.b})`}
                ></span>
                <button
                  class="diamond"
                  aria-label={`${channel.displayName} keyframe at ${format(keyframe.timestampMs)}`}
                  class:selected={session.selection.includes(keyframe.id)}
                  style={`left:${(keyframe.timestampMs / duration) * 100}%;background:rgb(${frameSample.r},${frameSample.g},${frameSample.b})`}
                  onpointerdown={(event) => beginDiamond(event, keyframe.id)}
                  onpointerup={(event) => moveDiamond(event, keyframe.id)}
                  onclick={(event) => {
                    event.stopPropagation();
                    selectedEffectId = '';
                    session.selection = event.shiftKey
                      ? [...new Set([...session.selection, keyframe.id])]
                      : [keyframe.id];
                    session.activeChannelId = channel.id;
                  }}
                ></button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>
  </main>
  {#if session.alert}<div class="alert" role="alert">{session.alert}</div>{/if}
  {#if previewError}<div class="alert" role="alert">{previewError}</div>{/if}
  {#if routingError}<div class="alert" role="alert">{routingError}</div>{/if}
  {#if watchConfirmation}
    <div class="watch-confirmation" role="status">
      {watchConfirmation}
      {#if roomCount === 0}<a href="#/rooms">Set up a room</a>{/if}
      <button aria-label="Dismiss watch confirmation" onclick={() => (watchConfirmation = '')}
        >×</button
      >
    </div>
  {/if}
  {#if session.helpOpen}
    <div class="modal-backdrop">
      <div class="leave-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-title">
        <h2 id="shortcut-title">Keyboard shortcuts</h2>
        <ul>
          {#each L1_SHORTCUTS as binding (binding.action)}
            <li>{binding.action}: {binding.keys.join(' / ')}</li>
          {/each}
        </ul>
        <button onclick={() => (session.helpOpen = false)}>Close</button>
      </div>
    </div>
  {/if}
  {#if settingsOpen && session.track}
    <div class="modal-backdrop">
      <div class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title">Track settings</h2>
        <label
          >Title <input
            aria-label="Track settings title"
            value={session.track.metadata.title}
            onchange={(event) => session.setTitle((event.currentTarget as HTMLInputElement).value)}
          /></label
        >
        <label
          >Author <input
            aria-label="Author"
            value={session.track.metadata.author}
            onchange={(event) =>
              session.setMetadata({ author: (event.currentTarget as HTMLInputElement).value })}
          /></label
        >
        <label
          >Description <textarea
            aria-label="Description"
            value={session.track.metadata.description}
            onchange={(event) =>
              session.setMetadata({
                description: (event.currentTarget as HTMLTextAreaElement).value,
              })}
          ></textarea></label
        >
        <label
          >At start <select
            aria-label="Start behavior"
            value={session.track.metadata.startBehavior ?? 'BOUNDARY_UNSPECIFIED'}
            onchange={(event) =>
              session.setMetadata({
                startBehavior: (event.currentTarget as HTMLSelectElement)
                  .value as Track['metadata']['startBehavior'],
              })}
            ><option value="BOUNDARY_UNSPECIFIED">Leave as is</option><option value="LEAVE"
              >Leave</option
            ><option value="OFF">Turn off</option><option value="ON">Turn on</option></select
          ></label
        >
        <label
          >At end <select
            aria-label="End behavior"
            value={session.track.metadata.endBehavior ?? 'BOUNDARY_UNSPECIFIED'}
            onchange={(event) =>
              session.setMetadata({
                endBehavior: (event.currentTarget as HTMLSelectElement)
                  .value as Track['metadata']['endBehavior'],
              })}
            ><option value="BOUNDARY_UNSPECIFIED">Leave as is</option><option value="LEAVE"
              >Leave</option
            ><option value="OFF">Turn off</option><option value="ON">Turn on</option></select
          ></label
        >
        <label
          >Preshow duration <input
            aria-label="Preshow duration"
            type="number"
            min="0"
            value={session.track.metadata.preshowDurationMs ?? 0}
            onchange={(event) =>
              session.setMetadata({
                preshowDurationMs: Math.max(
                  0,
                  Number((event.currentTarget as HTMLInputElement).value)
                ),
              })}
          /> ms</label
        >
        <label
          >Preshow state <select
            aria-label="Preshow state"
            value={session.track.metadata.preshowState ?? 'PRESHOW_UNSPECIFIED'}
            onchange={(event) =>
              session.setMetadata({
                preshowState: (event.currentTarget as HTMLSelectElement)
                  .value as Track['metadata']['preshowState'],
              })}
            ><option value="PRESHOW_UNSPECIFIED">Not set</option><option value="PRESHOW_DIM"
              >Dim</option
            ><option value="PRESHOW_OFF">Off</option><option value="PRESHOW_WARM">Warm</option
            ></select
          ></label
        >
        <label
          >Credits start <input
            aria-label="Credits start"
            type="number"
            min="0"
            value={session.track.metadata.creditsStartMs ?? 0}
            onchange={(event) =>
              session.setMetadata({
                creditsStartMs: Math.max(
                  0,
                  Number((event.currentTarget as HTMLInputElement).value)
                ),
              })}
          /> ms</label
        >
        <label
          >Credits behavior <select
            aria-label="Credits behavior"
            value={session.track.metadata.creditsBehavior ?? 'CREDITS_UNSPECIFIED'}
            onchange={(event) =>
              session.setMetadata({
                creditsBehavior: (event.currentTarget as HTMLSelectElement)
                  .value as Track['metadata']['creditsBehavior'],
              })}
            ><option value="CREDITS_UNSPECIFIED">Continue</option><option value="CREDITS_CONTINUE"
              >Continue</option
            ><option value="CREDITS_DIM_UP">Dim up</option><option value="CREDITS_RAISE"
              >Raise</option
            ><option value="CREDITS_OFF">Turn off</option></select
          ></label
        >
        <button onclick={() => (settingsOpen = false)}>Done</button>
      </div>
    </div>
  {/if}
  {#if leavePrompt}
    <div class="modal-backdrop">
      <div class="leave-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title">
        <h2 id="leave-title">Save changes to {session.track?.metadata.title ?? 'this track'}?</h2>
        <p>Studio keeps a recovery copy while you edit.</p>
        <button onclick={() => void saveAndLeave()}>Save</button>
        <button
          onclick={() => {
            leavePrompt = false;
            location.hash = `#/movie/${encodeURIComponent(session.item?.itemId ?? '')}`;
          }}>Don't save</button
        >
        <button onclick={() => (leavePrompt = false)}>Cancel</button>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(html),
  :global(body) {
    height: 100%;
    margin: 0;
    background: #0b0b16;
    color: #e2e8f0;
    font:
      14px/1.4 system-ui,
      sans-serif;
  }
  .route-status {
    min-height: 100dvh;
    box-sizing: border-box;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 12px;
    padding: 32px;
    text-align: center;
    background: #0b0b16;
  }
  .route-status p {
    margin: 0;
    color: #b7b7c8;
  }
  .route-status a {
    color: #a9bcff;
  }
  .editor-hidden {
    display: none;
  }
  .editor {
    height: 100dvh;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    background: #0b0b16;
  }
  button,
  input,
  select,
  textarea {
    color: inherit;
    background: #1a1a2e;
    border: 1px solid #39415b;
    border-radius: 5px;
    padding: 6px 9px;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .menubar {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 4px 12px;
    background: #141422;
    border-bottom: 1px solid #303047;
  }
  .menus {
    display: flex;
    gap: 2px;
  }
  .menu-wrap {
    position: relative;
  }
  .menu-trigger {
    border-color: transparent;
    background: transparent;
  }
  .menu {
    position: absolute;
    z-index: 5;
    top: 100%;
    left: 0;
    min-width: 230px;
    padding: 5px;
    display: grid;
    background: #202033;
    border: 1px solid #41415a;
    box-shadow: 0 8px 24px #0009;
  }
  .menu button,
  .menu a {
    display: flex;
    justify-content: space-between;
    color: inherit;
    text-decoration: none;
    text-align: left;
    border: 0;
    background: transparent;
    padding: 8px;
  }
  .menu button:hover,
  .menu a:hover {
    background: #343450;
  }
  .track-title {
    max-width: 22vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .save-state {
    color: #cbd5e1;
    font-size: 12px;
  }
  .room-picker {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  .primary {
    background: #4f46e5;
    border-color: #6366f1;
  }
  .file-input {
    display: none;
  }
  .no-room {
    padding: 7px 14px;
    background: #29233b;
  }
  .no-room a {
    color: #c4b5fd;
    margin-left: 6px;
  }
  .workspace {
    grid-row: 3;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(210px, 38vh);
  }
  .movie-column {
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 12px;
  }
  .video-stage {
    flex: 1;
    min-height: 0;
    background: #000;
    display: grid;
    place-items: center;
    position: relative;
  }
  .video-stage video {
    max-width: 100%;
    max-height: 100%;
    pointer-events: none;
  }
  .region {
    position: absolute;
    z-index: 1;
    border: 1px solid #fff4;
    border-radius: 6px;
    pointer-events: none;
    mix-blend-mode: screen;
  }
  .SPATIAL_LEFT {
    top: 8%;
    left: 4%;
    width: 16%;
    height: 16%;
  }
  .SPATIAL_CENTER,
  .SPATIAL_BEHIND_SCREEN {
    top: 8%;
    left: 42%;
    width: 16%;
    height: 16%;
  }
  .SPATIAL_RIGHT {
    top: 8%;
    right: 4%;
    width: 16%;
    height: 16%;
  }
  .SPATIAL_SURROUND_LEFT {
    bottom: 8%;
    left: 4%;
    width: 18%;
    height: 16%;
  }
  .SPATIAL_SURROUND_RIGHT {
    bottom: 8%;
    right: 4%;
    width: 18%;
    height: 16%;
  }
  .SPATIAL_AMBIENT,
  .SPATIAL_CEILING,
  .SPATIAL_FLOOR {
    bottom: 2%;
    left: 22%;
    width: 56%;
    height: 10%;
  }
  .play-reason {
    position: absolute;
    z-index: 1;
    bottom: 4px;
    background: #111c;
    padding: 4px 8px;
  }
  .transport {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
    padding: 10px 0;
  }
  .transport time {
    font-variant-numeric: tabular-nums;
    margin-left: 8px;
  }
  .inspector {
    padding: 16px;
    border-left: 1px solid #303047;
    overflow: auto;
  }
  .inspector h2 {
    font-size: 16px;
  }
  .inspector label {
    display: grid;
    gap: 5px;
    margin: 12px 0;
  }
  .timeline {
    grid-column: 1 / -1;
    min-height: 0;
    border-top: 1px solid #303047;
    padding: 8px 12px;
  }
  .timeline-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
  }
  .layout-picker {
    margin-right: auto;
  }
  .timeline-scroll {
    overflow: auto;
    height: calc(100% - 38px);
  }
  .ruler {
    height: 30px;
    display: flex;
    justify-content: space-between;
    position: relative;
    align-items: center;
    border-bottom: 1px solid #596078;
    cursor: ew-resize;
    touch-action: none;
  }
  .ruler span {
    font-size: 11px;
    color: #aab1c5;
    pointer-events: none;
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: -500px;
    width: 2px;
    background: #fb7185;
    pointer-events: none;
  }
  .lane-row {
    height: 40px;
    display: grid;
    grid-template-columns: 150px minmax(400px, 1fr);
    border-bottom: 1px solid #303047;
  }
  .lane-header {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .lane-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 0;
    background: transparent;
  }
  .history-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .history-swatches button {
    width: 22px;
    height: 22px;
    padding: 0;
  }
  .rgb-fields {
    display: flex;
    gap: 6px;
  }
  .rgb-fields label {
    min-width: 0;
    flex: 1;
  }
  .lane {
    position: relative;
    background: linear-gradient(90deg, #181827, #202033);
    cursor: crosshair;
  }
  .lane-empty {
    position: absolute;
    left: 12px;
    top: 10px;
    color: #777f98;
    font-size: 11px;
    pointer-events: none;
  }
  .color-segment {
    position: absolute;
    top: 0;
    bottom: 0;
    opacity: 0.3;
    pointer-events: none;
  }
  .diamond {
    position: absolute;
    top: 12px;
    width: 14px;
    height: 14px;
    padding: 0;
    transform: translateX(-50%) rotate(45deg);
    border: 2px solid #111;
  }
  .diamond.selected {
    outline: 2px solid white;
  }
  .effect-block {
    position: absolute;
    top: 5px;
    bottom: 5px;
    min-width: 24px;
    padding: 0;
    overflow: hidden;
    background: #4338ca;
    border-color: #818cf8;
    border-radius: 4px;
  }
  .alert {
    position: fixed;
    right: 12px;
    bottom: 12px;
    padding: 10px;
    background: #542b35;
    border-radius: 6px;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: #000a;
  }
  .settings-dialog {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 14px;
    width: min(720px, calc(100vw - 32px));
    max-height: 90vh;
    overflow: auto;
    padding: 20px;
    border: 1px solid #52526a;
    border-radius: 10px;
    background: #171728;
  }
  .settings-dialog h2,
  .settings-dialog button {
    grid-column: 1 / -1;
  }
  .settings-dialog label {
    display: grid;
    align-content: start;
    gap: 5px;
  }
  .leave-dialog {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    max-width: 440px;
    padding: 20px;
    border: 1px solid #52526a;
    border-radius: 10px;
    background: #171728;
  }
  .leave-dialog h2,
  .leave-dialog p {
    width: 100%;
    margin: 0;
  }
  @media (max-width: 750px) {
    .workspace {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(260px, 1fr) auto minmax(200px, 38vh);
      overflow: auto;
    }
    .inspector {
      border: 0;
      border-top: 1px solid #303047;
    }
    .timeline {
      grid-column: 1;
    }
    .track-title {
      display: none;
    }
    .menubar {
      gap: 5px;
      flex-wrap: wrap;
    }
  }
</style>
