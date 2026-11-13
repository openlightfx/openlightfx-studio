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
  const rulerTicks = $derived.by(() => {
    const duration = session.durationMs();
    const px = session.pxPerMs || 0.032;
    const step = px >= 0.08 ? 1000 : px >= 0.03 ? 2000 : 5000;
    const end = Math.max(duration, step);
    const ticks: { x: number; label: string }[] = [];
    for (let time = 0; time <= end; time += step) {
      const minutes = Math.floor(time / 60_000);
      const seconds = Math.floor((time % 60_000) / 1000);
      ticks.push({
        x: time * px - session.scrollX,
        label: `${minutes}:${String(seconds).padStart(2, '0')}`,
      });
    }
    return ticks;
  });
  const playheadX = $derived(session.playheadMs * (session.pxPerMs || 0.032) - session.scrollX);
  const keyframeOpen = $derived(session.selection.length > 0);
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <header class="top">
    <strong class="brand">OpenLightFX</strong>
    <h1>{title}</h1>
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
      <div role="listbox" class="library" data-library aria-label="Movies">
        {#each session.items as item (item.itemId)}
          <button
            type="button"
            role="option"
            class="movie-row"
            aria-label={item.name || 'Untitled'}
            aria-selected={session.item?.itemId === item.itemId}
            onclick={() => session.selectItem(item.itemId)}
          >
            {#if item.posterUrl}<img class="poster" src={item.posterUrl} alt="" />{/if}
            <span class="movie-copy">
              <span class="movie-title">{item.name || 'Untitled'}</span>
              {#if item.year}<span class="movie-year">{item.year}</span>{/if}
            </span>
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
        {#if !session.item}
          <div class="guide" data-empty-state>
            <h2>Light a movie</h2>
            <ol>
              <li>Pick a movie from the library.</li>
              <li>Add a channel for each group of bulbs.</li>
              <li>Click the timeline to add a keyframe.</li>
              <li>Map bulbs, then save.</li>
            </ol>
          </div>
        {/if}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={video}
          hidden={!session.videoSrc}
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
      {#if !session.track}
        <p class="empty-inspector">Open a movie to edit its lighting.</p>
      {:else}
        <label class="field"
          >Title <input
            aria-label="Title"
            value={session.track?.metadata.title ?? ''}
            oninput={(event) => session.setTitle((event.target as HTMLInputElement).value)}
          /></label
        >
      {/if}
      {#if keyframeOpen}
        <label class="field"
          >Brightness <input aria-label="Brightness" value={session.brightnessText} /></label
        >
        <label class="field"
          >Color <input
            aria-label="Hex"
            value={session.hex}
            oninput={(event) => session.setHex((event.target as HTMLInputElement).value)}
          /></label
        >
        {#if session.hexError}<p>{session.hexError}</p>{/if}
        <label class="field">Green <input aria-label="Green" value={session.green} /></label>
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
        <label class="field"
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
      {:else if session.track}
        <p class="empty-inspector">Select a keyframe to edit color and brightness.</p>
      {/if}
      {#if session.activeChannelId}
        <p class="inspector-heading">
          Channel {session.channels.find((channel) => channel.id === session.activeChannelId)
            ?.displayName ?? ''}
        </p>
        <label
          >Spatial <input
            aria-label="Spatial"
            value={session.channels.find((channel) => channel.id === session.activeChannelId)
              ?.spatialHint ?? ''}
          /></label
        >
        <p>Does not change plugin playback</p>
        <p>
          Playhead {Math.floor(session.playheadMs / 60000)}:{String(
            Math.floor(session.playheadMs / 1000) % 60
          ).padStart(2, '0')}
        </p>
      {/if}
      {#if session.track}
        <div data-color-history>
          {#each session.historyColors as swatch, index (index)}
            <button
              type="button"
              style="background: {swatch}"
              aria-label="Color history {index + 1}"
            ></button>
          {/each}
        </div>
      {/if}
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
    <div class="lane-row">
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
            <span class="lane-name">{channel.displayName}</span>
            <button
              type="button"
              aria-label="Solo {channel.id}"
              onclick={() => session.toggleSolo(channel.id)}>Solo</button
            >
            <button
              type="button"
              aria-label="Mute {channel.id}"
              onclick={() => session.toggleMute(channel.id)}>Mute</button
            >
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
      <div class="lane-track">
        <div class="ruler" data-ruler>
          {#each rulerTicks as tick (`${tick.label}:${tick.x}`)}
            <span class="tick" style="left: {tick.x}px">
              <i class="stem"></i>
              {tick.label}
            </span>
          {/each}
          <span class="ruler-head" style="left: {playheadX}px"></span>
        </div>
        <div class="canvas-wrap">
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
          <div class="playhead" style="left: {playheadX}px"></div>
        </div>
      </div>
    </div>
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
    background: #0b0b16;
    color: #e2e8f0;
  }
  .shell {
    height: 100%;
    display: grid;
    grid-template-rows: 48px minmax(0, 1fr) minmax(220px, 36vh);
    overflow: hidden;
    background: #0b0b16;
    color: #e2e8f0;
    font:
      13px/1.35 system-ui,
      sans-serif;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 14px;
    background: #12121f;
    border-bottom: 1px solid #2a2a44;
  }
  .brand {
    color: #a5b4fc;
    letter-spacing: 0.04em;
  }
  h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
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
    border-radius: 6px;
    padding: 4px 8px;
  }
  button {
    cursor: pointer;
  }
  .middle {
    display: grid;
    grid-template-columns: minmax(200px, 280px) minmax(0, 1fr) minmax(200px, 300px);
    min-height: 0;
    overflow: hidden;
  }
  aside,
  .stage {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #10101c;
    border-right: 1px solid #2a2a44;
    padding: 10px;
  }
  .props {
    border-right: 0;
    border-left: 1px solid #2a2a44;
  }
  .library {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .movie-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 6px;
    background: #16162a;
  }
  .movie-row[aria-selected='true'] {
    border-color: #818cf8;
    background: #1e1b4b;
  }
  .poster {
    width: 36px;
    height: 54px;
    object-fit: cover;
    border-radius: 4px;
    background: #312e81;
    flex: none;
  }
  .movie-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .movie-title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .movie-year {
    color: #94a3b8;
    font-size: 12px;
  }
  .stage {
    display: flex;
    flex-direction: column;
    background: #07070f;
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
  .guide {
    position: absolute;
    z-index: 2;
    max-width: 420px;
    margin: 24px;
    padding: 18px 20px;
    border: 1px solid #3730a3;
    border-radius: 12px;
    background: rgba(15, 15, 30, 0.92);
  }
  .guide h2 {
    margin: 0 0 8px;
    font-size: 18px;
  }
  .guide ol {
    margin: 0;
    padding-left: 18px;
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
    top: 8%;
    left: 4%;
    width: 16%;
    height: 12%;
  }
  .SPATIAL_RIGHT {
    top: 8%;
    right: 4%;
    width: 16%;
    height: 12%;
  }
  .transport,
  .zoom,
  .lane-label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .transport {
    padding: 8px 12px;
    background: #12121f;
    border-top: 1px solid #2a2a44;
  }
  .transport input[type='range'] {
    flex: 1;
  }
  .clock {
    font-variant-numeric: tabular-nums;
    color: #cbd5e1;
  }
  .timeline {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #101022;
    border-top: 1px solid #2a2a44;
  }
  .lane-row {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    min-height: 0;
    flex: 1;
  }
  .lanes {
    overflow: auto;
    border-right: 1px solid #2a2a44;
  }
  .lane-label {
    height: 48px;
    padding: 0 8px;
    justify-content: space-between;
  }
  .lane-name {
    width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lane-track {
    position: relative;
    min-width: 0;
    overflow: hidden;
  }
  .ruler {
    position: relative;
    height: 32px;
    overflow: hidden;
    background: #0f172a;
    border-bottom: 1px solid #475569;
  }
  .tick {
    position: absolute;
    top: 2px;
    font-size: 11px;
    color: #e2e8f0;
    font-variant-numeric: tabular-nums;
    transform: translateX(-1px);
  }
  .stem {
    display: block;
    width: 1px;
    height: 14px;
    margin-bottom: 1px;
    background: #94a3b8;
    font-style: normal;
  }
  .ruler-head {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #fb7185;
  }
  .inspector-heading {
    margin: 8px 0 4px;
    font-weight: 600;
  }
  .canvas-wrap {
    position: relative;
  }
  canvas {
    width: 100%;
    height: 96px;
    display: block;
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #fb7185;
    pointer-events: none;
  }
  .zoom {
    padding: 6px 10px;
    flex-wrap: wrap;
  }
  .minimap {
    height: 48px;
    margin: 0 10px 8px;
    border-radius: 6px;
    background: linear-gradient(90deg, #1e293b, #312e81);
  }
  .props {
    padding: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }
  .empty-inspector {
    color: #94a3b8;
  }
  .file {
    display: block;
    margin-top: 8px;
  }
  @media (max-width: 800px) {
    .middle {
      grid-template-columns: 1fr;
    }
    .lane-row {
      grid-template-columns: 140px minmax(0, 1fr);
    }
  }
</style>
