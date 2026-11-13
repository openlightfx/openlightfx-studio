<script lang="ts">
  import { onMount } from 'svelte';
  import { L1_SHORTCUTS, visibleMarks } from '$lib/domain';
  import { formatClock, StudioSession } from '$lib/studio/session.svelte';

  const LANE_H = 48;
  const session = new StudioSession();
  let canvas = $state<HTMLCanvasElement | null>(null);
  let video = $state<HTMLVideoElement | null>(null);
  let drag: { x: number; y: number; moved: boolean } | null = null;

  onMount(() => {
    document.body.dataset.frameP95Ms = String(session.frameP95);
    const stop = session.startAutosave();
    void session.boot().then(() => {
      document.body.dataset.frameP95Ms = String(session.frameP95);
    });
    let frame = 0;
    const loop = () => {
      session.syncFromVideo();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      stop();
      cancelAnimationFrame(frame);
    };
  });

  $effect(() => {
    if (video) session.bindVideo(video);
  });

  $effect(() => {
    const node = canvas;
    const track = session.track;
    const px = session.pxPerMs;
    const scroll = session.scrollX;
    const playhead = session.playheadMs;
    const selected = session.selection;
    if (!node) return;
    const width = node.clientWidth || 640;
    const height = Math.max(LANE_H * Math.max(track?.channels.length ?? 1, 2), 120);
    node.width = width;
    node.height = height;
    session.laneWidth = width;
    const ctx = node.getContext('2d');
    if (!ctx || !track) return;
    ctx.clearRect(0, 0, width, height);
    track.channels.forEach((channel, index) => {
      ctx.fillStyle = index % 2 ? '#141428' : '#1a1a2e';
      ctx.fillRect(0, index * LANE_H, width, LANE_H);
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, index * LANE_H + LANE_H - 1, width, 1);
    });
    const marks = visibleMarks(track.keyframes, scroll / px, (scroll + width) / px);
    for (const mark of marks) {
      const index = track.channels.findIndex((channel) => channel.id === mark.channelId);
      if (index < 0) continue;
      const x = mark.timestampMs * px - scroll;
      const y = index * LANE_H + LANE_H / 2;
      ctx.fillStyle = `rgb(${mark.color.r},${mark.color.g},${mark.color.b})`;
      ctx.strokeStyle = selected.includes(mark.id) ? '#f8fafc' : '#0f172a';
      ctx.beginPath();
      ctx.rect(x - 5, y - 8, 10, 16);
      ctx.fill();
      ctx.stroke();
    }
    ctx.strokeStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(playhead * px - scroll, 0);
    ctx.lineTo(playhead * px - scroll, height);
    ctx.stroke();
  });

  function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
      if (typing) return;
      event.preventDefault();
      session.helpOpen = true;
      return;
    }
    if (typing) return;
    if (
      target?.tagName === 'BUTTON' &&
      target.getAttribute('aria-label') !== 'Play' &&
      target.getAttribute('aria-label') !== 'Pause' &&
      event.key === ' '
    ) {
      return;
    }
    const key = event.key;
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && key.toLowerCase() === 's') {
      event.preventDefault();
      void session.save();
      return;
    }
    if (ctrl && event.shiftKey && key.toLowerCase() === 'z') {
      event.preventDefault();
      session.redo();
      return;
    }
    if (ctrl && key.toLowerCase() === 'z') {
      event.preventDefault();
      session.undo();
      return;
    }
    if (key === ' ' || key === 'Spacebar') {
      event.preventDefault();
      session.togglePlay();
      return;
    }
    if (key === 'k' || key === 'K') {
      session.addAtPlayhead();
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      session.deleteSelection();
      return;
    }
    if (key === 'ArrowRight' && event.shiftKey) {
      event.preventDefault();
      session.skip(1);
      return;
    }
    if (key === 'ArrowLeft' && event.shiftKey) {
      event.preventDefault();
      session.skip(-1);
      return;
    }
    if (key === 'ArrowRight') {
      event.preventDefault();
      session.step(1);
      return;
    }
    if (key === 'ArrowLeft') {
      event.preventDefault();
      session.step(-1);
      return;
    }
    if (key === 'v' || key === 'V') return;
    if (key === 'i' || key === 'I') {
      void session.eyedrop();
      return;
    }
    if (key === ']' || key === '[' || key === '\\' || key === '+' || key === '=' || key === '0') {
      session.zoomKey(key, ctrl);
    }
  }

  function pointerTime(event: MouseEvent): { x: number; y: number } {
    const rect = canvas?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }

  function onCanvasDown(event: MouseEvent) {
    const point = pointerTime(event);
    drag = { ...point, moved: false };
  }

  function onCanvasMove(event: MouseEvent) {
    if (!drag) return;
    const point = pointerTime(event);
    if (Math.hypot(point.x - drag.x, point.y - drag.y) > 4) drag.moved = true;
  }

  function onCanvasUp(event: MouseEvent) {
    if (!drag || !canvas) return;
    const point = pointerTime(event);
    if (drag.moved) session.marquee(drag.x, drag.y, point.x, point.y, LANE_H);
    else session.selectAt(point.x, point.y, LANE_H);
    drag = null;
  }

  function onDblClick(event: MouseEvent) {
    const point = pointerTime(event);
    const index = Math.floor(point.y / LANE_H);
    const channel = session.channels[index]?.id ?? session.activeChannelId;
    const time = (point.x + session.scrollX) / session.pxPerMs;
    session.insertAt(time, channel);
  }

  const safety = $derived(session.safetyLabel());
  const title = $derived(
    session.item?.name ?? session.track?.metadata.title ?? 'OpenLightFX Studio'
  );
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <header class="top">
    <strong>{title}</strong>
    {#if session.dirty}<span>Unsaved</span>{/if}
    {#if session.localDev}<span>Local dev</span>{/if}
    {#if session.restored}<span>{session.restored}</span>{/if}
    {#if session.adminMessage}<span>{session.adminMessage}</span>{/if}
    <span class="spacer"></span>
    <button type="button" onclick={() => session.save()}>Save</button>
    <button type="button" onclick={() => session.undo()} disabled={!session.canUndo}>Undo</button>
    <button type="button" onclick={() => session.redo()} disabled={!session.canRedo}>Redo</button>
    <button type="button" onclick={() => (session.helpOpen = true)}>Shortcuts</button>
    {#if session.nonAdmin || session.adminMessage}
      <button type="button" onclick={() => session.download()}>Download</button>
    {/if}
  </header>

  <div class="middle">
    <aside>
      <input
        role="searchbox"
        aria-label="Search movies"
        placeholder="Search"
        oninput={(event) => session.loadItems((event.target as HTMLInputElement).value)}
      />
      {#if session.capped}<p>The list is capped. Search narrows it.</p>{/if}
      <div role="listbox" data-library aria-label="Movies">
        {#each session.items as item (item.itemId)}
          <button
            type="button"
            role="option"
            aria-label={item.name}
            aria-selected={session.item?.itemId === item.itemId}
            onclick={() => session.selectItem(item.itemId)}
          >
            {item.year || 'movie'}
          </button>
        {/each}
      </div>
      {#if session.localDev}
        <label class="file">
          H.264 MP4
          <input
            type="file"
            accept="video/mp4,.mp4,.mkv,.lightfx,application/octet-stream"
            onchange={(event) => {
              const file = (event.target as HTMLInputElement).files?.[0];
              if (!file) return;
              if (file.name.toLowerCase().endsWith('.lightfx')) void session.importFile(file);
              else session.onLocalFile(file);
            }}
          />
        </label>
      {/if}
      {#if session.localError}<p>{session.localError}</p>{/if}
      {#if session.bulbs.length === 0}<p>No bulbs are configured</p>{/if}
      {#if session.photosensitivity}<p>{session.photosensitivity}</p>{/if}
    </aside>

    <section class="stage">
      <div class="movie">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={video}
          src={session.videoSrc || undefined}
          muted
          playsinline
          preload="auto"
          onplay={() => (session.playing = true)}
          onpause={() => (session.playing = false)}
          onerror={() => session.onVideoError()}
        ></video>
        {#each session.channels as channel (channel.id)}
          <div
            class="region {channel.spatialHint}"
            data-region={channel.spatialHint}
            data-overlay-rgb={session.sampleRgb(channel.id)}
            hidden={session.regionHidden(channel.id)}
            style="background: rgba({session.sampleRgb(channel.id)}, 0.85)"
          ></div>
        {/each}
      </div>
      <div class="transport">
        <button
          type="button"
          aria-label={session.playing ? 'Pause' : 'Play'}
          aria-describedby="transport-reason"
          disabled={!session.canPlay}
          onclick={() => session.togglePlay()}
        >
          {session.playing ? 'Pause' : 'Play'}
        </button>
        <span id="transport-reason">{session.playReason}</span>
        {#if session.videoError}
          <button type="button" onclick={() => session.retryProxy()}>Retry</button>
        {/if}
        <button type="button" onclick={() => session.skip(-1)}>Skip back 5 seconds</button>
        <button type="button" onclick={() => session.skip(1)}>Skip forward 5 seconds</button>
        <input
          type="range"
          aria-label="Scrub"
          aria-valuemin="0"
          aria-valuemax={session.durationMs() || 0}
          aria-valuenow={Math.round(session.playheadMs)}
          min="0"
          max={session.durationMs() || 0}
          value={session.playheadMs}
          oninput={(event) => session.seek(Number((event.target as HTMLInputElement).value))}
        />
        <span class="clock">{formatClock(session.playheadMs)}</span>
        <span class="clock">{formatClock(session.durationMs())}</span>
      </div>
    </section>

    <aside class="props" data-keyframe-popover>
      <label
        >Title <input
          aria-label="Title"
          value={session.track?.metadata.title ?? ''}
          oninput={(event) => session.setTitle((event.target as HTMLInputElement).value)}
        /></label
      >
      <label>Brightness <input aria-label="Brightness" value={session.brightnessText} /></label>
      <label
        >Color <input
          aria-label="Hex"
          value={session.hex}
          oninput={(event) => session.setHex((event.target as HTMLInputElement).value)}
        /></label
      >
      {#if session.hexError}<p>{session.hexError}</p>{/if}
      <label>Green <input aria-label="Green" value={session.green} /></label>
      <label
        ><input
          type="radio"
          name="mode"
          checked={!session.kelvinOn}
          onchange={() => session.setKelvinMode(false)}
        /> RGB</label
      >
      <label
        ><input
          type="radio"
          name="mode"
          aria-label="Kelvin mode"
          checked={session.kelvinOn}
          onchange={() => session.setKelvinMode(true)}
        /> Kelvin mode</label
      >
      <label
        >Kelvin <input
          aria-label="Kelvin"
          inputmode="numeric"
          value={session.kelvin}
          oninput={(event) => session.setKelvinValue((event.target as HTMLInputElement).value)}
        /></label
      >
      {#if session.kelvinError}<p>{session.kelvinError}</p>{/if}
      <p>Interpolation</p>
      <label><input type="radio" name="interpolation" checked /> Step</label>
      <label><input type="radio" name="interpolation" /> Linear</label>
      {#if session.activeChannelId}
        <label
          >Spatial <input
            aria-label="Spatial"
            value={session.channels.find((channel) => channel.id === session.activeChannelId)
              ?.spatialHint ?? ''}
          /></label
        >
        <p>Does not change plugin playback</p>
      {/if}
      <div data-color-history>
        {#each session.historyColors as swatch, index (index)}
          <button type="button" style="background: {swatch}" aria-label="Color history {index + 1}"
          ></button>
        {/each}
      </div>
      <p>
        {session.activeChannelId ?? 'channel'}
        {Math.floor(session.playheadMs / 60000)}:{String(
          Math.floor(session.playheadMs / 1000) % 60
        ).padStart(2, '0')}
      </p>
      {#if safety.intense}<p>Intense</p>{/if}
      {#if safety.flashing}<p>Flashing</p>{/if}
      {#if session.importWarning}
        <button type="button" onclick={() => session.useMovieDuration()}>Use movie duration</button>
      {/if}
    </aside>
  </div>

  <div
    class="timeline"
    data-playhead
    data-playhead-ms={Math.round(session.playheadMs)}
    data-follow={session.playing ? 'on' : 'off'}
    data-scroll-x={session.scrollX}
    data-fit={session.fit ? 'true' : 'false'}
    data-channel-order={session.order}
    data-solo={session.solo.left ? 'left' : session.solo.right ? 'right' : ''}
  >
    <div class="lanes">
      {#each session.channels as channel (channel.id)}
        <div
          class="lane-label"
          oncontextmenu={(event) => {
            event.preventDefault();
            session.menuChannel = channel.id;
          }}
          onpointerdown={(event) => {
            const startY = event.clientY;
            const id = channel.id;
            let swapped = false;
            const move = (ev: PointerEvent) => {
              if (swapped) return;
              if (ev.clientY < startY - 24) {
                swapped = true;
                session.reorder(id, -1);
              } else if (ev.clientY > startY + 24) {
                swapped = true;
                session.reorder(id, 1);
              }
            };
            const up = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
        >
          {channel.displayName}
        </div>
      {/each}
      {#if session.menuChannel}
        <div role="menu">
          <button
            type="button"
            role="menuitem"
            onclick={() => session.toggleMute(session.menuChannel!)}>Mute</button
          >
        </div>
      {/if}
    </div>
    <canvas
      bind:this={canvas}
      onpointerdown={onCanvasDown}
      onpointermove={onCanvasMove}
      onpointerup={onCanvasUp}
      ondblclick={onDblClick}
      onwheel={(event) => {
        session.scrollX = Math.max(0, session.scrollX + event.deltaY);
      }}
    ></canvas>
    <div class="zoom">
      <button type="button" onclick={() => session.zoomKey(']', false)}>Zoom in</button>
      <button type="button" onclick={() => session.zoomKey('[', false)}>Zoom out</button>
      <button type="button" onclick={() => session.zoomFit()}>Zoom to fit</button>
      <span data-testid="px-per-ms">{session.pxPerMs}</span>
      <span>Snap</span>
      <label
        >Minimum spacing <input
          aria-label="Minimum spacing"
          value={session.minSpacingMs}
          oninput={(event) => session.setSpacing((event.target as HTMLInputElement).value)}
        /></label
      >
      {#if session.spacingError}<span>{session.spacingError}</span>{/if}
      <button type="button" onclick={() => session.toggleSolo('left')}>Solo left</button>
      <button type="button" onclick={() => session.toggleMute('right')}>Mute right</button>
      <button type="button" onclick={() => session.toggleMute('left')}>Mute left</button>
      <button type="button" onclick={() => (session.adding = true)}>Add channel</button>
      <button type="button" onclick={() => (session.mappingOpen = true)}>Map bulbs</button>
      {#if session.mappingOpen}<p>A bulb follows one channel</p>{/if}
      <button type="button" onclick={() => void session.eyedrop()}>Eyedropper</button>
      <button type="button">Overlay</button>
      {#if session.playbackActive}
        <button type="button">Use bulbs for editing</button>
      {/if}
    </div>
    <div
      class="minimap"
      data-minimap
      role="img"
      aria-label="Minimap"
      onclick={() => session.seek(session.durationMs() / 2)}
    ></div>
    {#if session.trackChoices.length > 1}
      <div class="choices">
        {#each session.trackChoices as choice (choice.trackId)}
          <button type="button" onclick={() => session.openTrack(choice)}>{choice.title}</button>
        {/each}
        <button type="button" onclick={() => session.chooseNewTrack()}>New track</button>
      </div>
    {/if}
    {#if session.adding}
      <form
        onsubmit={(event) => {
          event.preventDefault();
          session.addChannelById(session.channelIdDraft);
        }}
      >
        <label
          >id <input
            aria-label="id"
            value={session.channelIdDraft}
            oninput={(event) => (session.channelIdDraft = (event.target as HTMLInputElement).value)}
          /></label
        >
        <button type="submit">Add</button>
      </form>
    {/if}
  </div>
</div>

<div role="status">{session.status}</div>
{#if session.alert}<div role="alert">{session.alert}</div>{/if}
{#if session.helpOpen}
  <div role="dialog" aria-label="Shortcuts">
    <h2>Shortcuts</h2>
    <p>Eyedropper</p>
    <ul>
      {#each L1_SHORTCUTS as binding (binding.action)}
        <li>{binding.action}: {binding.keys.join(' ')}</li>
      {/each}
    </ul>
    <button type="button" onclick={() => (session.helpOpen = false)}>Close</button>
  </div>
{/if}

<style>
  :global(html),
  :global(body) {
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #0f0f1a;
    color: #e2e8f0;
  }
  .shell {
    height: 100%;
    display: grid;
    grid-template-rows: 36px minmax(0, 1fr) minmax(150px, 34vh);
    overflow: hidden;
    background: #0f0f1a;
    color: #e2e8f0;
    font:
      13px/1.3 system-ui,
      sans-serif;
  }
  .top,
  .zoom,
  .transport,
  .lanes {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .top {
    padding: 0 8px;
    background: #141428;
  }
  .spacer {
    flex: 1;
  }
  button,
  input,
  select {
    background: #1a1a2e;
    color: inherit;
    border: 1px solid #334155;
  }
  .middle {
    display: grid;
    grid-template-columns: minmax(120px, 200px) minmax(0, 1fr) minmax(160px, 260px);
    min-height: 0;
    overflow: hidden;
  }
  aside,
  .stage {
    min-width: 0;
    overflow: auto;
  }
  .stage {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .movie {
    position: relative;
    flex: 1;
    min-height: 0;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  video {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .region {
    position: absolute;
    pointer-events: none;
  }
  .SPATIAL_LEFT {
    top: 0;
    left: 0;
    width: 18%;
    height: 15%;
  }
  .SPATIAL_RIGHT {
    top: 0;
    right: 0;
    width: 18%;
    height: 15%;
  }
  .transport {
    padding: 4px 8px;
  }
  .transport input[type='range'] {
    flex: 1;
  }
  .clock {
    font-variant-numeric: tabular-nums;
  }
  .timeline {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #101022;
  }
  canvas {
    width: 100%;
    height: 96px;
    display: block;
  }
  .lane-label {
    width: 88px;
    height: 24px;
  }
  .minimap {
    height: 48px;
    background: #1e293b;
  }
  .props {
    padding: 8px;
  }
  .file {
    display: block;
  }
</style>
